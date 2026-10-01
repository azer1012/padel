import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireUser } from "../lib/auth";
import { env } from "../config/env";
import { pushEnabled } from "../lib/notify";
import { sendPush } from "../lib/notify/push";

const router = Router();

router.get("/push/public-key", (_req, res) => {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? env.vapidPublicKey : null });
});

router.post("/push/subscribe", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const { endpoint, keys } = req.body ?? {};
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    !keys?.p256dh ||
    !keys?.auth
  ) {
    res.status(400).json({ error: "Invalid subscription" });
    return;
  }
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
  const { endpoint } = req.body ?? {};
  if (typeof endpoint === "string")
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  res.json({ ok: true });
});

router.post("/push/test", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
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
