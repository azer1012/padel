import { clubDate, clubTime } from "./club-time";
import type { useTx } from "./i18n";

/** The interface language, as set on <html lang> by the i18n provider. */
const uiLang = () => (typeof document === "undefined" ? "fr" : document.documentElement.lang);

/** The word alone: "token" / "tokens", "رصيد" in Arabic. */
export const tokenWord = (n: number) => (uiLang() === "ar" ? "رصيد" : n > 1 ? "tokens" : "token");

/** "1 token", "4 tokens" ("4 رصيد" in Arabic). */
export const tokensLabel = (n: number) => `${n} ${tokenWord(n)}`;

/** Picks the singular or plural wording: plural(3, "place libre", "places libres"). */
export const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** "1 place libre", "3 places libres" (FR), "1 open spot" (EN), in the UI language. */
export function openSpotsLabel(tx: ReturnType<typeof useTx>, n: number) {
  return tx({
    fr: `${n} ${plural(n, "place libre", "places libres")}`,
    en: `${n} ${plural(n, "open spot", "open spots")}`,
    ar: `${n} ${plural(n, "مكان شاغر", "أماكن شاغرة")}`,
  });
}

/** "3/4 joueurs": how full a match is. */
export function playersLabel(tx: ReturnType<typeof useTx>, filled: number, total: number) {
  return tx({
    fr: `${filled}/${total} joueurs`,
    en: `${filled}/${total} players`,
    ar: `${filled}/${total} لاعبين`,
  });
}

/**
 * What to tell a member when a request failed without a message from the API
 * (network down, server error): never a status code or a technical word.
 */
export function friendlyError(tx: ReturnType<typeof useTx>) {
  return tx({
    fr: "Un problème est survenu. Vérifiez votre connexion et réessayez.",
    en: "Something went wrong. Check your connection and try again.",
    ar: "حدث خطأ. تحقق من اتصالك وحاول مجددًا.",
  });
}

/** Message sent along an invite link: "Padel Court 2, 02/10 à 18:30. Rejoins-moi :". */
export function inviteShareText(
  tx: ReturnType<typeof useTx>,
  terrainName: string,
  startTime: string,
) {
  const day = clubDate(startTime, "fr", "numeric");
  const time = clubTime(startTime);
  return tx({
    fr: `Padel ${terrainName}, ${day} à ${time}. Rejoins-moi :`,
    en: `Padel ${terrainName}, ${day} at ${time}. Join me:`,
    ar: `بادل ${terrainName}، ${day} على ${time}. انضم إليّ:`,
  });
}

/** A member's full name for staff screens; the e-mail when no name is set. */
export function memberName(
  u?: { firstName?: string | null; lastName?: string | null; email?: string } | null,
) {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "";
}
