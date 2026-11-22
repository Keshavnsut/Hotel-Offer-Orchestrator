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
Copy-Item .env.example .env
npm run build
npm start
```

In a second terminal, run `npm run start:worker`. If using PowerShell, `Copy-Item` is the Windows equivalent of copying the sample environment file. The defaults in `.env.example` target services on localhost.

For development, run `npm run dev` and `npm run dev:worker` in separate terminals.

## API

### `GET /api/hotels?city=delhi`

Calls both supplier endpoints in parallel through Temporal, deduplicates hotels by normalized name, retains the lowest price, persists the result in Redis, and returns the best offers.

Optional query parameters `minPrice` and `maxPrice` are inclusive, non-negative numbers. Redis stores each request's offers in a hash and a sorted set indexed by price; `ZRANGEBYSCORE` performs the filter. Each request snapshot expires after one hour.

Example response:

```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

The endpoint returns `400` for missing or invalid query values and `502` if a supplier or workflow fails. A city without offers returns an empty array.

### Mock suppliers

- `GET /supplierA/hotels?city=delhi`
- `GET /supplierB/hotels?city=delhi`

Both endpoints return static sample data and include overlapping names for comparison. The sample data also covers Mumbai and Jaipur.

### `GET /health`

Returns the status of Supplier A, Supplier B, and Redis. A disabled supplier or unavailable Redis produces a `503` response with `status: "degraded"`.

To simulate a supplier outage with Docker Compose, set `SUPPLIER_A_ENABLED=false` (or `SUPPLIER_B_ENABLED=false`) in `.env` and recreate the API using `docker compose up --build -d api`. The matching mock supplier endpoint then responds with `503`, and `/health` reports it as down.

## Postman

Import [`postman/Hotel-Offer-Orchestrator.postman_collection.json`](postman/Hotel-Offer-Orchestrator.postman_collection.json). It includes the valid city, price-filtered city, no-results city, both supplier endpoints, health, and input-validation requests. Each request includes Postman assertions for its expected status and response shape.

## Configuration

See `.env.example` for local defaults. Docker Compose supplies container-network addresses automatically. `SUPPLIER_A_ENABLED` and `SUPPLIER_B_ENABLED` can be set to `false` to simulate an outage. Set `LOG_LEVEL` to adjust structured application logging.
