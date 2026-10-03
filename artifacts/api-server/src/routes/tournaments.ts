import { Router } from "express";
import { db, tournamentsTable, tournamentRegistrationsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { currentUser, optionalUser, requireAdmin, requireUser, loadUser } from "../lib/auth";
import { fullName } from "../lib/members";
import {
  HttpError,
  cleanImageUrl,
  cleanText,
  oneOf,
  pgCode,
  requireId,
  type Body,
} from "../lib/http";

const router = Router();
const STATUSES = ["upcoming", "open", "ongoing", "completed", "cancelled"] as const;

function parseDate(v: unknown, what: string, required: boolean) {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `${what} is required`, "VALIDATION_ERROR");
    return undefined;
  }
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid ${what}`, "VALIDATION_ERROR");
  return d;
}

function tournamentInput(b: Body, creating: boolean) {
  const name = cleanText(b?.name, 120);
  if (creating && !name) throw new HttpError(400, "Name is required", "VALIDATION_ERROR");
  const status = b?.status === undefined ? undefined : oneOf(b.status, STATUSES);
  if (status === null) throw new HttpError(400, "Invalid status", "VALIDATION_ERROR");
  const maxTeams =
    b?.maxTeams === undefined || b.maxTeams === null || b.maxTeams === ""
      ? null
      : Number(b.maxTeams);
  if (maxTeams !== null && (!Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 256))
    throw new HttpError(400, "Max teams must be between 2 and 256", "VALIDATION_ERROR");
  const startDate = parseDate(b?.startDate, "start date", creating);
  const endDate = parseDate(b?.endDate, "end date", false);
  if (startDate && endDate && endDate < startDate)
    throw new HttpError(400, "The end date is before the start date", "VALIDATION_ERROR");
  const imageUrl = cleanImageUrl(b?.imageUrl);
  return {
    ...(name !== null || creating ? { name: name! } : {}),
    ...(b?.description !== undefined ? { description: cleanText(b.description, 4000) } : {}),
    ...(startDate ? { startDate } : {}),
    ...(b?.endDate !== undefined ? { endDate: endDate ?? null } : {}),
    ...(b?.maxTeams !== undefined ? { maxTeams } : {}),
    ...(status ? { status } : {}),
    ...(b?.prizeInfo !== undefined ? { prizeInfo: cleanText(b.prizeInfo, 500) } : {}),
    ...(b?.imageUrl !== undefined ? { imageUrl } : {}),
  };
}

router.get("/tournaments", loadUser, async (req, res) => {
  const user = optionalUser(req);
  const list = await db.select().from(tournamentsTable).orderBy(asc(tournamentsTable.startDate));
  let mine = new Set<number>();
  if (user) {
    const regs = await db
      .select({ id: tournamentRegistrationsTable.tournamentId })
      .from(tournamentRegistrationsTable)
      .where(eq(tournamentRegistrationsTable.userId, user.id));
    mine = new Set(regs.map((r) => r.id));
  }
  res.json(list.map((t) => ({ ...t, isRegistered: mine.has(t.id) })));
});

router.post("/tournaments", requireAdmin, async (req, res) => {
  const values = tournamentInput(req.body, true) as typeof tournamentsTable.$inferInsert;
  const [tournament] = await db.insert(tournamentsTable).values(values).returning();
  res.status(201).json(tournament);
});

router.get("/tournaments/:id", async (req, res) => {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, requireId(req.params.id)));
  if (!tournament) throw new HttpError(404, "Tournament not found", "NOT_FOUND");
  res.json(tournament);
});

router.patch("/tournaments/:id", requireAdmin, async (req, res) => {
  const [updated] = await db
    .update(tournamentsTable)
    .set(tournamentInput(req.body, false))
    .where(eq(tournamentsTable.id, requireId(req.params.id)))
    .returning();
  if (!updated) throw new HttpError(404, "Tournament not found", "NOT_FOUND");
  res.json(updated);
});

/** Registration: only while open, once per player, never beyond maxTeams. */
router.post("/tournaments/:id/register", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = currentUser(req);
  const teamName = cleanText(req.body?.teamName, 80);
  try {
    const reg = await db.transaction(async (tx) => {
      const [t] = await tx
        .select()
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, id))
        .for("update");
      if (!t) throw new HttpError(404, "Tournament not found", "NOT_FOUND");
      if (t.status !== "open")
        throw new HttpError(
          400,
          "Registration is not open for this tournament",
          "REGISTRATION_CLOSED",
        );
      if (t.maxTeams && t.registeredTeams >= t.maxTeams)
        throw new HttpError(409, "This tournament is full", "TOURNAMENT_FULL");
      const [row] = await tx
        .insert(tournamentRegistrationsTable)
        .values({ tournamentId: id, userId: user.id, teamName })
        .returning();
      await tx
        .update(tournamentsTable)
        .set({ registeredTeams: sql`${tournamentsTable.registeredTeams} + 1` })
        .where(eq(tournamentsTable.id, id));
      return row;
    });
    res.status(201).json(reg);
  } catch (err) {
    if (pgCode(err) === "23505")
      throw new HttpError(409, "You are already registered", "ALREADY_REGISTERED");
    throw err;
  }
});

router.delete("/tournaments/:id/register", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = currentUser(req);
  await db.transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, id))
      .for("update");
    if (!t) throw new HttpError(404, "Tournament not found", "NOT_FOUND");
    if (t.status !== "open" && t.status !== "upcoming")
      throw new HttpError(400, "Registration can no longer be changed", "REGISTRATION_CLOSED");
    const deleted = await tx
      .delete(tournamentRegistrationsTable)
      .where(
        and(
          eq(tournamentRegistrationsTable.tournamentId, id),
          eq(tournamentRegistrationsTable.userId, user.id),
        ),
      )
      .returning();
    if (!deleted.length) throw new HttpError(404, "You are not registered", "NOT_REGISTERED");
    await tx
      .update(tournamentsTable)
      .set({ registeredTeams: sql`greatest(${tournamentsTable.registeredTeams} - 1, 0)` })
      .where(eq(tournamentsTable.id, id));
  });
  res.json({ message: "Registration cancelled" });
});

/** The teams of a tournament, for the desk: who registered and how to reach them. */
router.get("/tournaments/:id/registrations", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [t] = await db
    .select({ id: tournamentsTable.id })
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, id));
  if (!t) throw new HttpError(404, "Tournament not found", "NOT_FOUND");
  const rows = await db.query.tournamentRegistrationsTable.findMany({
    where: eq(tournamentRegistrationsTable.tournamentId, id),
    with: { user: true },
    orderBy: [asc(tournamentRegistrationsTable.createdAt), asc(tournamentRegistrationsTable.id)],
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      teamName: r.teamName,
      createdAt: r.createdAt,
      member: { id: r.user.id, name: fullName(r.user), email: r.user.email, phone: r.user.phone },
    })),
  );
});

/** The desk takes a team out (a withdrawal by phone, a mistake), whatever the tournament's state. */
router.delete("/tournaments/:id/registrations/:registrationId", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const registrationId = requireId(req.params.registrationId, "registration");
  await db.transaction(async (tx) => {
    const [t] = await tx
      .select({ id: tournamentsTable.id })
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, id))
      .for("update");
    if (!t) throw new HttpError(404, "Tournament not found", "NOT_FOUND");
    const deleted = await tx
      .delete(tournamentRegistrationsTable)
      .where(
        and(
          eq(tournamentRegistrationsTable.id, registrationId),
          eq(tournamentRegistrationsTable.tournamentId, id),
        ),
      )
      .returning();
    if (!deleted.length) throw new HttpError(404, "Registration not found", "NOT_FOUND");
    await tx
      .update(tournamentsTable)
      .set({ registeredTeams: sql`greatest(${tournamentsTable.registeredTeams} - 1, 0)` })
      .where(eq(tournamentsTable.id, id));
  });
  res.status(204).end();
});

export default router;
