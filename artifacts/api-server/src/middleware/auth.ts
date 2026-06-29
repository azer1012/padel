import type { NextFunction, Request, Response } from "express";
import { requireAuth, attachUser, requireAdmin, getUser } from "../utils/auth";
import { AuthorizationError } from "../utils/errors/api-error";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  return (async () => {
    const user = await requireAuth(req);
    attachUser(req, user);
    next();
  })().catch(next);
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = getUser(req);
  if (!user) {
    return next(new AuthorizationError("Authentication required"));
  }

  if (user.role !== "admin") {
    return next(new AuthorizationError("Admin access required"));
  }

  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  return (async () => {
    try {
      const user = await requireAuth(req);
      attachUser(req, user);
    } catch {
      // User is optional, so we don't throw
    }
    next();
  })().catch(next);
}
