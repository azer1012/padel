import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { HttpError } from "./http";
import { demoAccountOnly, isDemoEmail } from "./demo";

/** A row of public.users: the member behind a request. */
export type DbUser = typeof usersTable.$inferSelect;

/** What the middlewares below attach to a request. Read it with the accessors, never by casting. */
type AuthenticatedRequest = Request & {
  authUserId?: string;
  authEmail?: string;
  dbUser?: DbUser;
};

const unauthorized = () => new HttpError(401, "Unauthorized", "UNAUTHORIZED");
const noProfile = () =>
  new HttpError(401, "User not found. Please complete registration.", "PROFILE_MISSING");

/** The signed-in member. Use behind requireUser / requireAdmin. */
export function currentUser(req: Request): DbUser {
  const user = (req as AuthenticatedRequest).dbUser;
  if (!user) throw unauthorized();
  return user;
}

/** The signed-in member, or null for a visitor. Use behind loadUser (public routes). */
export function optionalUser(req: Request): DbUser | null {
  return (req as AuthenticatedRequest).dbUser ?? null;
}

/** The Supabase identity of the access token (id and verified e-mail). Use behind requireAuth. */
export function authIdentity(req: Request): { id: string; email?: string } {
  const { authUserId, authEmail } = req as AuthenticatedRequest;
  if (!authUserId) throw unauthorized();
  return { id: authUserId, email: authEmail };
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

type Claims = { sub: string; email?: string; exp?: number; aud?: string | string[]; role?: string };

const decodeJson = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

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
    if (decodeJson(h).alg !== "HS256") return null;
    const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const claims = decodeJson(p) as Claims;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!claims.sub || !aud.includes("authenticated")) return null;
    if (!claims.exp || claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function tokenAlgorithm(token: string): unknown {
  try {
    return decodeJson(token.split(".")[0] ?? "").alg;
  } catch {
    return undefined;
  }
}

/** Verifies the Supabase JWT and returns its user id, or null. Throws only on infrastructure errors. */
async function verify(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;
  let id: string, email: string | undefined;
  if (env.supabaseJwtSecret && tokenAlgorithm(token) === "HS256") {
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
  // The public demo only lets its own invented accounts in (lib/demo.ts)
  if (user && env.demoMode && !isDemoEmail(user.email)) throw demoAccountOnly();
  // Blocked by the club: nothing answers but the public pages (as a visitor)
  if (user?.blockedAt)
    throw new HttpError(403, "This account is suspended: contact the club", "ACCOUNT_BLOCKED");
  if (user) (req as AuthenticatedRequest).dbUser = user;
  return user ?? null;
}

// Every middleware below forwards its errors to Express: refusals leave through the
// error handler as { error, code }, and an unexpected failure never becomes an
// unhandled rejection that would crash the whole process.

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!(await verify(req))) throw unauthorized();
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth: attaches the member when a valid token is present, otherwise
 * continues as an anonymous visitor (public pages like the booking calendar).
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    // A refused account (demo mode, blocked by the club) browses the public pages as a visitor
    if (await verify(req).catch(() => null)) await loadDbUser(req).catch(() => null);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!(await verify(req))) throw unauthorized();
    if (!(await loadDbUser(req))) throw noProfile();
    next();
  } catch (err) {
    next(err);
  }
}

/** The role is read from public.users on every request, never from the token. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!(await verify(req))) throw unauthorized();
    const user = await loadDbUser(req);
    if (!user) throw noProfile();
    if (user.role !== "admin")
      throw new HttpError(403, "Forbidden: admin access required", "FORBIDDEN");
    next();
  } catch (err) {
    next(err);
  }
}
