import { usersTable } from "@workspace/db";
import { ilike, type SQL } from "drizzle-orm";
import { env } from "../config/env";
import { HttpError } from "./http";

/**
 * Demo mode (DEMO_MODE=true): a public showcase of the platform for clubs that might
 * buy it. Visitors sign in with two shared accounts shown on the sign-in page, every
 * person in it is invented, and the data goes back to its starting point every night
 * (lib/demo-seed.ts).
 *
 * Every demo person has an @example.com address: a domain reserved for examples, so
 * nothing can ever be delivered to it. In demo mode only these accounts may use the
 * API; anyone who signs up for real is turned away and never listed.
 */
export const DEMO_DOMAIN = "example.com";

export const isDemoEmail = (email: string | null | undefined) =>
  !!email && email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

/** The two accounts visitors sign in with. */
export const DEMO_ACCOUNTS = {
  player: {
    email: `joueur@${DEMO_DOMAIN}`,
    firstName: "Sami",
    lastName: "Ben Ali",
    phone: "+216 00 100 100",
    gender: "male" as const,
    role: "player" as const,
  },
  admin: {
    email: `club@${DEMO_DOMAIN}`,
    firstName: "Leïla",
    lastName: "Mansour",
    phone: "+216 00 100 101",
    gender: "female" as const,
    role: "admin" as const,
  },
};

/**
 * Demo mode: member lists and searches only ever show the invented people. Somebody
 * who signs up for real (before being turned away) is never shown to the visitors.
 */
export const demoPeopleOnly = (): SQL | undefined =>
  env.demoMode ? ilike(usersTable.email, `%@${DEMO_DOMAIN}`) : undefined;

export const demoAccountEmails = () => Object.values(DEMO_ACCOUNTS).map((a) => a.email);

/**
 * What the website needs to offer the demo (GET /settings): null outside demo mode.
 * The password is public on purpose: it is printed on the sign-in page.
 */
export function demoInfo() {
  if (!env.demoMode) return null;
  const password = env.demoPassword;
  return {
    resetHour: env.demoResetHour,
    accounts: password
      ? {
          player: { email: DEMO_ACCOUNTS.player.email, password },
          admin: { email: DEMO_ACCOUNTS.admin.email, password },
        }
      : null,
  };
}

/** Anything a visitor could use to break the demo for the next ones is refused. */
export function assertNotDemo(what: string) {
  if (env.demoMode) throw new HttpError(403, `${what} is switched off in the demo`, "DEMO_LOCKED");
}

export const demoAccountOnly = () =>
  new HttpError(403, "This is a demo: sign in with one of the demo accounts", "DEMO_ACCOUNT_ONLY");
