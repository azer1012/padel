import { db, pricingRulesTable, type PricingRule } from "@workspace/db";
import { eq } from "drizzle-orm";
import { clubParts } from "./club-time";

export type SlotPrice = {
  /** Tokens charged per player spot. A full court costs 4 × this. */
  tokensPerSpot: number;
  /** Cash price per person (club currency) for walk-ins; falls back to the court's base price. */
  pricePerPerson: number;
  isPeak: boolean;
  ruleId: number | null;
  ruleName: string | null;
};

type TerrainLike = { id: number; pricePerPerson: number };

export async function loadActiveRules(): Promise<PricingRule[]> {
  return db.select().from(pricingRulesTable).where(eq(pricingRulesTable.isActive, true));
}

/** Pure function so it can be used for a single quote or a whole calendar without extra queries. */
export function priceFor(rules: PricingRule[], terrain: TerrainLike, start: Date): SlotPrice {
  const { weekday, time } = clubParts(start);
  const matches = rules.filter(
    (r) =>
      r.isActive &&
      (r.terrainId == null || r.terrainId === terrain.id) &&
      r.daysOfWeek.includes(weekday) &&
      time >= r.startTime &&
      time < r.endTime,
  );
  matches.sort(
    (a, b) =>
      b.priority - a.priority ||
      Number(b.terrainId != null) - Number(a.terrainId != null) ||
      b.id - a.id,
  );
  const rule = matches[0];
  return {
    tokensPerSpot: rule?.tokensPerSpot ?? 1,
    pricePerPerson: rule?.pricePerPerson ?? terrain.pricePerPerson,
    isPeak: rule?.isPeak ?? false,
    ruleId: rule?.id ?? null,
    ruleName: rule?.name ?? null,
  };
}

export async function quote(terrain: TerrainLike, start: Date) {
  return priceFor(await loadActiveRules(), terrain, start);
}

export const SPOTS_PER_COURT = 4;
export const tokensFor = (price: SlotPrice, mode: "full_court" | "own_spot") =>
  mode === "own_spot" ? price.tokensPerSpot : price.tokensPerSpot * SPOTS_PER_COURT;
