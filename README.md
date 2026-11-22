# Hotel Offer Orchestrator

A TypeScript/Express API that requests offers from two mock hotel suppliers in parallel with a Temporal workflow, keeps the cheapest offer for each hotel name, stores the deduplicated result in Redis, and applies optional price filtering with a Redis sorted set.

## Requirements

- Docker Desktop with Docker Compose
- Node.js 20+ and npm (only needed for running outside Docker)

## Run with Docker Compose

```sh
docker compose up --build
```

The API is available at `http://localhost:3000`, and the Temporal development UI is at `http://localhost:8233`. The compose setup starts Redis, a Temporal development server, the API, and a separate Temporal worker. The Temporal CLI image is pinned to v1.10.0 by digest for repeatable local runs. Temporal's development server is intended for local development; use a managed or production Temporal deployment for production workloads.

To stop the services, run `docker compose down`. Redis data is kept in the `redis-data` volume.

## Run the API and worker locally

Start Redis and a Temporal development server, then:

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

In a second terminal, run `npm run start:worker`. The defaults in `.env.example` target services on localhost.

For development, run `npm run dev` and `npm run dev:worker` in separate terminals.

## API

### `GET /api/hotels?city=delhi`

On a cache miss, calls both supplier endpoints in parallel through Temporal, deduplicates hotels by normalized name, retains the lowest price, persists the result in Redis, and returns the best offers. If one supplier is unavailable, offers from the other supplier are returned. A `502` is returned only when both suppliers fail or the workflow itself fails. Add `refresh=true` to bypass the city cache and fetch current supplier offers.

Optional query parameters `minPrice` and `maxPrice` are inclusive, non-negative numbers. Redis stores the latest complete result per city in a hash and a sorted set indexed by price; `ZRANGEBYSCORE` performs the filter. The cached city result expires after one hour. A partial result from a one-supplier outage is returned for that request but is not marked as a complete cache, so the next request retries both suppliers.

Example response:

```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

The endpoint returns `400` for missing or invalid query values and `502` if both suppliers fail or the workflow fails. A city without offers returns an empty array.

### Redis key layout

Each normalized city has three keys with a one-hour TTL:

- `hotel-offers:<city>:records` is a hash of normalized hotel names to JSON offer records.
- `hotel-offers:<city>:prices` is a sorted set from normalized hotel name to price, used for inclusive range filtering.
- `hotel-offers:<city>:cached` marks that both suppliers completed successfully, including when they returned no hotels. The marker prevents a cached partial outage result from being reused as complete data.

### Mock suppliers

- `GET /supplierA/hotels?city=delhi`
- `GET /supplierB/hotels?city=delhi`

Both endpoints return static sample data and include overlapping names for comparison. The sample data also covers Mumbai and Jaipur.

### `GET /health`

Checks the configured Supplier A and Supplier B endpoints with a two-second timeout and pings Redis. An unavailable supplier or Redis produces a `503` response with `status: "degraded"`. `/live` is a lightweight process liveness endpoint used by Docker Compose so a supplier outage does not prevent the worker from starting.

To simulate a supplier outage with Docker Compose, set `SUPPLIER_A_ENABLED=false` (or `SUPPLIER_B_ENABLED=false`) in `.env` and recreate the API using `docker compose up --build -d api`. The matching mock supplier endpoint then responds with `503`, `/health` reports it as down, and hotel requests continue with offers from the available supplier. The Postman outage request uses `refresh=true` so it checks the live supplier state even if the city has a previous cache.

## Postman

Import [`postman/Hotel-Offer-Orchestrator.postman_collection.json`](postman/Hotel-Offer-Orchestrator.postman_collection.json). Run the collection from top to bottom so the Health request can set the supplier-status variables used by later assertions. It includes live health detection, an outage-aware refresh request, cached city results, price filtering, a no-results city, both supplier endpoints, and input validation, covering normal operation and a single supplier outage without changing its requests.

## Configuration

See `.env.example` for local defaults. Docker Compose supplies container-network addresses automatically. `SUPPLIER_A_ENABLED` and `SUPPLIER_B_ENABLED` can be set to `false` to simulate an outage. Set `LOG_LEVEL` to adjust structured application logging.
