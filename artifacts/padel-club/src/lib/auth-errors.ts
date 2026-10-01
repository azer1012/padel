import type { AuthError } from "@supabase/supabase-js";
import type { useTx } from "./i18n";

type Tx = ReturnType<typeof useTx>;

/** Turns Supabase Auth errors into short, translated messages (never raw technical text). */
export function authErrorMessage(
  error: Pick<AuthError, "message"> & { code?: string; status?: number },
  tx: Tx,
) {
  const code = error.code ?? "";
  const msg = error.message?.toLowerCase() ?? "";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return tx({
      fr: "Email ou mot de passe incorrect.",
      en: "Wrong email or password.",
      ar: "البريد أو كلمة المرور غير صحيحة.",
    });
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return tx({
      fr: "Confirmez d'abord votre email (vérifiez vos spams).",
      en: "Please confirm your email first (check your spam folder).",
      ar: "يرجى تأكيد بريدك أولًا (تحقق من الرسائل غير المرغوب فيها).",
    });
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered")
  )
    return tx({
      fr: "Un compte existe déjà avec cet email.",
      en: "An account already uses this email.",
      ar: "يوجد حساب بهذا البريد.",
    });
  if (code === "weak_password" || msg.includes("password should"))
    return tx({
      fr: "Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.",
      en: "Password too weak: at least 8 characters with letters and numbers.",
      ar: "كلمة المرور ضعيفة: 8 أحرف على الأقل مع حروف وأرقام.",
    });
  if (code === "same_password")
    return tx({
      fr: "Choisissez un mot de passe différent de l'ancien.",
      en: "Choose a different password.",
      ar: "اختر كلمة مرور مختلفة.",
    });
  if (code.startsWith("over_") || error.status === 429 || msg.includes("rate limit"))
    return tx({
      fr: "Trop de tentatives. Réessayez dans quelques minutes.",
      en: "Too many attempts. Try again in a few minutes.",
      ar: "محاولات كثيرة. أعد المحاولة بعد دقائق.",
    });
  if (code === "email_address_invalid" || msg.includes("invalid email"))
    return tx({
      fr: "Adresse email invalide.",
      en: "Invalid email address.",
      ar: "بريد إلكتروني غير صالح.",
    });
  if (code === "signup_disabled")
    return tx({
      fr: "Les inscriptions sont fermées.",
      en: "Sign-ups are closed.",
      ar: "التسجيل مغلق.",
    });
  if (code === "otp_expired" || msg.includes("expired"))
    return tx({
      fr: "Ce lien a expiré. Demandez-en un nouveau.",
      en: "This link expired. Request a new one.",
      ar: "انتهت صلاحية الرابط.",
    });
  if (msg.includes("provider is not enabled") || code === "validation_failed")
    return tx({
      fr: "Cette méthode de connexion n'est pas disponible.",
      en: "This sign-in method isn't available.",
      ar: "طريقة الدخول هذه غير متاحة.",
    });
  if (msg.includes("fetch") || msg.includes("network"))
    return tx({
      fr: "Connexion impossible. Vérifiez votre réseau.",
      en: "Can't connect. Check your network.",
      ar: "تعذر الاتصال.",
    });
  return tx({
    fr: "Une erreur est survenue. Réessayez.",
    en: "Something went wrong. Try again.",
    ar: "حدث خطأ. حاول مجددًا.",
  });
}
