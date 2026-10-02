import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { currentUser, requireUser } from "../lib/auth";
import { HttpError } from "../lib/http";
import { env } from "../config/env";
import { pushEnabled } from "../lib/notify";
import { sendPush } from "../lib/notify/push";

const router = Router();

router.get("/push/public-key", (_req, res) => {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? env.vapidPublicKey : null });
});

router.post("/push/subscribe", requireUser, async (req, res) => {
  const user = currentUser(req);
  const { endpoint, keys } = req.body ?? {};
  const key = (v: unknown, max: number) =>
    typeof v === "string" && v.length > 0 && v.length <= max && /^[A-Za-z0-9_\-+/=]+$/.test(v);
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 2000 ||
    !key(keys?.p256dh, 200) ||
    !key(keys?.auth, 100)
  )
    throw new HttpError(400, "Invalid subscription", "VALIDATION_ERROR");
  // A device belongs to whoever is signed in on it now
  await db
    .insert(pushSubscriptionsTable)
    .values({
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    });
  res.status(201).json({ ok: true });
});

router.post("/push/unsubscribe", requireUser, async (req, res) => {
  const user = currentUser(req);
  const { endpoint } = req.body ?? {};
  // Only the member's own devices: an endpoint alone must not unsubscribe someone else
  if (typeof endpoint === "string")
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.endpoint, endpoint),
          eq(pushSubscriptionsTable.userId, user.id),
        ),
      );
  res.json({ ok: true });
});

router.post("/push/test", requireUser, async (req, res) => {
  const user = currentUser(req);
  const sent = await sendPush(user.id, {
    title: env.clubName,
    body:
      user.language === "en"
        ? "Notifications are on."
        : user.language === "ar"
          ? "الإشعارات مفعّلة."
          : "Les notifications sont activées.",
    url: `${env.frontendUrl ?? ""}/dashboard`,
  });
  res.json({ sent });
});

export default router;
