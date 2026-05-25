import { Router } from "express";
import { db, tournamentsTable, tournamentRegistrationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin, requireUser } from "../lib/auth";

const router = Router();

router.get("/tournaments", async (_req, res) => {
  const tournaments = await db.select().from(tournamentsTable);
  res.json(tournaments);
});

router.post("/tournaments", requireAdmin, async (req, res) => {
  const { name, description, startDate, endDate, maxTeams, status = "upcoming", prizeInfo, imageUrl } = req.body;
  const [tournament] = await db.insert(tournamentsTable).values({
    name, description,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : undefined,
    maxTeams,
    status: status as any,
    prizeInfo,
    imageUrl,
  }).returning();
  res.status(201).json(tournament);
});

router.get("/tournaments/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(tournament);
});

router.patch("/tournaments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, description, startDate, endDate, maxTeams, status, prizeInfo, imageUrl } = req.body;
  const [updated] = await db.update(tournamentsTable).set({
    name, description,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    maxTeams, status: status as any, prizeInfo, imageUrl,
  }).where(eq(tournamentsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.post("/tournaments/:id/register", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const user = (req as any).dbUser;

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id));
  if (!tournament) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (tournament.status !== "open") {
    res.status(400).json({ error: "Tournament is not open for registration" });
    return;
  }

  const [reg] = await db.insert(tournamentRegistrationsTable).values({
    tournamentId: id,
    userId: user.id,
  }).returning();

  await db.update(tournamentsTable)
    .set({ registeredTeams: sql`${tournamentsTable.registeredTeams} + 1` })
    .where(eq(tournamentsTable.id, id));

  res.json(reg);
});

export default router;
