import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env";
import { runJobs } from "../jobs";
import { resetDemo } from "../lib/demo-seed";
import { HttpError } from "../lib/http";

const router = Router();

/** For external cron (Supabase pg_cron, GitHub Actions, Cloudflare Cron…). Header: x-cron-secret. */
function assertCron(given: unknown) {
  // Compared as bytes: timingSafeEqual throws on buffers of different lengths
  const value = Buffer.from(String(given ?? ""));
  const secret = Buffer.from(env.cronSecret ?? "");
  const ok =
    secret.length > 0 && value.length === secret.length && crypto.timingSafeEqual(value, secret);
  if (!ok) throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
}

router.post("/internal/jobs/run", async (req, res) => {
  assertCron(req.headers["x-cron-secret"]);
  res.json(await runJobs());
});

/**
 * Demo mode only: reset the demo now (header x-cron-secret). `{ "force": true }` is
 * for the very first reset of a base that holds hand-made demo content: it wipes
 * whatever the base holds, so check DATABASE_URL first (docs/DEMO_MODE.md).
 */
router.post("/internal/demo/reset", async (req, res) => {
  assertCron(req.headers["x-cron-secret"]);
  if (!env.demoMode) throw new HttpError(404, "Not found", "NOT_FOUND");
  try {
    res.json(await resetDemo({ force: req.body?.force === true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("demo reset refused"))
      throw new HttpError(409, message, "DEMO_RESET_REFUSED");
    throw err;
  }
});

export default router;
