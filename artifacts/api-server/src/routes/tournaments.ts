import { Router, type Request } from "express";
import { db, tournamentsTable, tournamentRegistrationsTable, usersTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireAdmin, requireUser, loadUser } from "../lib/auth";
import { HttpError, cleanText, oneOf, pgCode, requireId } from "../lib/http";

const router = Router();
type DbUser = typeof usersTable.$inferSelect;
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

function tournamentInput(b: any, creating: boolean) {
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
  const imageUrl = cleanText(b?.imageUrl, 500);
  if (imageUrl && !/^(https:\/\/|\/)/.test(imageUrl))
    throw new HttpError(400, "Image URL must start with https://", "VALIDATION_ERROR");
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
  const user = (req as any).dbUser as DbUser | undefined;
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
router.post("/tournaments/:id/register", requireUser, async (req: Request, res) => {
  const id = requireId(req.params.id);
  const user = (req as any).dbUser as DbUser;
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

router.delete("/tournaments/:id/register", requireUser, async (req: Request, res) => {
  const id = requireId(req.params.id);
  const user = (req as any).dbUser as DbUser;
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

export default router;
