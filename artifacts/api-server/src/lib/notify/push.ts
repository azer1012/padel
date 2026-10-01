import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { env } from "../../config/env";
import { logger } from "../logger";

export const pushEnabled = !!(env.vapidPublicKey && env.vapidPrivateKey);
if (pushEnabled)
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);

/** Sends to every device of the user and prunes subscriptions the browser has revoked. */
export async function sendPush(
  userId: number,
  payload: { title: string; body: string; url: string; tag?: string },
) {
  if (!pushEnabled) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  const dead: number[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 6 },
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
        else logger.warn({ err: err?.message, userId }, "push failed");
      }
    }),
  );
  if (dead.length)
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, dead));
  return sent;
}
