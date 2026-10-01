import type { Express, NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";
import { logger } from "../lib/logger";

/**
 * Every error leaves the API as `{ error: "<human message>", code: "<MACHINE_CODE>" }`.
 * Unexpected errors are logged with their stack and never leak internals to the client.
 */
export function setupErrorHandler(app: Express) {
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      if (err.status >= 500) logger.error({ err, url: req.url }, err.message);
      res.status(err.status).json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }
    // Malformed JSON body
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON body", code: "BAD_JSON" });
      return;
    }
    if ((err as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ error: "Request too large", code: "TOO_LARGE" });
      return;
    }
    logger.error({ err, method: req.method, url: req.url?.split("?")[0] }, "unhandled error");
    res
      .status(500)
      .json({ error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" });
  });
}
