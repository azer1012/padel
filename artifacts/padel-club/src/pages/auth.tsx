import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowRightIcon, CheckIcon, EnvelopeSimpleIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/smash/brand";
import { Eyebrow } from "@/components/smash/primitives";
import { useTx } from "@/lib/i18n";
import { PHOTOS } from "@/config/club";
import { authErrorMessage } from "@/lib/auth-errors";
import { useAuth } from "@/lib/auth";
import { PasswordInput, passwordIsStrong } from "@/components/smash/password-input";
import { cn } from "@/lib/utils";

/** Same rule as the API (PATCH /users/me). */
const PHONE_RE = /^[+\d][\d\s().-]{5,29}$/;
type Gender = "male" | "female";

const GOOGLE_ENABLED = import.meta.env.VITE_AUTH_GOOGLE_ENABLED === "true";
// Prepared for a future release: needs an Apple Developer account and the Apple
// provider enabled in Supabase (docs/GOOGLE_AUTH_CONFIGURATION.md → "Apple").
const APPLE_ENABLED = import.meta.env.VITE_AUTH_APPLE_ENABLED === "true";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Only allow in-app redirects ("/join/abc"), never full URLs. */
function safeRedirect(search: string) {
  const r = new URLSearchParams(search).get("redirect");
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard";
}

