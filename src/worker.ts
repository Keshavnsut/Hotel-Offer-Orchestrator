import { NativeConnection, Worker } from "@temporalio/worker";
import { config } from "./config";
import { logger } from "./logger";
import { connectRedis, redis } from "./redis";
import * as activities from "./activities";

async function connectWithRetry(): Promise<NativeConnection> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      return await NativeConnection.connect({ address: config.temporalAddress });
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
  const connection = await connectWithRetry();
  const worker = await Worker.create({
    connection,
    namespace: config.temporalNamespace,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down Temporal worker");
    worker.shutdown();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  logger.info({ taskQueue: config.taskQueue }, "Temporal worker is running");
  try {
    await worker.run();
  } finally {
    await redis.quit();
    await connection.close();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "Temporal worker failed to start");
  process.exitCode = 1;
});
