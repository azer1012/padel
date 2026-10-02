import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import type { EmailOtpType } from "@supabase/supabase-js";
import { EnvelopeSimpleIcon, ShieldWarningIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/smash/brand";
import { useTx } from "@/lib/i18n";

const TYPES: readonly EmailOtpType[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Where to go after the link: a page of this site only, the dashboard otherwise. */
function nextPath(next: string | null) {
  if (!next) return "/dashboard";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";
    const path = url.pathname.slice(basePath.length) || "/";
    return path.startsWith("/") && !path.startsWith("//") ? `${path}${url.search}` : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/**
 * Landing page of the account e-mails (confirm sign-up, reset password). The link
 * carries a one-time token hash that Supabase exchanges for a session, so it works
 * on any device, not only in the browser where the member asked for it.
 */
export default function AuthConfirm() {
  const tx = useTx();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The token is single-use: never send it twice
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    const target = type === "recovery" ? "/reset-password" : nextPath(params.get("next"));
    if (!tokenHash || !type || !TYPES.includes(type)) {
      setError(authErrorMessage({ message: "expired", code: "otp_expired" }, tx));
      return;
    }
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ error: err }) => {
      if (!err) return setLocation(target, { replace: true });
      // Link opened a second time by a member who is already in: nothing to fix
      const { data } = await supabase.auth.getSession();
      if (data.session && type !== "recovery") return setLocation(target, { replace: true });
      setError(authErrorMessage(err, tx));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-5 py-6 sm:px-10">
      <Logo tone="dark" />
      <div
        className="enter mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6 py-10"
        aria-busy={!error}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-ball text-night">
          {error ? (
            <ShieldWarningIcon className="size-6" />
          ) : (
            <EnvelopeSimpleIcon className="size-6" />
          )}
        </span>
        {error ? (
          <>
            <h1 className="disp m-0 text-[40px] leading-[0.95]">
              {tx({ fr: "Lien non valide", en: "Link not valid", ar: "الرابط غير صالح" })}
            </h1>
            <p className="m-0 text-muted-foreground" role="alert">
              {error}
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
        ) : (
          <>
            <h1 className="disp m-0 text-[40px] leading-[0.95]">
              {tx({ fr: "Vérification du lien…", en: "Checking your link…", ar: "جارٍ التحقق…" })}
            </h1>
            <p className="m-0 text-muted-foreground" role="status">
              {tx({
                fr: "Un instant, nous ouvrons votre espace.",
                en: "One moment, we are opening your account.",
                ar: "لحظة من فضلك.",
              })}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
