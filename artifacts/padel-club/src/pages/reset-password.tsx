import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { CheckIcon, KeyIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { PasswordInput, passwordIsStrong } from "@/components/smash/password-input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/smash/brand";
import { useTx } from "@/lib/i18n";

/**
 * Landing page of the "reset password" email. Supabase signs the user in from the
 * link (PASSWORD_RECOVERY), then they choose a new password here.
 */
export default function ResetPassword() {
  const tx = useTx();
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search || window.location.hash.replace(/^#/, ""),
    );
    const desc = params.get("error_description");
    if (desc)
      setLinkError(
        authErrorMessage({ message: desc, code: params.get("error_code") ?? undefined }, tx),
      );
  }, [tx]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!passwordIsStrong(password)) {
      setError(
        tx({
          fr: "Mot de passe trop faible : 8 caractères minimum, avec des lettres et des chiffres.",
          en: "Password too weak: at least 8 characters, with letters and numbers.",
          ar: "كلمة المرور ضعيفة: 8 أحرف على الأقل مع حروف وأرقام.",
        }),
      );
      return;
    }
    if (password !== confirm) {
      setError(
        tx({
          fr: "Les deux mots de passe ne correspondent pas.",
          en: "Passwords don't match.",
          ar: "كلمتا المرور غير متطابقتين.",
        }),
      );
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(authErrorMessage(err, tx));
      return;
    }
    setDone(true);
    setTimeout(() => setLocation("/dashboard"), 1500);
  };

  const invalid = linkError || (isLoaded && !isSignedIn);

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-5 py-6 sm:px-10">
      <Logo tone="dark" />
      <div className="enter mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6 py-10">
        <span className="flex size-14 items-center justify-center rounded-full bg-ball text-night">
          {done ? <CheckIcon className="size-6" /> : <KeyIcon className="size-6" />}
        </span>
        <h1 className="disp m-0 text-[40px] leading-[0.95]">
          {done
            ? tx({ fr: "Mot de passe changé", en: "Password updated", ar: "تم تغيير كلمة المرور" })
            : tx({ fr: "Nouveau mot de passe", en: "New password", ar: "كلمة مرور جديدة" })}
        </h1>
        {invalid && !done ? (
          <>
            <p className="m-0 text-muted-foreground">
              {linkError ??
                tx({
                  fr: "Ce lien n'est plus valide. Demandez un nouveau lien depuis la page de connexion.",
                  en: "This link is no longer valid. Request a new one from the sign-in page.",
                  ar: "هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا من صفحة الدخول.",
                })}
            </p>
            <Button asChild>
              <Link href="/sign-in">
                {tx({
                  fr: "Retour à la connexion",
                  en: "Back to sign in",
                  ar: "العودة لتسجيل الدخول",
                })}
              </Link>
            </Button>
          </>
        ) : done ? (
          <p className="m-0 text-muted-foreground" role="status">
            {tx({
              fr: "Redirection vers votre espace…",
              en: "Taking you to your dashboard…",
              ar: "جارٍ التحويل…",
            })}
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div>
              <Label htmlFor="new-password">
                {tx({ fr: "Nouveau mot de passe", en: "New password", ar: "كلمة المرور الجديدة" })}
              </Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                minLength={8}
                required
                aria-describedby="new-password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p id="new-password-hint" className="m-0 mt-2 text-xs text-muted-foreground">
                {tx({
                  fr: "8 caractères minimum, avec des lettres et des chiffres.",
                  en: "At least 8 characters, with letters and numbers.",
                  ar: "8 أحرف على الأقل، مع حروف وأرقام.",
                })}
              </p>
            </div>
            <div>
              <Label htmlFor="confirm-password">
                {tx({
                  fr: "Confirmer le mot de passe",
                  en: "Confirm the password",
                  ar: "تأكيد كلمة المرور",
                })}
              </Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p
                role="alert"
                className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
              >
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={saving || !isLoaded} loading={saving}>
              {tx({
                fr: "Enregistrer le mot de passe",
                en: "Save the password",
                ar: "حفظ كلمة المرور",
              })}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
