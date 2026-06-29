import type { Express, NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors/api-error";
import { logger } from "../lib/logger";

export function setupErrorHandler(app: Express) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      logger.error(
        {
          code: err.code,
          statusCode: err.statusCode,
          details: err.details,
        },
        err.message,
      );

      return res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details && { details: err.details }),
        },
      });
    }

    if (err instanceof Error) {
      logger.error({ stack: err.stack }, err.message);

      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }

    logger.error({ error: err }, "Unknown error");
    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });
}
