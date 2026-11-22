# Hotel Offer Orchestrator

**Hotel Offer Orchestrator** is a backend service built with **Node.js and TypeScript, Express, Temporal, Redis, Docker Compose, and Postman**. It compares offers from two mock hotel suppliers, keeps the lowest price for each hotel name, and filters offers by price range.

## Components

| Component | Role |
| --- | --- |
| Node.js + TypeScript | Runtime and application language |
| Express API | Exposes hotel search, health, and mock supplier endpoints on port `3000` |
| Temporal workflow | Calls both supplier activities in parallel, handles partial supplier failures, and selects the best offer per hotel |
| Temporal worker | Runs the workflow and its supplier and Redis activities on the `hotel-offer-queue` task queue |
| Redis | Stores the latest city offer set and applies price-range filtering with a sorted set |
| Docker Compose | Starts Redis, the Temporal development server, the Express API, and the separate Temporal worker |
| Postman collection | Exercises normal results, filtering, no-results, health, validation, and supplier-outage behavior |

## Run locally with Docker Compose

### Requirements

- Docker Desktop with Docker Compose
- Postman, if you want to run the API collection

Start all services from the repository directory:

```sh
docker compose up --build -d
docker compose ps
```

The API is available at `http://localhost:3000`. The Temporal development UI is at `http://localhost:8233`.

Try the main endpoints:

**macOS / Linux:**

```sh
curl "http://localhost:3000/api/hotels?city=delhi"
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=9000"
curl "http://localhost:3000/health"
```

**Windows PowerShell:**

```powershell
curl.exe "http://localhost:3000/api/hotels?city=delhi"
curl.exe "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=9000"
curl.exe "http://localhost:3000/health"
```

The Delhi response includes **Holtin at 5340 from Supplier B** and **Radison at 5900 from Supplier A**. The price-filtered request returns only offers in the inclusive 5000–9000 range.

Stop the services with:

```sh
docker compose down
```

Redis data is kept in the `redis-data` Docker volume. The Temporal image is pinned to v1.10.0 by digest so local runs use a repeatable image. This Compose setup uses Temporal's development server and is intended for local assessment and demos; no public cloud deployment is configured.

## API

### Hotel search

`GET /api/hotels?city=delhi`

The Temporal workflow fetches both suppliers in parallel when the city cache is missing or when `refresh=true` is supplied. It normalizes hotel names, keeps the lowest-price offer for each name, saves the resulting city data in Redis, and returns:

```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

Optional query parameters `minPrice` and `maxPrice` are inclusive and must be non-negative numbers. Add `refresh=true` to bypass the city cache and fetch the suppliers again.

- A city with no matching offers returns `200` and an empty array.
- If one supplier fails during a fetch, the API returns offers from the other supplier.
- If both suppliers fail during a fetch, the API returns `502`.
- Missing or invalid query parameters return `400`.

### Mock suppliers

- `GET /supplierA/hotels?city=delhi`
- `GET /supplierB/hotels?city=delhi`

Each endpoint returns static hotel records with `hotelId`, `name`, `price`, `city`, and `commissionPct`. The sample catalogs overlap on hotel names so the workflow can compare prices. Data also includes Mumbai and Jaipur.

### Health endpoints

- `GET /health` checks both configured supplier endpoints with a two-second timeout and pings Redis. It reports each supplier as `up` or `down`; unavailable dependencies produce a `503` response with `status: "degraded"`.
- `GET /live` is a lightweight process liveness endpoint used by Docker Compose.

## Redis storage and cache behavior

Each normalized city uses these keys, which expire after one hour:

- `hotel-offers:<city>:records` — a hash of normalized hotel names to JSON offer records.
- `hotel-offers:<city>:prices` — a sorted set indexed by price; Redis uses it for inclusive range filtering.
- `hotel-offers:<city>:cached` — a marker indicating both suppliers completed successfully, including when they returned no offers.

A partial result is not marked as a complete cache, so the next ordinary request retries both suppliers. A forced refresh during a one-supplier outage replaces that city's stored records with the partial result; the previous complete set is not retained.

## Postman

Import [`postman/Hotel-Offer-Orchestrator.postman_collection.json`](postman/Hotel-Offer-Orchestrator.postman_collection.json) and use its default `baseUrl` of `http://localhost:3000`. **Run the collection from top to bottom**: the first Health request stores supplier statuses used by later outage-aware assertions.

To simulate Supplier A being unavailable:

1. Set `SUPPLIER_A_ENABLED=false` in `.env`.
2. Recreate the API: `docker compose up --build -d api`.
3. Run the collection from top to bottom; the hotel request should return `200` with Supplier B offers.
4. Set `SUPPLIER_A_ENABLED=true` and recreate the API to restore normal operation.

## Run the API and worker without Docker

Start Redis and a Temporal development server separately, then create the local environment file and build the project:

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

In another terminal, start the Temporal worker:

```sh
npm run start:worker
```

For development, use `npm run dev` and `npm run dev:worker` in separate terminals. The defaults in `.env.example` point to services running on `localhost`.

Run the merge-logic unit tests with:

```sh
npm test
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Express API port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `hotel-offer-queue` | Workflow task queue shared by API and worker |
| `SUPPLIER_A_URL` / `SUPPLIER_B_URL` | `http://localhost:3000` | Base URLs for the mock supplier routes |
| `SUPPLIER_A_ENABLED` / `SUPPLIER_B_ENABLED` | `true` | Set to `false` to simulate that supplier being unavailable |
| `LOG_LEVEL` | `info` | Structured application log level |

Docker Compose supplies container-network addresses for Redis, Temporal, and the API automatically. `.env.example` contains local defaults.
