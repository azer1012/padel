type NameLike = { firstName?: string | null; lastName?: string | null };

/** A deleted account keeps its row (lib/accounts.ts) under an address that names nobody. */
const isDeleted = (email: string) => email.endsWith("@deleted.invalid");

/** Full name for staff screens, e-mails and the audit trail; the e-mail when no name is set. */
export const fullName = (u: NameLike & { email: string }) =>
  `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
  (isDeleted(u.email) ? "Deleted account" : u.email);

/**
 * What other members may see of someone: "Yasmine B.". Never an e-mail address,
 * a phone number or a full family name.
 */
export function publicName(u: NameLike | null | undefined, fallback = "Player") {
  const first = (u?.firstName ?? "").trim();
  const initial = (u?.lastName ?? "").trim().charAt(0);
  return first ? `${first}${initial ? ` ${initial}.` : ""}` : fallback;
}
