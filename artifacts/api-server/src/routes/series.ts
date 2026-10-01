import { Router } from "express";
import {
  db,
  reservationSeriesTable,
  reservationsTable,
  reservationPlayersTable,
  reservationEquipmentTable,
  terrainsTable,
  usersTable,
  activityTable,
} from "@workspace/db";
import { and, desc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();
const SLOT_MS = 90 * 60 * 1000;

type SeriesInput = {
  terrainId: number;
  firstStart: Date;
  occurrences: number;
  intervalWeeks: number;
};

function parse(body: any): SeriesInput {
  const firstStart = new Date(body.firstStart);
  const occurrences = Number(body.occurrences),
    intervalWeeks = Number(body.intervalWeeks ?? 1),
    terrainId = Number(body.terrainId);
  const bad = (m: string) => {
    throw Object.assign(new Error(m), { status: 400 });
  };
  if (!terrainId) bad("Court is required");
  if (Number.isNaN(firstStart.getTime())) bad("Invalid first date");
  if (firstStart.getTime() < Date.now()) bad("First date must be in the future");
  if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 52)
    bad("Between 2 and 52 sessions");
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 4)
    bad("Repeat every 1 to 4 weeks");
  return { terrainId, firstStart, occurrences, intervalWeeks };
}

/** Same local wall-clock time each week (setDate keeps the hour even across DST changes). */
function dates(s: SeriesInput) {
  return Array.from({ length: s.occurrences }, (_, i) => {
    const d = new Date(s.firstStart);
    d.setDate(d.getDate() + i * 7 * s.intervalWeeks);
    return d;
  });
}

async function conflicts(q: any, terrainId: number, starts: Date[]) {
  if (!starts.length) return new Map<number, string>();
  const first = starts[0],
    last = new Date(starts[starts.length - 1].getTime() + SLOT_MS);
  const existing = await q
    .select({
      startTime: reservationsTable.startTime,
      endTime: reservationsTable.endTime,
      guestName: reservationsTable.guestName,
      userId: reservationsTable.userId,
    })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.terrainId, terrainId),
        eq(reservationsTable.status, "confirmed" as any),
        lt(reservationsTable.startTime, last),
        gt(reservationsTable.endTime, first),
      ),
    );
  const out = new Map<number, string>();
  starts.forEach((d, i) => {
    const end = d.getTime() + SLOT_MS;
    const hit = existing.find(
      (r: any) => r.startTime.getTime() < end && r.endTime.getTime() > d.getTime(),
    );
    if (hit) out.set(i, hit.guestName ?? (hit.userId ? `member #${hit.userId}` : "booked"));
  });
  return out;
}

router.post("/admin/series/preview", requireAdmin, async (req, res) => {
  try {
    const s = parse(req.body);
    const list = dates(s),
      clash = await conflicts(db, s.terrainId, list);
    res.json({
      dates: list.map((d, i) => ({
        startTime: d.toISOString(),
        conflict: clash.has(i),
        conflictWith: clash.get(i) ?? null,
      })),
    });
  } catch (e: any) {
    if (e.status) res.status(400).json({ error: e.message });
    else throw e;
  }
});

