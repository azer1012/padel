// Must stay the first import: it loads .env before @workspace/db reads DATABASE_URL.
import { env } from "./config/env";
import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { startScheduler } from "./jobs";

const rawPort = env.port ?? "3001";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (env.nodeEnv === "production") {
  if (env.corsOrigin === true)
    logger.warn("CORS_ORIGIN is not set: any website can call this API from a browser");
  if (!env.frontendUrl)
    logger.warn("FRONTEND_URL is not set: invite links and emails will be broken");
}

// Safety net: log instead of crashing on a stray rejected promise
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port, tz: process.env.TZ }, "Server listening");
  if (env.jobsEnabled) startScheduler();
});

// Graceful shutdown: finish in-flight requests (and their DB transactions) first
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