export default function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const tx = useTx();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const redirect = safeRedirect(search);
  const isSignUp = mode === "sign-up";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [canResend, setCanResend] = useState(false);
  /** Sign-up done, waiting for the confirmation e-mail: the form gives way to "check your inbox". */
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [resending, setResending] = useState(false);
  const { isLoaded, isSignedIn } = useAuth();

  // Already signed in (or just confirmed from the e-mail link in this tab): nothing to do here
  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation(redirect, { replace: true });
  }, [isLoaded, isSignedIn, redirect, setLocation]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordAuth = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (isSignUp && !passwordIsStrong(password)) {
      setError(
        tx({
          fr: "Mot de passe trop faible : 8 caractères minimum, avec des lettres et des chiffres.",
          en: "Password too weak: at least 8 characters, with letters and numbers.",
          ar: "كلمة المرور ضعيفة: 8 أحرف على الأقل مع حروف وأرقام.",
        }),
      );
      return;
    }
    if (isSignUp && !PHONE_RE.test(phone.trim())) {
      setError(
        tx({
          fr: "Entrez un numéro de téléphone valide.",
          en: "Enter a valid phone number.",
          ar: "أدخل رقم هاتف صحيحًا.",
        }),
      );
      return;
    }
    if (isSignUp && !gender) {
      setError(
        tx({
          fr: "Indiquez votre genre.",
          en: "Please select your gender.",
          ar: "يرجى اختيار الجنس.",
        }),
      );
      return;
    }
    setIsSubmitting(true);
    setCanResend(false);
    const result = isSignUp
      ? await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${basePath}${redirect}`,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              phone: phone.trim(),
              gender,
            },
          },
        })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setIsSubmitting(false);
    if (result.error) {
      setError(authErrorMessage(result.error, tx));
      if (result.error.code === "email_not_confirmed") setCanResend(true);
      return;
    }
    if (isSignUp && !result.data.session) {
      setAwaitingEmail(true);
      return;
    }
    setLocation(redirect);
  };

  const handleReset = async () => {
    setError(null);
    if (!email) {
      setError(
        tx({
          fr: "Entrez d'abord votre email ci-dessus : nous y envoyons le lien pour changer de mot de passe.",
          en: "Enter your email above first: the link to change your password is sent there.",
          ar: "أدخل بريدك أعلاه أولًا: نرسل إليه رابط تغيير كلمة المرور.",
        }),
      );
      document.getElementById("email")?.focus();
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${basePath}/reset-password`,
    });
    if (err) setError(authErrorMessage(err, tx));
    else
      setNotice(
        tx({
          fr: `Si un compte existe pour ${email.trim()}, un lien pour choisir un nouveau mot de passe vient d'être envoyé. Pensez à vérifier vos spams.`,
          en: `If an account exists for ${email.trim()}, a link to choose a new password was just sent. Check your spam folder too.`,
          ar: `إن وُجد حساب للبريد ${email.trim()} فقد أُرسل رابط لاختيار كلمة مرور جديدة. تحقق أيضًا من الرسائل غير المرغوب فيها.`,
        }),
      );
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${basePath}${redirect}` },
    });
    setResending(false);
    if (err) setError(authErrorMessage(err, tx));
    else
      setNotice(
        tx({
          fr: "Email de confirmation renvoyé.",
          en: "Confirmation email sent again.",
          ar: "تمت إعادة إرسال بريد التأكيد.",
        }),
      );
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${basePath}${redirect}`,
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
    if (err) setError(authErrorMessage(err, tx));
  };
  const handleGoogle = () => handleOAuth("google");

  // Errors sent back by Supabase after an OAuth / email-link redirect
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search || window.location.hash.replace(/^#/, ""),
    );
    const desc = params.get("error_description");
    if (desc)
      setError(
        authErrorMessage({ message: desc, code: params.get("error_code") ?? undefined }, tx),
      );
  }, [tx]);

  const perks = [
    tx({
      fr: "Terrains libres en direct",
      en: "Live court availability",
      ar: "الملاعب المتاحة مباشرة",
    }),
    tx({
      fr: "Réservation en 3 taps avec vos tokens",
      en: "Book in 3 taps with your tokens",
      ar: "احجز بثلاث نقرات برصيدك",
    }),
    tx({
      fr: "Open matches pour jouer sans partenaire",
      en: "Open matches when you have no partner",
      ar: "مباريات مفتوحة للعب دون شريك",
    }),
  ];

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="on-dark relative hidden overflow-hidden bg-night p-12 text-white lg:flex lg:flex-col">
        <img
          src={PHOTOS.hero}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-45"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgb(10_16_48/.55),rgb(10_16_48/.92))]"
        />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative mt-auto flex flex-col gap-7">
          <Eyebrow live className="text-ball">
            {tx({ fr: "Le club, en direct", en: "The club, live", ar: "النادي مباشرة" })}
          </Eyebrow>
          <h2 className="disp m-0 text-[64px] leading-[0.92]">
            {tx({
              fr: "Votre prochain match commence ici.",
              en: "Your next match starts here.",
              ar: "مباراتك القادمة تبدأ هنا.",
            })}
          </h2>
          <ul className="stagger m-0 flex list-none flex-col gap-3 p-0 text-lg text-soft-d">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-ball text-night">
                  <CheckIcon className="size-4" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10 lg:px-16 lg:py-12">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo tone="dark" />
          </span>
          <Link
            href="/"
            className="ms-auto inline-flex min-h-6 items-center text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            {tx({ fr: "Retour au site", en: "Back to site", ar: "العودة للموقع" })}
          </Link>
        </div>

        {awaitingEmail ? (
          <div
            className="enter mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-6 py-10"
            role="status"
          >
            <span className="pop-in flex size-16 items-center justify-center rounded-full bg-ball text-night">
              <EnvelopeSimpleIcon className="size-7" />
            </span>
            <div className="flex flex-col gap-3">
              <h1 className="disp m-0 text-[40px] leading-[0.95]">
                {tx({
                  fr: "Vérifiez votre boîte mail",
                  en: "Check your inbox",
                  ar: "تحقق من بريدك",
                })}
              </h1>
              <p className="m-0 text-muted-foreground">
                {tx({
                  fr: "Nous avons envoyé un lien de confirmation à",
                  en: "We sent a confirmation link to",
                  ar: "أرسلنا رابط التأكيد إلى",
                })}{" "}
                <strong className="font-bold text-ink [overflow-wrap:anywhere]" dir="ltr">
                  {email.trim()}
                </strong>
                .{" "}
                {tx({
                  fr: "Ouvrez-le pour activer votre compte : vous serez connecté directement.",
                  en: "Open it to activate your account: you will be signed in straight away.",
                  ar: "افتحه لتفعيل حسابك وسيتم تسجيل دخولك مباشرة.",
                })}
              </p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm">
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-court" />
                {tx({
                  fr: "Rien reçu après une minute ? Regardez dans les spams.",
                  en: "Nothing after a minute? Look in your spam folder.",
                  ar: "لم يصلك شيء بعد دقيقة؟ تحقق من الرسائل غير المرغوب فيها.",
                })}
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-court" />
                {tx({
                  fr: "Le lien s'ouvre sur ce téléphone ou cet ordinateur, au choix.",
                  en: "The link works on this phone or this computer, whichever you prefer.",
                  ar: "يعمل الرابط على هذا الهاتف أو هذا الحاسوب.",
                })}
              </li>
            </ul>
            {error && (
              <p
                role="alert"
                className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
              >
                {error}
              </p>
            )}
            {notice && (
              <p className="m-0 rounded-2xl bg-[#DDF5E7] px-4 py-3 text-sm font-semibold text-[#0F6B3C]">
                {notice}
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              <Button type="button" variant="outline" onClick={resend} loading={resending}>
                {tx({
                  fr: "Renvoyer l'email",
                  en: "Send the email again",
                  ar: "إعادة إرسال البريد",
                })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAwaitingEmail(false);
                  setNotice(null);
                  setError(null);
                }}
              >
                {tx({
                  fr: "Corriger mon adresse email",
                  en: "Fix my email address",
                  ar: "تصحيح بريدي الإلكتروني",
                })}
              </Button>
            </div>
          </div>
        ) : (
          <div className="enter mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-8 py-10">
            <div className="flex flex-col gap-3">
              <h1 className="disp m-0 text-[44px] leading-[0.95]">
                {isSignUp
                  ? tx({ fr: "Créer un compte", en: "Create your account", ar: "أنشئ حسابك" })
                  : tx({ fr: "Bon retour !", en: "Welcome back", ar: "مرحبًا بعودتك" })}
              </h1>
              <p className="m-0 text-muted-foreground">
                {isSignUp
                  ? tx({
                      fr: "Réservez des terrains et rejoignez des matchs en quelques secondes.",
                      en: "Book courts and join matches in seconds.",
                      ar: "احجز الملاعب وانضم للمباريات في ثوانٍ.",
                    })
                  : tx({
                      fr: "Connectez-vous pour réserver votre prochain match.",
                      en: "Sign in to book your next match.",
                      ar: "سجّل الدخول لحجز مباراتك القادمة.",
                    })}
              </p>
            </div>

            {(GOOGLE_ENABLED || APPLE_ENABLED) && (
              <>
                {APPLE_ENABLED && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => handleOAuth("apple")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                      <path d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.6zM14.1 5.6c.6-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" />
                    </svg>
                    {tx({
                      fr: "Continuer avec Apple",
                      en: "Continue with Apple",
                      ar: "المتابعة عبر Apple",
                    })}
                  </Button>
                )}
                {GOOGLE_ENABLED && (
                  <Button type="button" variant="outline" size="lg" onClick={handleGoogle}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.8 3.3-8.1z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.2H2.1a11 11 0 0 0 0 9.6L5.7 14z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2L5.7 10c.9-2.6 3.4-4.6 6.3-4.6z"
                      />
                    </svg>
                    {tx({
                      fr: "Continuer avec Google",
                      en: "Continue with Google",
                      ar: "المتابعة عبر Google",
                    })}
                  </Button>
                )}
                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {tx({ fr: "ou par email", en: "or with email", ar: "أو عبر البريد" })}
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form className="flex flex-col gap-4" onSubmit={handlePasswordAuth} noValidate={false}>
              {isSignUp && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="first-name">
                        {tx({ fr: "Prénom", en: "First name", ar: "الاسم" })}
                      </Label>
                      <Input
                        id="first-name"
                        autoComplete="given-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="last-name">
                        {tx({ fr: "Nom", en: "Last name", ar: "اللقب" })}
                      </Label>
                      <Input
                        id="last-name"
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone">
                      {tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })}
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+216 20 000 000"
                      maxLength={30}
                      required
                    />
                  </div>
                  <fieldset className="m-0 border-0 p-0">
                    <legend className="mb-2 text-sm font-bold">
                      {tx({ fr: "Genre", en: "Gender", ar: "الجنس" })}
                    </legend>
                    <div role="radiogroup" className="grid grid-cols-2 gap-3">
                      {(
                        [
                          ["male", tx({ fr: "Homme", en: "Male", ar: "ذكر" })],
                          ["female", tx({ fr: "Femme", en: "Female", ar: "أنثى" })],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={gender === value}
                          data-testid={`signup-gender-${value}`}
                          onClick={() => setGender(value)}
                          className={cn(
                            "h-12 rounded-full border-2 font-bold transition-colors",
                            gender === value
                              ? "border-ink bg-ink text-white"
                              : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              <div>
                <Label htmlFor="email">
                  {tx({ fr: "Email", en: "Email", ar: "البريد الإلكتروني" })}
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@email.com"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">
                    {tx({ fr: "Mot de passe", en: "Password", ar: "كلمة المرور" })}
                  </Label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="mb-2 inline-flex min-h-6 items-center text-sm font-bold text-court hover:underline"
                    >
                      {tx({
                        fr: "Mot de passe oublié ?",
                        en: "Forgot password?",
                        ar: "نسيت كلمة المرور؟",
                      })}
                    </button>
                  )}
                </div>
                <PasswordInput
                  id="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={isSignUp ? 8 : undefined}
                  aria-describedby={isSignUp ? "pw-hint" : undefined}
                />
                {isSignUp && (
                  <p id="pw-hint" className="mt-2 text-xs text-muted-foreground">
                    {tx({
                      fr: "8 caractères minimum, avec des lettres et des chiffres.",
                      en: "At least 8 characters, with letters and numbers.",
                      ar: "8 أحرف على الأقل، مع حروف وأرقام.",
                    })}
                  </p>
                )}
              </div>
              {error && (
                <p
                  role="alert"
                  className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="m-0 flex items-start gap-2 rounded-2xl bg-[#DDF5E7] px-4 py-3 text-sm font-semibold text-[#0F6B3C]"
                >
                  <EnvelopeSimpleIcon className="mt-0.5 size-4 shrink-0" />
                  {notice}
                </p>
              )}
              {canResend && (
                <button
                  type="button"
                  onClick={resend}
                  className="self-start text-sm font-bold text-court hover:underline"
                >
                  {tx({
                    fr: "Renvoyer l'email de confirmation",
                    en: "Resend confirmation email",
                    ar: "إعادة إرسال بريد التأكيد",
                  })}
                </button>
              )}
              <Button type="submit" size="lg" className="mt-2 w-full" loading={isSubmitting}>
                {isSignUp
                  ? tx({ fr: "Créer mon compte", en: "Create account", ar: "إنشاء الحساب" })
                  : tx({ fr: "Se connecter", en: "Sign in", ar: "تسجيل الدخول" })}
                {!isSubmitting && <ArrowRightIcon className="btn-ic" />}
              </Button>
            </form>

            <p className="m-0 text-center text-[15px] text-muted-foreground">
              {isSignUp
                ? tx({ fr: "Déjà membre ?", en: "Already a member?", ar: "عضو بالفعل؟" })
                : tx({
                    fr: "Pas encore de compte ?",
                    en: "No account yet?",
                    ar: "ليس لديك حساب؟",
                  })}{" "}
              <Link
                href={`${isSignUp ? "/sign-in" : "/sign-up"}${search ? `?${search}` : ""}`}
                className="inline-flex min-h-6 items-center font-bold text-court hover:underline"
              >
                {isSignUp
                  ? tx({ fr: "Se connecter", en: "Sign in", ar: "تسجيل الدخول" })
                  : tx({ fr: "Créer un compte", en: "Create one", ar: "أنشئ حسابًا" })}
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
