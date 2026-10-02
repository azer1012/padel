import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env";
import { runJobs } from "../jobs";
import { HttpError } from "../lib/http";

const router = Router();

/** For external cron (Supabase pg_cron, GitHub Actions, Cloudflare Cron…). Header: x-cron-secret. */
router.post("/internal/jobs/run", async (req, res) => {
  const given = String(req.headers["x-cron-secret"] ?? "");
  const ok =
    !!env.cronSecret &&
    given.length === env.cronSecret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(env.cronSecret));
  if (!ok) throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  res.json(await runJobs());
});

export default router;
