import { clerkMiddleware, getAuth, requireAuth as clerkRequireAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const clerkAuth = clerkMiddleware();

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    next();
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (user) {
    (req as any).dbUser = user;
  }
  next();
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!user) {
    res.status(401).json({ error: "User not found. Please complete registration." });
    return;
  }
  (req as any).dbUser = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }
  (req as any).dbUser = user;
  next();
}
