import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { env } from "./config/env";
import { setupErrorHandler } from "./middleware/error-handler";
import { writeRateLimit } from "./middleware/rate-limit";

const app: Express = express();

app.disable("x-powered-by");
if (env.trustProxy) app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use((_req, res, next) => {
  // JSON API: never sniffed, framed or cached by shared caches
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(cors({ origin: env.corsOrigin, credentials: true, maxAge: 600 }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", writeRateLimit(env.rateLimitWritesPerMinute), router);

setupErrorHandler(app);

export default app;
