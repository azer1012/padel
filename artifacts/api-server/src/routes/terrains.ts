import { Router } from "express";
import { db, terrainsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/terrains", async (_req, res) => {
  const terrains = await db.select().from(terrainsTable);
  res.json(terrains);
});

router.post("/terrains", requireAdmin, async (req, res) => {
  const { name, description, type, pricePerPerson = 25, capacity = 4, openingTime = "08:00", closingTime = "23:00", photos = [] } = req.body;
  const [terrain] = await db.insert(terrainsTable).values({
    name, description, type, pricePerPerson, capacity, openingTime, closingTime, photos
  }).returning();
  res.status(201).json(terrain);
});

router.get("/terrains/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, id));
  if (!terrain) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }
  res.json(terrain);
});

router.patch("/terrains/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, description, type, isActive, pricePerPerson, openingTime, closingTime, photos } = req.body;
  const [updated] = await db.update(terrainsTable)
    .set({ name, description, type, isActive, pricePerPerson, openingTime, closingTime, photos })
    .where(eq(terrainsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }
  res.json(updated);
});

router.delete("/terrains/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.delete(terrainsTable).where(eq(terrainsTable.id, id));
  res.status(204).send();
});

export default router;
