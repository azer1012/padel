import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { supabaseAdmin } from "../config/supabase";

type AuthenticatedRequest = Request & {
  authUserId?: string;
  authEmail?: string;
  dbUser?: typeof usersTable.$inferSelect;
};

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

/** Verifies the Supabase JWT and returns its user, or null. Throws only on infrastructure errors. */
async function verify(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  (req as AuthenticatedRequest).authUserId = data.user.id;
  (req as AuthenticatedRequest).authEmail = data.user.email ?? undefined;
  return data.user;
}

async function loadDbUser(req: Request) {
  const authUserId = (req as AuthenticatedRequest).authUserId;
  if (!authUserId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.supabaseAuthId, authUserId));
  if (user) (req as AuthenticatedRequest).dbUser = user;
  return user ?? null;
}

// Every middleware below forwards unexpected errors to Express (→ 500) instead of
// leaving an unhandled rejection that would crash the whole process.

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await verify(req))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth: attaches dbUser when a valid token is present, otherwise
 * continues as an anonymous visitor (public pages like the booking calendar).
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (await verify(req).catch(() => null)) await loadDbUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await verify(req))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!(await loadDbUser(req))) {
      res.status(401).json({ error: "User not found. Please complete registration." });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await verify(req))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await loadDbUser(req);
    if (!user) {
      res.status(401).json({ error: "User not found. Please complete registration." });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden: admin access required" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
