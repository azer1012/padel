import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";

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

type Claims = { sub: string; email?: string; exp?: number; aud?: string | string[]; role?: string };

/**
 * Verifies an HS256 Supabase access token locally with SUPABASE_JWT_SECRET
 * (Dashboard → Project Settings → API → JWT secret). Saves a network round-trip
 * to Supabase Auth on every API call. Returns null if invalid or expired.
 */
function verifyLocally(token: string, secret: string): Claims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    if (header.alg !== "HS256") return null;
    const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Claims;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!claims.sub || !aud.includes("authenticated")) return null;
    if (!claims.exp || claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Verifies the Supabase JWT and returns its user id, or null. Throws only on infrastructure errors. */
async function verify(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;
  let id: string, email: string | undefined;
  const header = (() => {
    try {
      return JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));
    } catch {
      return {};
    }
  })();
  if (env.supabaseJwtSecret && header.alg === "HS256") {
    const claims = verifyLocally(token, env.supabaseJwtSecret);
    if (!claims) return null;
    id = claims.sub;
    email = claims.email;
  } else {
    // Asymmetric keys or no secret configured: ask Supabase Auth
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    id = data.user.id;
    email = data.user.email ?? undefined;
  }
  (req as AuthenticatedRequest).authUserId = id;
  (req as AuthenticatedRequest).authEmail = email;
  return { id, email };
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
