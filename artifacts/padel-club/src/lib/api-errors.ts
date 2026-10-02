import { apiErrorCode, apiErrorMessage } from "@workspace/api-client-react";
import type { Copy, useTx } from "./i18n";
import { friendlyError } from "./labels";

/**
 * The API answers with a machine code and an English sentence. Members read the app
 * in French or Arabic, so the codes they can run into are worded here, in their language
 * and with what to do next. Anything else (mostly admin form validation) keeps the
 * API's own sentence; a failure with no explanation gets a plain "try again".
 */
const BY_CODE: Record<string, Copy> = {
  SLOT_TAKEN: {
    fr: "Ce terrain vient d'être réservé par un autre joueur. Choisissez un autre horaire.",
    en: "Another player just booked this court. Pick another time.",
    ar: "حجز لاعب آخر هذا الملعب للتو. اختر وقتًا آخر.",
  },
  INSUFFICIENT_TOKENS: {
    fr: "Solde de tokens insuffisant. Rechargez à l'accueil du club.",
    en: "Not enough tokens. Top up at the club front desk.",
    ar: "رصيد غير كافٍ. اشحن من استقبال النادي.",
  },
  MATCH_FULL: {
    fr: "Ce match est complet : la dernière place vient d'être prise.",
    en: "This match is full: the last spot was just taken.",
    ar: "المباراة مكتملة: أُخذ آخر مكان للتو.",
  },
  RESERVATION_FULL: {
    fr: "Ce match est complet : la dernière place vient d'être prise.",
    en: "This match is full: the last spot was just taken.",
    ar: "المباراة مكتملة: أُخذ آخر مكان للتو.",
  },
  ALREADY_JOINED: {
    fr: "Ce joueur a déjà une place dans ce match.",
    en: "This player already has a spot in this match.",
    ar: "هذا اللاعب لديه مكان في المباراة بالفعل.",
  },
  ALREADY_INVITED: {
    fr: "Ce membre a déjà une invitation en attente pour ce match.",
    en: "This member already has a pending invitation for this match.",
    ar: "لدى هذا العضو دعوة معلّقة لهذه المباراة.",
  },
  MATCH_STARTED: {
    fr: "Ce match a déjà commencé.",
    en: "This match has already started.",
    ar: "بدأت هذه المباراة بالفعل.",
  },
  MATCH_INACTIVE: {
    fr: "Ce match a été annulé.",
    en: "This match was cancelled.",
    ar: "تم إلغاء هذه المباراة.",
  },
  ALREADY_CANCELLED: {
    fr: "Cette réservation est déjà annulée.",
    en: "This booking is already cancelled.",
    ar: "هذا الحجز ملغى بالفعل.",
  },
  CANCELLATION_CLOSED: {
    fr: "Il est trop tard pour annuler en ligne. Appelez le club.",
    en: "It is too late to cancel online. Please call the club.",
    ar: "فات أوان الإلغاء عبر التطبيق. اتصل بالنادي.",
  },
  SLOT_IN_PAST: {
    fr: "Ce créneau a déjà commencé. Choisissez un autre horaire.",
    en: "This slot has already started. Pick another time.",
    ar: "بدأ هذا الموعد بالفعل. اختر وقتًا آخر.",
  },
  INVALID_SLOT: {
    fr: "Ce créneau n'existe plus. Actualisez le planning et réessayez.",
    en: "This slot no longer exists. Refresh the schedule and try again.",
    ar: "هذا الموعد لم يعد موجودًا. حدّث الجدول وحاول مجددًا.",
  },
  TOO_LATE_TO_BOOK: {
    fr: "Ce créneau commence trop tôt pour être réservé en ligne. Appelez le club.",
    en: "This slot starts too soon to book online. Please call the club.",
    ar: "هذا الموعد قريب جدًا للحجز عبر التطبيق. اتصل بالنادي.",
  },
  TOO_FAR_AHEAD: {
    fr: "Ce créneau n'est pas encore ouvert à la réservation.",
    en: "This slot is not open for booking yet.",
    ar: "لم يُفتح الحجز لهذا الموعد بعد.",
  },
  CLUB_CLOSED: {
    fr: "Le club est fermé à cette date.",
    en: "The club is closed on that date.",
    ar: "النادي مغلق في هذا التاريخ.",
  },
  OUTSIDE_OPENING_HOURS: {
    fr: "Ce terrain est fermé à cet horaire.",
    en: "This court is closed at that time.",
    ar: "هذا الملعب مغلق في هذا الوقت.",
  },
  COURT_MAINTENANCE: {
    fr: "Ce terrain est en maintenance. Choisissez-en un autre.",
    en: "This court is under maintenance. Pick another one.",
    ar: "هذا الملعب تحت الصيانة. اختر ملعبًا آخر.",
  },
  COURT_UNAVAILABLE: {
    fr: "Ce terrain n'est pas disponible. Choisissez-en un autre.",
    en: "This court is not available. Pick another one.",
    ar: "هذا الملعب غير متاح. اختر ملعبًا آخر.",
  },
  EQUIPMENT_UNAVAILABLE: {
    fr: "Ce matériel n'est plus disponible en quantité suffisante à cet horaire.",
    en: "There is not enough of this equipment left at that time.",
    ar: "هذه المعدات غير متوفرة بالكمية المطلوبة في هذا الوقت.",
  },
  OUT_OF_STOCK: {
    fr: "Il n'en reste plus assez en stock. Ajustez la quantité dans votre panier.",
    en: "Not enough left in stock. Adjust the quantity in your cart.",
    ar: "الكمية المتوفرة غير كافية. عدّل الكمية في سلتك.",
  },
  PRODUCT_GONE: {
    fr: "Un article de votre panier n'est plus en vente. Retirez-le pour continuer.",
    en: "An article in your cart is no longer on sale. Remove it to continue.",
    ar: "أحد منتجات سلتك لم يعد معروضًا. احذفه للمتابعة.",
  },
  PHONE_REQUIRED: {
    fr: "Indiquez un numéro de téléphone valide : le club vous appelle pour confirmer.",
    en: "Enter a valid phone number: the club calls you to confirm.",
    ar: "أدخل رقم هاتف صحيحًا: سيتصل بك النادي للتأكيد.",
  },
  ADDRESS_REQUIRED: {
    fr: "Indiquez l'adresse de livraison.",
    en: "Enter the delivery address.",
    ar: "أدخل عنوان التوصيل.",
  },
  ORDER_CONFIRMED: {
    fr: "Le club a déjà confirmé cette commande. Appelez le club pour la modifier.",
    en: "The club has already confirmed this order. Call the club to change it.",
    ar: "أكّد النادي هذا الطلب. اتصل بالنادي لتعديله.",
  },
  CASH_DISABLED: {
    fr: "Le paiement au club n'est pas proposé : réglez avec vos tokens.",
    en: "Paying at the club is not available: use your tokens.",
    ar: "الدفع في النادي غير متاح: استخدم رصيدك.",
  },
  FEATURE_DISABLED: {
    fr: "Cette fonctionnalité n'est pas activée dans ce club.",
    en: "This feature is switched off at this club.",
    ar: "هذه الخاصية غير مفعّلة في هذا النادي.",
  },
  INVITE_USED: {
    fr: "Cette invitation a déjà été acceptée.",
    en: "This invitation was already accepted.",
    ar: "تم قبول هذه الدعوة بالفعل.",
  },
  INVITE_DECLINED: {
    fr: "Cette invitation a été refusée.",
    en: "This invitation was declined.",
    ar: "تم رفض هذه الدعوة.",
  },
  INVITE_EXPIRED: {
    fr: "Cette invitation a expiré. Demandez-en une nouvelle à l'organisateur.",
    en: "This invitation has expired. Ask the organiser for a new one.",
    ar: "انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة من المنظّم.",
  },
  INVITE_CANCELLED: {
    fr: "Cette invitation a été annulée.",
    en: "This invitation was cancelled.",
    ar: "تم إلغاء هذه الدعوة.",
  },
  TOURNAMENT_FULL: {
    fr: "Ce tournoi est complet.",
    en: "This tournament is full.",
    ar: "هذه البطولة مكتملة.",
  },
  ALREADY_REGISTERED: {
    fr: "Votre équipe est déjà inscrite.",
    en: "Your team is already registered.",
    ar: "فريقك مسجّل بالفعل.",
  },
  REGISTRATION_CLOSED: {
    fr: "Les inscriptions ne peuvent plus être modifiées.",
    en: "Registration can no longer be changed.",
    ar: "لم يعد ممكنًا تعديل التسجيل.",
  },
  NOT_IN_MATCH: {
    fr: "Vous ne faites pas partie de ce match.",
    en: "You are not in this match.",
    ar: "لست ضمن هذه المباراة.",
  },
  FORBIDDEN: {
    fr: "Vous n'avez pas le droit de faire cette action.",
    en: "You are not allowed to do this.",
    ar: "غير مسموح لك بهذا الإجراء.",
  },
  UNAUTHORIZED: {
    fr: "Votre session a expiré. Reconnectez-vous.",
    en: "Your session has expired. Please sign in again.",
    ar: "انتهت جلستك. سجّل الدخول مجددًا.",
  },
  NOT_FOUND: {
    fr: "Cet élément n'existe plus. Actualisez la page.",
    en: "This item no longer exists. Refresh the page.",
    ar: "هذا العنصر لم يعد موجودًا. حدّث الصفحة.",
  },
  USER_NOT_FOUND: {
    fr: "Ce membre est introuvable.",
    en: "This member could not be found.",
    ar: "تعذر العثور على هذا العضو.",
  },
  RATE_LIMITED: {
    fr: "Trop de tentatives. Patientez un instant avant de réessayer.",
    en: "Too many attempts. Wait a moment before trying again.",
    ar: "محاولات كثيرة. انتظر لحظة ثم حاول مجددًا.",
  },
  LAST_ADMIN: {
    fr: "Le club doit garder au moins un administrateur.",
    en: "The club needs at least one admin.",
    ar: "يجب أن يبقى للنادي مسؤول واحد على الأقل.",
  },
  SELF_DEMOTE: {
    fr: "Vous ne pouvez pas retirer votre propre accès admin.",
    en: "You can't remove your own admin access.",
    ar: "لا يمكنك سحب صلاحيتك كمسؤول.",
  },
};

/** What to tell the person when an API call failed: localized, never a status code. */
export function apiErrorText(e: unknown, tx: ReturnType<typeof useTx>): string {
  const code = apiErrorCode(e);
  if (code && BY_CODE[code]) return tx(BY_CODE[code]);
  const status = (e as { status?: number })?.status;
  // Server faults and network failures carry nothing a member can act on
  if (code === "INTERNAL_ERROR" || (typeof status === "number" && status >= 500))
    return friendlyError(tx);
  return apiErrorMessage(e, "") || friendlyError(tx);
}
