import { db, notificationLogTable, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import { logger } from "../logger";
import { render, type NotificationEvent } from "./templates";
import { sendEmail } from "./mailer";
import { sendPush } from "./push";
import { getSettings, type ClubSettings } from "../settings";
import type { DbUser } from "../auth";

/** Which club setting switches each kind of notification on or off. */
const SWITCH: Partial<Record<NotificationEvent["kind"], keyof ClubSettings>> = {
  booking_confirmed: "bookingConfirmationNotificationsEnabled",
  booking_cancelled: "cancellationNotificationsEnabled",
  reservation_reminder: "remindersEnabled",
  invitation: "invitationNotificationsEnabled",
  tokens_added: "tokenNotificationsEnabled",
  match_finished: "matchFinishedNotificationsEnabled",
};

/**
 * Sends one event to one user on every channel they allow: in-app always,
 * email if emailNotifications, push if pushNotifications.
 * `ref` makes it idempotent: the same (user, kind, ref) is never sent twice.
 * Never throws: a failed email must not break a booking.
 */
export async function notify(
  user: DbUser | number,
  event: NotificationEvent,
  ref = "",
): Promise<boolean> {
  try {
    const u =
      typeof user === "number"
        ? (await db.select().from(usersTable).where(eq(usersTable.id, user)))[0]
        : user;
    if (!u) return false;
    const settings = await getSettings();
    const key = SWITCH[event.kind];
    if (key && settings[key] === false) return false; // turned off in Réglages → Notifications
    const [claimed] = await db
      .insert(notificationLogTable)
      .values({ userId: u.id, kind: event.kind, ref })
      .onConflictDoNothing()
      .returning({ id: notificationLogTable.id });
    if (!claimed) return false; // already sent

    const msg = render(event, u.language, env.frontendUrl ?? "http://localhost:5173", {
      currency: settings.currency,
      durationMinutes: settings.bookingDurationMinutes,
      tokenCostPlayer: settings.tokenCostPlayer,
      tokenCostFullCourt: settings.tokenCostFullCourt,
    });
    const channels: string[] = ["in_app"];

    await db.insert(notificationsTable).values({
      userId: u.id,
      type: event.kind,
      title: msg.inApp.title,
      message: msg.inApp.message,
    });

    const jobs: Promise<unknown>[] = [];
    const realEmail = u.email && !u.email.endsWith("@placeholder.local");
    if (u.emailNotifications && realEmail) {
      jobs.push(
        sendEmail({ to: u.email, subject: msg.subject, html: msg.html, text: msg.text }).then(() =>
          channels.push("email"),
        ),
      );
    }
    if (u.pushNotifications) {
      jobs.push(
        sendPush(u.id, { ...msg.push, tag: `${event.kind}:${ref}` }).then((n) => {
          if (n) channels.push("push");
        }),
      );
    }
    const results = await Promise.allSettled(jobs);
    results.forEach(
      (r) =>
        r.status === "rejected" &&
        logger.warn(
          { err: String(r.reason), kind: event.kind, userId: u.id },
          "notification channel failed",
        ),
    );
    await db
      .update(notificationLogTable)
      .set({ channels })
      .where(eq(notificationLogTable.id, claimed.id));
    return true;
  } catch (err) {
    logger.error({ err, kind: event.kind }, "notify failed");
    return false;
  }
}

/** Fire-and-forget helper for request handlers (keeps the response fast). */
export function notifyLater(user: DbUser | number, event: NotificationEvent, ref = "") {
  setImmediate(() => {
    void notify(user, event, ref);
  });
}

export { render } from "./templates";
export { pushEnabled } from "./push";
