import { createClient } from "redis";
import { config } from "./config";
import { logger } from "./logger";

export const redis = createClient({ url: config.redisUrl });

redis.on("error", (error) => {
  logger.error({ err: error }, "Redis connection error");
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}
