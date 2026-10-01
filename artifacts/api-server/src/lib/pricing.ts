import { db, pricingRulesTable, type PricingRule } from "@workspace/db";
import { eq } from "drizzle-orm";
import { clubParts } from "./club-time";
import { getSettings, type ClubSettings } from "./settings";

export type SlotPrice = {
  /** Tokens charged for one player spot. */
  tokensPerSpot: number;
  /** Tokens charged to book the whole court. */
  tokensFullCourt: number;
  /** Cash price per person at the desk (club currency). */
  pricePerPerson: number;
  /** Cash price of the whole court. */
  fullCourtPrice: number;
  isPeak: boolean;
  ruleId: number | null;
  ruleName: string | null;
};

type TerrainLike = { id: number; pricePerPerson: number | null };

export async function loadActiveRules(): Promise<PricingRule[]> {
  return db.select().from(pricingRulesTable).where(eq(pricingRulesTable.isActive, true));
}

/**
 * Price of one slot. Resolution, most specific first:
 *   pricing rule (peak / off-peak / weekend, by weekday + time)  >  court override  >  club settings.
 * A rule sets the per-spot token cost; the full court then costs that × max players.
 * Pure, so a whole calendar is priced without extra queries.
 */
export function priceFor(
  rules: PricingRule[],
  settings: ClubSettings,
  terrain: TerrainLike,
  start: Date,
): SlotPrice {
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
  const perPersonOverride = rule?.pricePerPerson ?? terrain.pricePerPerson;
  return {
    tokensPerSpot: rule ? rule.tokensPerSpot : settings.tokenCostPlayer,
    tokensFullCourt: rule ? rule.tokensPerSpot * settings.maxPlayers : settings.tokenCostFullCourt,
    pricePerPerson: perPersonOverride ?? settings.playerPrice,
    fullCourtPrice:
      perPersonOverride != null ? perPersonOverride * settings.maxPlayers : settings.fullCourtPrice,
    isPeak: rule?.isPeak ?? false,
    ruleId: rule?.id ?? null,
    ruleName: rule?.name ?? null,
  };
}

export async function quote(terrain: TerrainLike, start: Date) {
  const [rules, settings] = await Promise.all([loadActiveRules(), getSettings()]);
  return priceFor(rules, settings, terrain, start);
}

export const tokensFor = (price: SlotPrice, mode: "full_court" | "own_spot") =>
  mode === "own_spot" ? price.tokensPerSpot : price.tokensFullCourt;
