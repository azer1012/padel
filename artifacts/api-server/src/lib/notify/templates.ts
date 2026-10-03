import { env } from "../../config/env";
import type { Lang } from "../club-time";

/** Every notification the club sends. One definition renders email, push and in-app copy. */
export type NotificationEvent =
  | { kind: "welcome"; firstName?: string | null }
  | {
      kind: "booking_confirmed";
      terrain: string;
      date: string;
      time: string;
      tokens: number;
      mode: "full_court" | "own_spot" | "joined";
      isPeak?: boolean;
      equipment?: { name: string; quantity: number; price: number }[];
    }
  | {
      kind: "booking_cancelled";
      terrain: string;
      date: string;
      time: string;
      refunded: number;
      /** A recurring booking cancelled by the club: how many sessions, `date` being the first */
      sessions?: number;
    }
  | {
      kind: "reservation_reminder";
      terrain: string;
      date: string;
      time: string;
      equipment?: { name: string; quantity: number }[];
    }
  | { kind: "match_finished"; terrain: string }
  | {
      kind: "invitation";
      from: string;
      terrain: string;
      date: string;
      time: string;
      /** Full-court booking: the spot is already paid */
      free: boolean;
      token: string;
    }
  | {
      /** To the admins: an order arrived from the boutique, the member is waiting for a call */
      kind: "order_placed";
      orderId: number;
      customer: string;
      phone: string;
      total: number;
      currency: string;
      units: number;
    }
  | {
      /** To the member: where their boutique order stands */
      kind: "order_update";
      orderId: number;
      status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
      /** The order was paid through the gateway: nothing to pay on reception */
      paidOnline?: boolean;
      total: number;
      currency: string;
    }
  | {
      kind: "tokens_added";
      amount: number;
      balance: number;
      reason: string;
    };

/** Club rules quoted in messages (from the settings, never hard-coded). */
export type ClubFacts = {
  currency: string;
  durationMinutes: number;
  tokenCostPlayer: number;
  tokenCostFullCourt: number;
};

type Copy = {
  subject: string;
  heading: string;
  lines: string[];
  cta?: { label: string; path: string };
  push: { title: string; body: string };
};

const t = (lang: Lang, fr: string, en: string, ar: string) =>
  lang === "ar" ? ar : lang === "en" ? en : fr;