router.post("/admin/series", requireAdmin, async (req, res) => {
  const admin = (req as any).dbUser;
  let s: SeriesInput;
  try {
    s = parse(req.body);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }
  const { userId, guestName, guestPhone, label, notes, skipConflicts = true } = req.body;
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, s.terrainId));
  if (!terrain || !terrain.isActive) {
    res.status(400).json({ error: "Court not available" });
    return;
  }
  const member = userId
    ? (
        await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, Number(userId)))
      )[0]
    : null;
  if (userId && !member) {
    res.status(400).json({ error: "Member not found" });
    return;
  }
  if (!member && !guestName?.trim()) {
    res.status(400).json({ error: "Pick a member or enter a name" });
    return;
  }

  try {
    const out = await db.transaction(async (tx) => {
      // Serialize series creation per court
      await tx
        .select({ id: terrainsTable.id })
        .from(terrainsTable)
        .where(eq(terrainsTable.id, terrain.id))
        .for("update");
      const list = dates(s),
        clash = await conflicts(tx, terrain.id, list);
      if (clash.size && !skipConflicts)
        throw Object.assign(new Error("CONFLICTS"), { count: clash.size });
      const [series] = await tx
        .insert(reservationSeriesTable)
        .values({
          terrainId: terrain.id,
          userId: member?.id ?? null,
          guestName: member ? null : guestName.trim(),
          guestPhone: guestPhone || null,
          label: label || null,
          firstStart: s.firstStart,
          occurrences: s.occurrences,
          intervalWeeks: s.intervalWeeks,
          notes: notes || null,
          createdBy: admin.id,
        })
        .returning();
      const created: string[] = [],
        skipped: string[] = [];
      for (const [i, start] of list.entries()) {
        if (clash.has(i)) {
          skipped.push(start.toISOString());
          continue;
        }
        const [r] = await tx
          .insert(reservationsTable)
          .values({
            terrainId: terrain.id,
            userId: member?.id ?? null,
            guestName: member ? null : guestName.trim(),
            guestPhone: guestPhone || null,
            startTime: start,
            endTime: new Date(start.getTime() + SLOT_MS),
            status: "confirmed",
            tokensCharged: 0,
            bookingType: "manual",
            bookingMode: "full_court",
            totalSpots: 4,
            isPublic: false,
            notes: [label, notes].filter(Boolean).join(" · ") || null,
            seriesId: series.id,
          })
          .returning();
        // Paid at the desk each week: one pending cash row so staff can tick it off per session
        if (member)
          await tx.insert(reservationPlayersTable).values({
            reservationId: r.id,
            userId: member.id,
            paymentType: "cash",
            paymentStatus: "pending",
            tokensCharged: 0,
          });
        created.push(start.toISOString());
      }
      await tx.insert(activityTable).values({
        type: "reservation_created",
        message: `Recurring booking: ${terrain.name}, ${created.length} sessions${label ? ` (${label})` : ""}`,
        userId: member?.id ?? null,
        userName: member
          ? `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.email
          : guestName,
      });
      return { series, created, skipped };
    });
    res.status(201).json(out);
  } catch (err: any) {
    if (err.message === "CONFLICTS")
      res.status(409).json({ error: `${err.count} date(s) are already booked` });
    else if ((err.code ?? err.cause?.code) === "23505")
      res.status(409).json({ error: "A date was booked meanwhile, please preview again" });
    else throw err;
  }
});

router.get("/admin/series", requireAdmin, async (_req, res) => {
  const list = await db.query.reservationSeriesTable.findMany({
    where: eq(reservationSeriesTable.status, "active" as any),
    with: { terrain: true, user: true },
    orderBy: [desc(reservationSeriesTable.createdAt)],
  });
  if (!list.length) {
    res.json([]);
    return;
  }
  const upcoming = await db
    .select({ seriesId: reservationsTable.seriesId, startTime: reservationsTable.startTime })
    .from(reservationsTable)
    .where(
      and(
        inArray(
          reservationsTable.seriesId,
          list.map((s) => s.id),
        ),
        eq(reservationsTable.status, "confirmed" as any),
        gte(reservationsTable.startTime, new Date()),
      ),
    );
  res.json(
    list.map((s) => {
      const mine = upcoming
        .filter((u) => u.seriesId === s.id)
        .map((u) => u.startTime)
        .sort((a, b) => +a - +b);
      return {
        id: s.id,
        label: s.label,
        terrain: s.terrain ? { id: s.terrain.id, name: s.terrain.name } : null,
        who: s.user
          ? `${s.user.firstName ?? ""} ${s.user.lastName ?? ""}`.trim() || s.user.email
          : s.guestName,
        guestPhone: s.guestPhone,
        firstStart: s.firstStart,
        occurrences: s.occurrences,
        intervalWeeks: s.intervalWeeks,
        remaining: mine.length,
        nextStart: mine[0] ?? null,
      };
    }),
  );
});

/** Cancels the remaining (future) sessions. Past sessions stay in history. */
router.post("/admin/series/:id/cancel", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.transaction(async (tx) => {
    const future = await tx
      .update(reservationsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(reservationsTable.seriesId, id),
          eq(reservationsTable.status, "confirmed" as any),
          gt(reservationsTable.startTime, new Date()),
        ),
      )
      .returning({ id: reservationsTable.id });
    if (future.length) {
      await tx
        .update(reservationEquipmentTable)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(
              reservationEquipmentTable.reservationId,
              future.map((f) => f.id),
            ),
            eq(reservationEquipmentTable.status, "reserved" as any),
          ),
        );
    }
    await tx
      .update(reservationSeriesTable)
      .set({ status: "cancelled" })
      .where(eq(reservationSeriesTable.id, id));
    return future.length;
  });
  res.json({ cancelled: result });
});

export default router;
