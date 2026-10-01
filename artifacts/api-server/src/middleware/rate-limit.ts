import type { NextFunction, Request, Response } from "express";

/**
 * Small in-memory limiter for write requests (POST/PATCH/PUT/DELETE), per client IP,
 * fixed one-minute window. Stops scripted abuse (booking/cancel loops, invite spam)
 * without a dependency. With several API instances each one counts separately; put a
 * shared limiter (Cloudflare, Nginx) in front for strict global limits.
 */
export function writeRateLimit(perMinute: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60_000);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!perMinute || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
      return next();
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    entry.count++;
    if (entry.count > perMinute) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res
        .status(429)
        .json({ error: "Too many requests, please wait a moment", code: "RATE_LIMITED" });
      return;
    }
    next();
  };
}