function copy(e: NotificationEvent, lang: Lang, f: ClubFacts): Copy {
  const club = env.clubName;
  switch (e.kind) {
    case "welcome": {
      const hi = e.firstName
        ? t(lang, `Bienvenue ${e.firstName} !`, `Welcome ${e.firstName}!`, `مرحبًا ${e.firstName}!`)
        : t(lang, "Bienvenue !", "Welcome!", "مرحبًا!");
      return {
        subject: t(lang, `Bienvenue chez ${club}`, `Welcome to ${club}`, `مرحبًا بك في ${club}`),
        heading: hi,
        lines: [
          t(
            lang,
            "Votre compte est prêt. Voici comment ça marche :",
            "Your account is ready. Here's how it works:",
            "حسابك جاهز. إليك طريقة العمل:",
          ),
          t(
            lang,
            `Une place de joueur = ${f.tokenCostPlayer} token(s) pour un match de ${f.durationMinutes} minutes. Un terrain complet = ${f.tokenCostFullCourt} tokens.`,
            `One player spot = ${f.tokenCostPlayer} token(s) for a ${f.durationMinutes}-minute match. A full court = ${f.tokenCostFullCourt} tokens.`,
            `مكان لاعب = ${f.tokenCostPlayer} رصيد لمباراة مدتها ${f.durationMinutes} دقيقة. الملعب الكامل = ${f.tokenCostFullCourt} أرصدة.`,
          ),
          t(
            lang,
            "Rechargez vos tokens à l'accueil, puis réservez en 3 taps ou rejoignez un open match.",
            "Top up your tokens at the front desk, then book in 3 taps or join an open match.",
            "اشحن رصيدك في الاستقبال ثم احجز بثلاث نقرات أو انضم لمباراة مفتوحة.",
          ),
        ],
        cta: {
          label: t(lang, "Voir les terrains libres", "See free courts", "شاهد الملاعب المتاحة"),
          path: "/terrains",
        },
        push: {
          title: t(lang, `Bienvenue chez ${club}`, `Welcome to ${club}`, `مرحبًا بك في ${club}`),
          body: t(lang, "Votre compte est prêt.", "Your account is ready.", "حسابك جاهز."),
        },
      };
    }
    case "booking_confirmed": {
      const what =
        e.mode === "full_court"
          ? t(lang, "terrain complet", "full court", "ملعب كامل")
          : e.mode === "own_spot"
            ? t(lang, "votre place", "your spot", "مكانك")
            : t(lang, "votre place dans le match", "your spot in the match", "مكانك في المباراة");
      const gear = (e.equipment ?? []).filter((g) => g.quantity > 0);
      const gearTotal = gear.reduce((s, g) => s + g.price * g.quantity, 0);
      return {
        subject: t(
          lang,
          `C'est réservé : ${e.terrain}, ${e.date} à ${e.time}`,
          `Booked: ${e.terrain}, ${e.date} at ${e.time}`,
          `تم الحجز: ${e.terrain}، ${e.date} الساعة ${e.time}`,
        ),
        heading: t(lang, "C'est réservé !", "You're booked!", "تم الحجز!"),
        lines: [
          `${e.terrain} · ${e.date} · ${e.time}`,
          t(
            lang,
            `${e.tokens} token(s) débité(s) pour ${what}.`,
            `${e.tokens} token(s) charged for ${what}.`,
            `تم خصم ${e.tokens} رصيد مقابل ${what}.`,
          ) + (e.isPeak ? t(lang, " (heures pleines)", " (peak hours)", " (ساعات الذروة)") : ""),
          ...(gear.length
            ? [
                t(
                  lang,
                  "Matériel réservé, prêt à l'accueil : ",
                  "Equipment reserved, ready at the front desk: ",
                  "المعدات محجوزة وجاهزة في الاستقبال: ",
                ) +
                  gear.map((g) => `${g.quantity} × ${g.name}`).join(", ") +
                  (gearTotal ? ` (${gearTotal} ${f.currency})` : ""),
              ]
            : []),
          t(
            lang,
            "Arrivez 10 minutes avant pour vous échauffer.",
            "Arrive 10 minutes early to warm up.",
            "احضر قبل 10 دقائق للإحماء.",
          ),
        ],
        cta: {
          label: t(lang, "Voir ma réservation", "View my booking", "عرض حجزي"),
          path: "/reservations",
        },
        push: {
          title: t(lang, "C'est réservé !", "You're booked!", "تم الحجز!"),
          body: `${e.terrain} · ${e.date} · ${e.time}`,
        },
      };
    }
    case "booking_cancelled":
      return {
        subject: t(
          lang,
          `Réservation annulée : ${e.terrain}, ${e.date}`,
          `Booking cancelled: ${e.terrain}, ${e.date}`,
          `تم إلغاء الحجز: ${e.terrain}، ${e.date}`,
        ),
        heading: t(lang, "Réservation annulée", "Booking cancelled", "تم إلغاء الحجز"),
        lines: [
          `${e.terrain} · ${e.date} · ${e.time}`,
          ...(e.sessions && e.sessions > 1
            ? [
                t(
                  lang,
                  `Réservation récurrente : ${e.sessions} séances annulées à partir de cette date.`,
                  `Recurring booking: ${e.sessions} sessions cancelled from this date on.`,
                  `حجز متكرر: تم إلغاء ${e.sessions} حصص ابتداءً من هذا التاريخ.`,
                ),
              ]
            : []),
          e.refunded > 0
            ? t(
                lang,
                `${e.refunded} token(s) remboursé(s) sur votre solde.`,
                `${e.refunded} token(s) refunded to your balance.`,
                `تمت إعادة ${e.refunded} رصيد إلى حسابك.`,
              )
            : t(
                lang,
                "Aucun token n'avait été débité.",
                "No tokens had been charged.",
                "لم يتم خصم أي رصيد.",
              ),
        ],
        cta: {
          label: t(lang, "Trouver un autre créneau", "Find another slot", "ابحث عن موعد آخر"),
          path: "/terrains",
        },
        push: {
          title: t(lang, "Réservation annulée", "Booking cancelled", "تم إلغاء الحجز"),
          body: `${e.terrain} · ${e.date} · ${e.time}`,
        },
      };
    case "reservation_reminder": {
      const gear = (e.equipment ?? []).filter((g) => g.quantity > 0);
      return {
        subject: t(
          lang,
          `Rappel : votre match à ${e.time} (${e.terrain})`,
          `Reminder: your match at ${e.time} (${e.terrain})`,
          `تذكير: مباراتك الساعة ${e.time} (${e.terrain})`,
        ),
        heading: t(
          lang,
          `Votre match commence à ${e.time}`,
          `Your match starts at ${e.time}`,
          `مباراتك تبدأ الساعة ${e.time}`,
        ),
        lines: [
          `${e.terrain} · ${e.date}`,
          ...(gear.length
            ? [
                t(
                  lang,
                  "Votre matériel vous attend à l'accueil : ",
                  "Your equipment is waiting at the front desk: ",
                  "معداتك بانتظارك في الاستقبال: ",
                ) + gear.map((g) => `${g.quantity} × ${g.name}`).join(", "),
              ]
            : []),
          t(
            lang,
            "Un empêchement ? Annulez depuis l'app pour libérer le terrain.",
            "Can't make it? Cancel in the app to free the court.",
            "لا تستطيع الحضور؟ ألغِ من التطبيق لتحرير الملعب.",
          ),
        ],
        cta: {
          label: t(lang, "Voir ma réservation", "View my booking", "عرض حجزي"),
          path: "/reservations",
        },
        push: {
          title: t(lang, `Match à ${e.time} !`, `Match at ${e.time}!`, `مباراة الساعة ${e.time}!`),
          body: `${e.terrain} · ${t(lang, "pensez à vos balles", "bring your balls", "لا تنسَ الكرات")}`,
        },
      };
    }
    case "match_finished":
      return {
        subject: t(
          lang,
          "Merci pour ce match ! On remet ça ?",
          "Thanks for playing! Same time next week?",
          "شكرًا على المباراة! نلعب مجددًا؟",
        ),
        heading: t(lang, "Bien joué !", "Well played!", "أحسنت!"),
        lines: [
          t(
            lang,
            `Merci d'avoir joué sur ${e.terrain}. On espère que la partie était belle.`,
            `Thanks for playing on ${e.terrain}. We hope it was a great game.`,
            `شكرًا للعب على ${e.terrain}. نتمنى أنها كانت مباراة رائعة.`,
          ),
          t(
            lang,
            "Les meilleurs créneaux partent vite : réservez le prochain dès maintenant.",
            "The best slots go fast: book your next one now.",
            "أفضل المواعيد تُحجز بسرعة: احجز موعدك القادم الآن.",
          ),
        ],
        cta: {
          label: t(
            lang,
            "Réserver le prochain match",
            "Book the next match",
            "احجز المباراة القادمة",
          ),
          path: "/terrains",
        },
        push: {
          title: t(lang, "Bien joué !", "Well played!", "أحسنت!"),
          body: t(
            lang,
            "Réservez le prochain match en 3 taps.",
            "Book your next match in 3 taps.",
            "احجز مباراتك القادمة بثلاث نقرات.",
          ),
        },
      };
    case "invitation":
      return {
        subject: t(
          lang,
          `${e.from} vous invite à jouer : ${e.terrain}, ${e.date} à ${e.time}`,
          `${e.from} invited you to play: ${e.terrain}, ${e.date} at ${e.time}`,
          `${e.from} يدعوك للعب: ${e.terrain}، ${e.date} الساعة ${e.time}`,
        ),
        heading: t(lang, "Invitation à un match", "Match invitation", "دعوة إلى مباراة"),
        lines: [
          t(
            lang,
            `${e.from} vous invite : ${e.terrain} · ${e.date} · ${e.time}.`,
            `${e.from} invited you: ${e.terrain} · ${e.date} · ${e.time}.`,
            `${e.from} يدعوك: ${e.terrain} · ${e.date} · ${e.time}.`,
          ),
          e.free
            ? t(
                lang,
                "Votre place est déjà payée. Acceptez ou refusez dans l'app.",
                "Your spot is already paid for. Accept or decline in the app.",
                "مكانك مدفوع مسبقًا. اقبل أو ارفض من التطبيق.",
              )
            : t(
                lang,
                `Acceptez pour réserver votre place (${f.tokenCostPlayer} token(s)), ou refusez.`,
                `Accept to take your spot (${f.tokenCostPlayer} token(s)), or decline.`,
                `اقبل لحجز مكانك (${f.tokenCostPlayer} رصيد) أو ارفض.`,
              ),
        ],
        cta: {
          label: t(lang, "Répondre à l'invitation", "Answer the invitation", "الرد على الدعوة"),
          path: `/join/${e.token}`,
        },
        push: {
          title: t(lang, "Invitation à un match", "Match invitation", "دعوة إلى مباراة"),
          body: `${e.from} · ${e.terrain} · ${e.date} · ${e.time}`,
        },
      };
    case "order_placed":
      return {
        subject: t(
          lang,
          `Nouvelle commande n° ${e.orderId} : ${e.customer}`,
          `New order #${e.orderId}: ${e.customer}`,
          `طلب جديد رقم ${e.orderId}: ${e.customer}`,
        ),
        heading: t(lang, "Nouvelle commande", "New order", "طلب جديد"),
        lines: [
          t(
            lang,
            `${e.customer} · ${e.units} article(s) · ${e.total} ${e.currency}`,
            `${e.customer} · ${e.units} article(s) · ${e.total} ${e.currency}`,
            `${e.customer} · ${e.units} منتج · ${e.total} ${e.currency}`,
          ),
          t(
            lang,
            `Appelez le ${e.phone} pour confirmer la commande.`,
            `Call ${e.phone} to confirm the order.`,
            `اتصل بالرقم ${e.phone} لتأكيد الطلب.`,
          ),
        ],
        cta: {
          label: t(lang, "Voir la commande", "View the order", "عرض الطلب"),
          path: "/admin/shop",
        },
        push: {
          title: t(
            lang,
            `Nouvelle commande n° ${e.orderId}`,
            `New order #${e.orderId}`,
            `طلب جديد رقم ${e.orderId}`,
          ),
          body: `${e.customer} · ${e.total} ${e.currency} · ${e.phone}`,
        },
      };
    case "order_update": {
      const what = {
        pending: t(
          lang,
          "Nous avons bien reçu votre commande. Le club vous appelle pour la confirmer.",
          "We received your order. The club will call you to confirm it.",
          "استلمنا طلبك. سيتصل بك النادي لتأكيده.",
        ),
        confirmed: t(
          lang,
          "Votre commande est confirmée. Nous la préparons.",
          "Your order is confirmed. We are preparing it.",
          "تم تأكيد طلبك. نقوم بتحضيره.",
        ),
        shipped: t(
          lang,
          "Votre commande est en route.",
          "Your order is on its way.",
          "طلبك في الطريق.",
        ),
        delivered: t(
          lang,
          "Votre commande a été remise. Bon jeu !",
          "Your order has been delivered. Enjoy your game!",
          "تم تسليم طلبك. لعبًا ممتعًا!",
        ),
        cancelled: t(
          lang,
          "Votre commande a été annulée.",
          "Your order has been cancelled.",
          "تم إلغاء طلبك.",
        ),
      }[e.status];
      const title = t(
        lang,
        `Commande n° ${e.orderId}`,
        `Order #${e.orderId}`,
        `الطلب رقم ${e.orderId}`,
      );
      return {
        subject: `${title} · ${what}`,
        heading: title,
        lines: [
          what,
          // Nothing to pay for an order that was cancelled; nothing left for one paid online
          ...(e.status === "cancelled"
            ? e.paidOnline
              ? [
                  t(
                    lang,
                    `Vous aviez payé ${e.total} ${e.currency} en ligne : le club vous rembourse.`,
                    `You had paid ${e.total} ${e.currency} online: the club refunds you.`,
                    `كنت قد دفعت ${e.total} ${e.currency} عبر الإنترنت: سيعيد النادي المبلغ إليك.`,
                  ),
                ]
              : []
            : e.paidOnline
              ? [
                  t(
                    lang,
                    `Total : ${e.total} ${e.currency}, déjà payé en ligne.`,
                    `Total: ${e.total} ${e.currency}, already paid online.`,
                    `المجموع: ${e.total} ${e.currency}، مدفوع عبر الإنترنت.`,
                  ),
                ]
              : [
                  t(
                    lang,
                    `Total : ${e.total} ${e.currency}, à régler en espèces à la réception.`,
                    `Total: ${e.total} ${e.currency}, paid in cash on reception.`,
                    `المجموع: ${e.total} ${e.currency}، يُدفع نقدًا عند الاستلام.`,
                  ),
                ]),
        ],
        cta: {
          label: t(lang, "Voir ma commande", "View my order", "عرض طلبي"),
          path: "/boutique",
        },
        push: { title, body: what },
      };
    }
    case "tokens_added":
      return {
        subject: t(
          lang,
          `${e.amount} token(s) ajouté(s) à votre compte`,
          `${e.amount} token(s) added to your account`,
          `تمت إضافة ${e.amount} رصيد إلى حسابك`,
        ),
        heading: t(lang, `+${e.amount} token(s)`, `+${e.amount} token(s)`, `+${e.amount} رصيد`),
        lines: [
          t(lang, `Motif : ${e.reason}`, `Reason: ${e.reason}`, `السبب: ${e.reason}`),
          t(
            lang,
            `Nouveau solde : ${e.balance} token(s).`,
            `New balance: ${e.balance} token(s).`,
            `الرصيد الجديد: ${e.balance}.`,
          ),
        ],
        cta: {
          label: t(lang, "Réserver un terrain", "Book a court", "احجز ملعبًا"),
          path: "/terrains",
        },
        push: {
          title: t(lang, `+${e.amount} token(s)`, `+${e.amount} token(s)`, `+${e.amount} رصيد`),
          body: t(
            lang,
            `Nouveau solde : ${e.balance}`,
            `New balance: ${e.balance}`,
            `الرصيد الجديد: ${e.balance}`,
          ),
        },
      };
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Table-based, inline-styled HTML so it renders in Gmail, Outlook and Apple Mail. */
function layout(c: Copy, lang: Lang, url: (p: string) => string) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";
  const font =
    lang === "ar"
      ? "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif"
      : "'Figtree',Helvetica,Arial,sans-serif";
  const lines = c.lines
    .map(
      (l) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#2B3566">${esc(l)}</p>`,
    )
    .join("");
  const button = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="border-radius:999px;background:#2E4CF6"><a href="${esc(url(c.cta.path))}" style="display:inline-block;padding:15px 28px;font-family:${font};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(c.cta.label)}</a></td></tr></table>`
    : "";
  const manage = t(lang, "Gérer mes notifications", "Manage notifications", "إدارة الإشعارات");
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F6FF">
<div style="display:none;max-height:0;overflow:hidden">${esc(c.lines[0] ?? "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FF"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#0A1030;border-radius:28px 28px 0 0;padding:26px 30px;text-align:${align}">
<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#DDF74A;vertical-align:middle"></span>
<span style="font-family:${font};font-size:19px;font-weight:800;color:#ffffff;vertical-align:middle;margin-${lang === "ar" ? "right" : "left"}:8px">${esc(env.clubName)}</span>
</td></tr>
<tr><td dir="${dir}" style="background:#ffffff;border-radius:0 0 28px 28px;padding:34px 30px 30px;text-align:${align};font-family:${font}">
<h1 style="margin:0 0 18px;font-family:${font};font-size:30px;line-height:1.1;font-weight:800;color:#101A4D">${esc(c.heading)}</h1>
${lines}${button}
</td></tr>
<tr><td dir="${dir}" style="padding:20px 30px;text-align:center;font-family:${font};font-size:13px;line-height:1.6;color:#6B74A6">
${esc(env.clubName)}${env.clubAddress ? ` · ${esc(env.clubAddress)}` : ""}<br>
<a href="${esc(url("/profile"))}" style="color:#6B74A6">${esc(manage)}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function render(e: NotificationEvent, lang: Lang, frontendUrl: string, facts: ClubFacts) {
  const c = copy(e, lang, facts);
  const url = (p: string) => `${frontendUrl.replace(/\/$/, "")}${p}`;
  return {
    subject: c.subject,
    html: layout(c, lang, url),
    text: [
      c.heading,
      "",
      ...c.lines,
      ...(c.cta ? ["", `${c.cta.label}: ${url(c.cta.path)}`] : []),
    ].join("\n"),
    push: { ...c.push, url: c.cta ? url(c.cta.path) : url("/dashboard") },
    inApp: { title: c.push.title, message: c.lines.slice(0, 2).join(" ") },
  };
}
