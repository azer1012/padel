import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AuthenticationError, AuthorizationError } from "./errors/api-error";
import { logger } from "../lib/logger";

export interface AuthenticatedUser {
  id: number;
  supabaseAuthId: string;
  email: string;
  role: "admin" | "player";
}

export async function extractBearerToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

export async function verifyToken(token: string): Promise<{ sub: string }> {
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    logger.debug({ error }, "Token verification failed");
    throw new AuthenticationError("Invalid or expired token");
  }

  return { sub: user.id };
}

export async function loadAppUser(supabaseAuthId: string): Promise<AuthenticatedUser> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.supabaseAuthId, supabaseAuthId),
  });

  if (!user) {
    throw new AuthenticationError("User not found");
  }

  return {
    id: user.id,
    supabaseAuthId: user.supabaseAuthId,
    email: user.email,
    role: user.role,
  };
}

export async function requireAuth(req: Request): Promise<AuthenticatedUser> {
  const token = await extractBearerToken(req);
  if (!token) {
    throw new AuthenticationError("Authorization header missing");
  }

  const { sub } = await verifyToken(token);
  const user = await loadAppUser(sub);

  return user;
}

export async function requireAdmin(user: AuthenticatedUser): Promise<void> {
  if (user.role !== "admin") {
    throw new AuthorizationError("Admin access required");
  }
}

export function attachUser(req: Request, user: AuthenticatedUser): void {
  (req as any).user = user;
}

export function getUser(req: Request): AuthenticatedUser | undefined {
  return (req as any).user;
}
