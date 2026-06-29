import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { supabaseAdmin } from "../config/supabase";

type AuthenticatedRequest = Request & {
  authUserId?: string;
  dbUser?: typeof usersTable.$inferSelect;
};

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as AuthenticatedRequest).authUserId = data.user.id;
  next();
}

export async function loadUser(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const authUserId = (req as AuthenticatedRequest).authUserId;
    if (!authUserId) {
      next();
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.supabaseAuthId, authUserId));
    if (user) {
      (req as AuthenticatedRequest).dbUser = user;
    }
    next();
  });
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const authUserId = (req as AuthenticatedRequest).authUserId;
    if (!authUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.supabaseAuthId, authUserId));
    if (!user) {
      res.status(401).json({ error: "User not found. Please complete registration." });
      return;
    }
    (req as AuthenticatedRequest).dbUser = user;
    next();
  });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireUser(req, res, () => {
    const user = (req as AuthenticatedRequest).dbUser;
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Forbidden: admin access required" });
      return;
    }
    next();
  });
}
