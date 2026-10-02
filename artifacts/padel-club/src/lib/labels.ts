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

/**
 * "3/4 joueurs": how full a match is. With the club's minimum number of players
 * (Réglages) and a match still below it: "1/4 joueurs · encore 1 pour jouer".
 */
export function playersLabel(
  tx: ReturnType<typeof useTx>,
  filled: number,
  total: number,
  minPlayers = 1,
) {
  const count = tx({
    fr: `${filled}/${total} joueurs`,
    en: `${filled}/${total} players`,
    ar: `${filled}/${total} لاعبين`,
  });
  const missing = Math.min(minPlayers, total) - filled;
  if (missing <= 0) return count;
  return `${count} · ${tx({
    fr: `encore ${missing} pour jouer`,
    en: `${missing} more to play`,
    ar: `ينقص ${missing} للعب`,
  })}`;
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

/**
 * A token ledger entry in the reader's language. The API files its own movements
 * under fixed English wordings ("Full court · Court 2 · 03/10/2026 18:30"); a reason
 * typed by the front desk is shown as written.
 */
export function ledgerLabel(tx: ReturnType<typeof useTx>, description: string) {
  const [head, ...rest] = description.split(" · ");
  const tail = rest.join(" · ");
  const withTail = (label: string) => (tail ? `${label} · ${tail}` : label);
  switch (head) {
    case "Full court":
      return withTail(tx({ fr: "Terrain complet", en: "Full court", ar: "ملعب كامل" }));
    case "Own spot":
      return withTail(tx({ fr: "Ma place", en: "My spot", ar: "مكاني" }));
    case "Joined match":
      return withTail(tx({ fr: "Match rejoint", en: "Joined a match", ar: "انضمام إلى مباراة" }));
    case "Joined via invite":
      return withTail(
        tx({ fr: "Match rejoint sur invitation", en: "Joined by invitation", ar: "انضمام بدعوة" }),
      );
    case "Refund": {
      const refund = tx({ fr: "Remboursement", en: "Refund", ar: "استرداد" });
      if (rest[0] === "left match")
        return `${refund} · ${tx({ fr: "match quitté", en: "left the match", ar: "مغادرة المباراة" })} · ${rest.slice(1).join(" · ")}`;
      if (rest[0] === "removed from match")
        return `${refund} · ${tx({ fr: "retiré du match", en: "removed from the match", ar: "إزالة من المباراة" })} · ${rest.slice(1).join(" · ")}`;
      if (tail.endsWith(" cancelled"))
        return `${refund} · ${tx({
          fr: `${tail.slice(0, -" cancelled".length)} annulé`,
          en: tail,
          ar: `إلغاء ${tail.slice(0, -" cancelled".length)}`,
        })}`;
      return withTail(refund);
    }
    default:
      return description;
  }
}

/**
 * An entry of the staff audit trail in the reader's language. The API files its
 * entries under fixed English wordings; names, reasons and field lists are kept as
 * written. An entry this does not recognise is shown as stored.
 */
export function activityLabel(tx: ReturnType<typeof useTx>, message: string) {
  const by = (who?: string) =>
    who ? ` (${tx({ fr: "par", en: "by", ar: "بواسطة" })} ${who})` : "";
  let m: RegExpMatchArray | null;

  // "<what> (by admin@club)": desk actions recorded by lib/activity
  const staff = message.match(/^(.*) \(by ([^()]+)\)$/s);
  const body = staff ? staff[1] : message;
  const who = staff?.[2];

  if ((m = body.match(/^Recurring booking cancelled: (.+), (\d+) sessions$/)))
    return (
      tx({
        fr: `Réservation récurrente annulée : ${m[1]}, ${m[2]} séances`,
        en: `Recurring booking cancelled: ${m[1]}, ${m[2]} sessions`,
        ar: `إلغاء حجز متكرر: ${m[1]}، ${m[2]} حصص`,
      }) + by(who)
    );
  if ((m = body.match(/^Recurring booking: (.+), (\d+) sessions( \(.+\))?$/)))
    return (
      tx({
        fr: `Réservation récurrente : ${m[1]}, ${m[2]} séances${m[3] ?? ""}`,
        en: `Recurring booking: ${m[1]}, ${m[2]} sessions${m[3] ?? ""}`,
        ar: `حجز متكرر: ${m[1]}، ${m[2]} حصص${m[3] ?? ""}`,
      }) + by(who)
    );
  if ((m = body.match(/^(\d+) token\(s\) (added to|removed from) (.+?): (.*)$/s))) {
    const added = m[2] === "added to";
    return (
      tx({
        fr: `${tokensLabel(Number(m[1]))} ${added ? "crédités à" : "retirés à"} ${m[3]} : ${ledgerLabel(tx, m[4])}`,
        en: `${tokensLabel(Number(m[1]))} ${added ? "added to" : "removed from"} ${m[3]}: ${ledgerLabel(tx, m[4])}`,
        ar: `${tokensLabel(Number(m[1]))} ${added ? "أضيفت إلى" : "خُصمت من"} ${m[3]}: ${ledgerLabel(tx, m[4])}`,
      }) + by(who)
    );
  }
  if ((m = body.match(/^Cash payment marked (received|not received) · booking #(\d+)$/)))
    return (
      (m[1] === "received"
        ? tx({
            fr: `Paiement en espèces encaissé · réservation n° ${m[2]}`,
            en: `Cash payment received · booking #${m[2]}`,
            ar: `تم استلام الدفع نقدًا · الحجز رقم ${m[2]}`,
          })
        : tx({
            fr: `Paiement en espèces remis en attente · réservation n° ${m[2]}`,
            en: `Cash payment marked not received · booking #${m[2]}`,
            ar: `الدفع نقدًا غير مستلم · الحجز رقم ${m[2]}`,
          })) + by(who)
    );
  if ((m = body.match(/^Pricing rule (".*") (created|updated|deleted)$/)))
    return (
      tx({
        fr: `Règle tarifaire ${m[1]} ${{ created: "créée", updated: "modifiée", deleted: "supprimée" }[m[2]]}`,
        en: body,
        ar: `قاعدة التسعير ${m[1]}: ${{ created: "إنشاء", updated: "تعديل", deleted: "حذف" }[m[2]]}`,
      }) + by(who)
    );
  if ((m = body.match(/^Court (".*") (created|archived|deleted|restored from the archive)$/)))
    return (
      tx({
        fr: `Terrain ${m[1]} ${
          {
            created: "créé",
            archived: "archivé",
            deleted: "supprimé",
            "restored from the archive": "restauré",
          }[m[2]]
        }`,
        en: body,
        ar: `الملعب ${m[1]}: ${
          {
            created: "إنشاء",
            archived: "أرشفة",
            deleted: "حذف",
            "restored from the archive": "استعادة",
          }[m[2]]
        }`,
      }) + by(who)
    );
  if ((m = body.match(/^Court (".*") updated · (.*)$/)))
    return (
      tx({
        fr: `Terrain ${m[1]} modifié · ${m[2]}`,
        en: body,
        ar: `تعديل الملعب ${m[1]} · ${m[2]}`,
      }) + by(who)
    );
  if ((m = body.match(/^Settings changed · (.*)$/)))
    return (
      tx({
        fr: `Réglages modifiés · ${m[1]}`,
        en: body,
        ar: `تعديل الإعدادات · ${m[1]}`,
      }) + by(who)
    );
  if ((m = body.match(/^Settings section "(.*)" reset to default$/)))
    return (
      tx({
        fr: `Réglages « ${m[1]} » remis aux valeurs par défaut`,
        en: body,
        ar: `إعادة إعدادات «${m[1]}» إلى القيم الافتراضية`,
      }) + by(who)
    );
  if (body === "Opening hours reset to default")
    return (
      tx({
        fr: "Horaires d'ouverture remis aux valeurs par défaut",
        en: body,
        ar: "إعادة ساعات العمل إلى القيم الافتراضية",
      }) + by(who)
    );
  if (body === "Opening hours updated")
    return tx({ fr: "Horaires d'ouverture modifiés", en: body, ar: "تعديل ساعات العمل" }) + by(who);
  if ((m = body.match(/^Closure on (\S+)( \(court #\d+\))?$/)))
    return (
      tx({
        fr: `Fermeture le ${m[1]}${(m[2] ?? "").replace("court", "terrain")}`,
        en: body,
        ar: `إغلاق يوم ${m[1]}${(m[2] ?? "").replace("court", "الملعب")}`,
      }) + by(who)
    );
  if ((m = body.match(/^Special hours (\S+) on (\S+)( \(court #\d+\))?$/)))
    return (
      tx({
        fr: `Horaires spéciaux ${m[1]} le ${m[2]}${(m[3] ?? "").replace("court", "terrain")}`,
        en: body,
        ar: `ساعات خاصة ${m[1]} يوم ${m[2]}${(m[3] ?? "").replace("court", "الملعب")}`,
      }) + by(who)
    );
  if ((m = body.match(/^Schedule exception of (\S+) removed$/)))
    return (
      tx({
        fr: `Exception du ${m[1]} supprimée`,
        en: body,
        ar: `حذف استثناء يوم ${m[1]}`,
      }) + by(who)
    );
  if ((m = body.match(/^Token pack (".*") (created|updated|deleted)( \(.*\))?$/)))
    return (
      tx({
        fr: `Pack de tokens ${m[1]} ${{ created: "créé", updated: "modifié", deleted: "supprimé" }[m[2]]}${m[3] ?? ""}`,
        en: body,
        ar: `باقة الرصيد ${m[1]}: ${{ created: "إنشاء", updated: "تعديل", deleted: "حذف" }[m[2]]}${m[3] ?? ""}`,
      }) + by(who)
    );
  if ((m = body.match(/^Shop order #(\d+) placed · (\d+) article\(s\) · (.+)$/)))
    return (
      tx({
        fr: `Commande boutique n° ${m[1]} passée · ${m[2]} article(s) · ${m[3]}`,
        en: `Shop order #${m[1]} placed · ${m[2]} article(s) · ${m[3]}`,
        ar: `طلب المتجر رقم ${m[1]} · ${m[2]} منتج · ${m[3]}`,
      }) + by(who)
    );
  if ((m = body.match(/^Shop order #(\d+) cancelled by the member$/)))
    return (
      tx({
        fr: `Commande boutique n° ${m[1]} annulée par le membre`,
        en: body,
        ar: `ألغى العضو طلب المتجر رقم ${m[1]}`,
      }) + by(who)
    );
  if ((m = body.match(/^Shop order #(\d+) is now (confirmed|shipped|delivered|cancelled)$/))) {
    const state = {
      confirmed: tx({ fr: "confirmée", en: "confirmed", ar: "مؤكد" }),
      shipped: tx({ fr: "expédiée", en: "shipped", ar: "مُرسل" }),
      delivered: tx({ fr: "remise", en: "delivered", ar: "مُسلَّم" }),
      cancelled: tx({ fr: "annulée", en: "cancelled", ar: "ملغى" }),
    }[m[2]];
    return (
      tx({
        fr: `Commande boutique n° ${m[1]} ${state}`,
        en: `Shop order #${m[1]} ${state}`,
        ar: `طلب المتجر رقم ${m[1]}: ${state}`,
      }) + by(who)
    );
  }
  if ((m = body.match(/^Shop article (".*") (created|updated|archived|deleted)$/)))
    return (
      tx({
        fr: `Article boutique ${m[1]} ${{ created: "créé", updated: "modifié", archived: "archivé", deleted: "supprimé" }[m[2]]}`,
        en: body,
        ar: `منتج المتجر ${m[1]}: ${{ created: "إنشاء", updated: "تعديل", archived: "أرشفة", deleted: "حذف" }[m[2]]}`,
      }) + by(who)
    );
  if ((m = body.match(/^(\S+) is now (admin|player)$/)))
    return (
      tx({
        fr: `${m[1]} est maintenant ${m[2] === "admin" ? "administrateur" : "joueur"}`,
        en: body,
        ar: `${m[1]} أصبح ${m[2] === "admin" ? "مسؤولًا" : "لاعبًا"}`,
      }) + by(who)
    );

  // Bookings: written without the "(by …)" suffix of desk actions
  if ((m = message.match(/^(.+) blocked: (.*)$/s)))
    return tx({
      fr: `${m[1]} bloqué : ${m[2]}`,
      en: message,
      ar: `${m[1]} محجوب: ${m[2]}`,
    });
  if ((m = message.match(/^(.+) \((own spot|full court)(?:, by (.+))?\)$/s))) {
    const mode =
      m[2] === "own spot"
        ? tx({ fr: "une place", en: "own spot", ar: "مكان واحد" })
        : tx({ fr: "terrain complet", en: "full court", ar: "ملعب كامل" });
    const desk = m[3] ? `, ${tx({ fr: "par", en: "by", ar: "بواسطة" })} ${m[3]}` : "";
    return `${m[1]} (${mode}${desk})`;
  }
  if ((m = message.match(/^(.+) cancelled(?: by (.+))?$/s)))
    return tx({
      fr: `${m[1]} · annulée${m[2] ? ` par ${m[2]}` : ""}`,
      en: message,
      ar: `${m[1]} · أُلغي${m[2] ? ` بواسطة ${m[2]}` : ""}`,
    });
  return message;
}
