import { db, reservationsTable, usersTable } from "@workspace/db";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notify } from "../lib/notify";
import { equipmentFor } from "../lib/equipment";
import { formatClubDate, formatClubTime } from "../lib/club-time";
import { getSettings } from "../lib/settings";

const MIN = 60 * 1000;

/** Members playing in a reservation: creator plus everyone who joined and wasn't refunded. */
async function playersOf(reservationIds: number[]) {
  if (!reservationIds.length) return new Map<number, number[]>();
  const rows = await db.query.reservationsTable.findMany({
    where: inArray(reservationsTable.id, reservationIds),
    columns: { id: true, userId: true },
    with: { players: { columns: { userId: true, paymentStatus: true } } },
  });
  const out = new Map<number, number[]>();
  for (const r of rows) {
    const ids = new Set<number>();
    if (r.userId) ids.add(r.userId);
    for (const p of r.players) if (p.userId && p.paymentStatus !== "refunded") ids.add(p.userId);
    out.set(r.id, [...ids]);
  }
  return out;
}

async function loadUsers(ids: number[]) {
  if (!ids.length) return new Map<number, typeof usersTable.$inferSelect>();
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, ids));
  return new Map(users.map((u) => [u.id, u]));
}

/** `reminder_lead_minutes` before (club setting): one reminder per player per match. */
export async function sendReminders(now = new Date()) {
  const settings = await getSettings();
  if (!settings.remindersEnabled) return 0;
  const lead = settings.reminderLeadMinutes;
  const due = await db.query.reservationsTable.findMany({
    where: and(
      eq(reservationsTable.status, "confirmed"),
      gt(reservationsTable.startTime, new Date(now.getTime() + 5 * MIN)),
      lte(reservationsTable.startTime, new Date(now.getTime() + lead * MIN)),
    ),
    with: { terrain: true },
  });
  // Booked in the last 20 minutes? They just got a confirmation; don't double-ping.
  const list = due.filter((r) => now.getTime() - r.createdAt.getTime() > 20 * MIN);
  const players = await playersOf(list.map((r) => r.id));
  const users = await loadUsers([...new Set([...players.values()].flat())]);
  let sent = 0;
  for (const r of list) {
    for (const uid of players.get(r.id) ?? []) {
      const u = users.get(uid);
      if (!u) continue;
      const gear = await equipmentFor(r.id, uid);
      if (
        await notify(
          u,
          {
            kind: "reservation_reminder",
            terrain: r.terrain?.name ?? "",
            date: formatClubDate(r.startTime, u.language),
            time: formatClubTime(r.startTime),
            equipment: gear,
          },
          `res:${r.id}`,
        )
      )
        sent++;
    }
  }
  return sent;
}

/** After the match: thank-you + "book the next one" (within 6 h of the end, once). */
export async function sendMatchFinished(now = new Date()) {
  if (!(await getSettings()).matchFinishedNotificationsEnabled) return 0;
  const done = await db.query.reservationsTable.findMany({
    where: and(
      eq(reservationsTable.status, "confirmed"),
      gt(reservationsTable.endTime, new Date(now.getTime() - 6 * 60 * MIN)),
      lte(reservationsTable.endTime, now),
    ),
    with: { terrain: true },
  });
  const players = await playersOf(done.map((r) => r.id));
  const users = await loadUsers([...new Set([...players.values()].flat())]);
  let sent = 0;
  for (const r of done) {
    for (const uid of players.get(r.id) ?? []) {
      const u = users.get(uid);
      if (!u) continue;
      if (
        await notify(u, { kind: "match_finished", terrain: r.terrain?.name ?? "" }, `res:${r.id}`)
      )
        sent++;
    }
  }
  return sent;
}

let running = false;
export async function runJobs() {
  if (running) return { skipped: true };
  running = true;
  const started = Date.now();
  try {
    const [reminders, finished] = [await sendReminders(), await sendMatchFinished()];
    logger.info({ reminders, finished, ms: Date.now() - started }, "jobs run");
    return { reminders, finished };
  } catch (err) {
    logger.error({ err }, "jobs failed");
    return { error: true };
  } finally {
    running = false;
  }
}

/** In-process scheduler for long-running hosts. Serverless hosts call POST /api/internal/jobs/run instead. */
export function startScheduler(everyMs = 5 * MIN) {
  const t = setInterval(() => void runJobs(), everyMs);
  t.unref();
  setTimeout(() => void runJobs(), 20_000).unref();
  logger.info({ everyMs }, "job scheduler started");
}
