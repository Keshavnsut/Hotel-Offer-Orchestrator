import "dotenv/config";

function booleanFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "hotel-offer-queue",
  supplierAUrl: process.env.SUPPLIER_A_URL ?? "http://localhost:3000",
  supplierBUrl: process.env.SUPPLIER_B_URL ?? "http://localhost:3000",
  supplierAEnabled: booleanFromEnv(process.env.SUPPLIER_A_ENABLED, true),
  supplierBEnabled: booleanFromEnv(process.env.SUPPLIER_B_ENABLED, true),
};
