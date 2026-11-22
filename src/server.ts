import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import { Client, Connection } from "@temporalio/client";
import { config } from "./config";
import { logger } from "./logger";
import { connectRedis, redis } from "./redis";
import { supplierRouter } from "./suppliers/routes";
import { ValidationError } from "./errors";
import type { CompareHotelsInput, HotelOffer, SupplierId } from "./types";

const app = express();
let workflowClient: Client | undefined;
let temporalConnection: Connection | undefined;
app.disable("x-powered-by");
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(supplierRouter);

function parsePrice(value: unknown, name: string): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`Query parameter '${name}' must be a non-negative number`);
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new ValidationError(`Query parameter '${name}' must be a non-negative number`);
  }
  return price;
}

async function supplierStatus(supplier: SupplierId): Promise<"up" | "down"> {
  const baseUrl = supplier === "A" ? config.supplierAUrl : config.supplierBUrl;
  const url = new URL(`/supplier${supplier}/hotels`, baseUrl);
  url.searchParams.set("city", "healthcheck");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

app.get("/live", (_request, response) => response.status(200).json({ status: "ok" }));

app.get("/health", async (_request, response) => {
  const [supplierA, supplierB] = await Promise.all([supplierStatus("A"), supplierStatus("B")]);
  const suppliers = { supplierA, supplierB };
  let redisStatus: "up" | "down" = "up";
  try {
    await redis.ping();
  } catch {
    redisStatus = "down";
  }

  const healthy = Object.values(suppliers).every((status) => status === "up") && redisStatus === "up";
  response.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    suppliers,
    redis: redisStatus,
  });
});

app.get("/api/hotels", async (request, response, next) => {
  try {
    const city = request.query.city;
    if (typeof city !== "string" || city.trim().length === 0) {
      throw new ValidationError("Query parameter 'city' is required");
    }

    const minPrice = parsePrice(request.query.minPrice, "minPrice");
    const maxPrice = parsePrice(request.query.maxPrice, "maxPrice");
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      throw new ValidationError("minPrice must be less than or equal to maxPrice");
    }

    const refreshParam = request.query.refresh;
    if (refreshParam !== undefined && refreshParam !== "true" && refreshParam !== "false") {
      throw new ValidationError("Query parameter 'refresh' must be true or false");
    }

    const input: CompareHotelsInput = {
      city: city.trim().toLowerCase(),
      minPrice,
      maxPrice,
      refresh: refreshParam === "true",
    };
    if (!workflowClient) throw new Error("Temporal client is not ready");
    const handle = await workflowClient.workflow.start("compareHotelsWorkflow", {
      taskQueue: config.taskQueue,
      workflowId: `hotel-offers-${randomUUID()}`,
      workflowExecutionTimeout: "30 seconds",
      args: [input],
    });
    const offers = (await handle.result()) as HotelOffer[];
    response.json(offers.map(({ name, price, supplier, commissionPct }) => ({
      name,
      price,
      supplier,
      commissionPct,
    })));
  } catch (error) {
    next(error);
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  logger.error({ err: error }, "Request failed");
  const isValidationError = error instanceof ValidationError;
  response.status(isValidationError ? 400 : 502).json({
    error: isValidationError ? message : "Hotel offer comparison failed",
    detail: isValidationError ? undefined : message,
  });
};
app.use(errorHandler);

async function connectTemporalWithRetry(): Promise<Connection> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      return await Connection.connect({ address: config.temporalAddress });
    } catch (error) {
      lastError = error;
      logger.warn({ attempt, err: error }, "Waiting for Temporal server");
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1000, 5000)));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  await connectRedis();
  temporalConnection = await connectTemporalWithRetry();
  workflowClient = new Client({ connection: temporalConnection, namespace: config.temporalNamespace });
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "Hotel Offer Orchestrator API is listening");
  });

  const shutdown = (): void => {
    server.close(() => {
      void Promise.all([redis.quit(), temporalConnection?.close()]).finally(() => process.exit(0));
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "API failed to start");
  process.exitCode = 1;
});
