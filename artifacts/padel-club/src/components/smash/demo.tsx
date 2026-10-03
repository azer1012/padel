import { useState } from "react";
import type { DemoAccount } from "@workspace/api-client-react";
import { ArrowRightIcon, ShieldCheckIcon, UsersIcon } from "@/components/icons";
import { AmivioContact } from "@/components/smash/amivio-credit";
import { useClubRules } from "@/hooks/use-club-rules";
import { authErrorMessage } from "@/lib/auth-errors";
import { useTx } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

/**
 * Public demo (the API runs with DEMO_MODE): the club is invented, visitors sign in
 * with two shared accounts, and everything goes back to its starting point at night.
 */
export function useDemo() {
  return useClubRules().demo;
}

/** Thin bar above every page of the demo: what it is, and who to call for the real thing. */
export function DemoBanner() {
  const tx = useTx();
  const demo = useDemo();
  if (!demo) return null;
  // Non-breaking: "4 h" never splits over two lines on a phone
  const hour = `${demo.resetHour}\u00a0h`;
  return (
    <div
      data-testid="demo-banner"
      className="relative z-[51] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ball px-4 py-2 text-center text-[13px] font-semibold text-night"
    >
      <span>
        <span className="me-1.5 rounded-full bg-night px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.12em] text-ball">
          {tx({ fr: "Démo", en: "Demo", ar: "تجربة" })}
        </span>
        {tx({
          fr: `Club fictif : tout revient à zéro chaque nuit à ${hour}.`,
          en: `An invented club: everything starts over every night at ${hour}.`,
          ar: `نادٍ وهمي: تعود البيانات كما كانت كل ليلة على الساعة ${hour}.`,
        })}
      </span>
      <AmivioContact>
        <button
          type="button"
          data-testid="demo-contact"
          className="inline-flex min-h-6 items-center gap-1 font-extrabold underline decoration-2 underline-offset-2 hover:no-underline"
        >
          {tx({
            fr: "Cette plateforme pour votre club ? Contactez AmiVio",
            en: "Want this platform for your club? Contact AmiVio",
            ar: "تريد هذه المنصة لناديك؟ تواصل مع AmiVio",
          })}
          <ArrowRightIcon className="btn-ic size-3.5" />
        </button>
      </AmivioContact>
    </div>
  );
}

/**
 * The sign-in page of the demo: one tap to try the platform as a player or as the
 * club. `onTarget` is told where to go before signing in, so the page's own
 * "already signed in" redirect sends the admin to the admin side.
 */
export function DemoSignIn({ onTarget }: { onTarget: (path: string | null) => void }) {
  const tx = useTx();
  const demo = useDemo();
  const [busy, setBusy] = useState<"player" | "admin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accounts = demo?.accounts;

  async function enter(kind: "player" | "admin", account: DemoAccount) {
    setError(null);
    setBusy(kind);
    // The player goes where the page was asked to send them (an invite link…)
    onTarget(kind === "admin" ? "/admin" : null);
    const { error: err } = await supabase.auth.signInWithPassword(account);
    if (err) {
      onTarget(null);
      setBusy(null);
      setError(
        err.code === "invalid_credentials"
          ? tx({
              fr: "La démo se remet en place. Réessayez dans quelques minutes.",
              en: "The demo is being set up again. Try again in a few minutes.",
              ar: "يُعاد تجهيز التجربة. حاول مجددًا بعد دقائق.",
            })
          : authErrorMessage(err, tx),
      );
    }
  }

  const choices = [
    {
      kind: "player" as const,
      icon: UsersIcon,
      title: tx({ fr: "Côté joueur", en: "As a player", ar: "كلاعب" }),
      text: tx({
        fr: "Réserver un terrain, rejoindre un open match, inviter des amis, la boutique.",
        en: "Book a court, join an open match, invite friends, the shop.",
        ar: "احجز ملعبًا، انضم لمباراة مفتوحة، ادعُ أصدقاءك، المتجر.",
      }),
    },
    {
      kind: "admin" as const,
      icon: ShieldCheckIcon,
      title: tx({ fr: "Côté club", en: "As the club", ar: "كإدارة النادي" }),
      text: tx({
        fr: "Le planning, les membres, les tokens, les commandes et tous les réglages.",
        en: "The planning, members, tokens, orders and every setting.",
        ar: "الجدول، الأعضاء، الرصيد، الطلبات وكل الإعدادات.",
      }),
    },
  ];

  return (
    <div data-testid="demo-sign-in" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <span className="self-start rounded-full bg-ball px-3 py-1 text-xs font-extrabold uppercase tracking-[.14em] text-night">
          {tx({ fr: "Démo", en: "Demo", ar: "تجربة" })}
        </span>
        <h1 className="disp m-0 text-[44px] leading-[0.95]">
          {tx({
            fr: "Essayez la plateforme",
            en: "Try the platform",
            ar: "جرّب المنصة",
          })}
        </h1>
        <p className="m-0 text-muted-foreground">
          {tx({
            fr: "Un club inventé, prêt à l'emploi. Changez ce que vous voulez : tout revient à zéro chaque nuit.",
            en: "An invented club, ready to use. Change anything you like: it all starts over every night.",
            ar: "نادٍ وهمي جاهز للاستعمال. غيّر ما تشاء: كل شيء يعود كما كان كل ليلة.",
          })}
        </p>
      </div>
      {accounts ? (
        <div className="flex flex-col gap-3">
          {choices.map((c) => (
            <button
              key={c.kind}
              type="button"
              data-testid={`demo-enter-${c.kind}`}
              disabled={busy !== null}
              onClick={() => enter(c.kind, accounts[c.kind])}
              className="lift group flex items-center gap-4 rounded-[24px] border-2 border-[#E4E8F7] bg-card p-5 text-start transition-colors hover:border-court disabled:opacity-60"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mist text-court">
                <c.icon className="size-6" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-lg font-extrabold">{c.title}</span>
                <span className="text-sm text-muted-foreground">{c.text}</span>
              </span>
              {busy === c.kind ? (
                <span className="live-dot shrink-0" aria-hidden="true" />
              ) : (
                <ArrowRightIcon className="btn-ic size-5 shrink-0 text-court" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <p role="status" className="m-0 rounded-2xl bg-mist px-4 py-3 text-sm font-semibold">
          {tx({
            fr: "La démo n'est pas encore ouverte. Revenez un peu plus tard.",
            en: "The demo isn't open yet. Come back a little later.",
            ar: "التجربة غير متاحة بعد. عد لاحقًا.",
          })}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
        >
          {error}
        </p>
      )}
      <p className="m-0 text-center text-sm text-muted-foreground">
        {tx({
          fr: "Cette plateforme vous intéresse pour votre club ?",
          en: "Interested in this platform for your club?",
          ar: "هل تهمك هذه المنصة لناديك؟",
        })}{" "}
        <AmivioContact>
          <button
            type="button"
            className="inline-flex min-h-6 items-center font-bold text-court hover:underline"
          >
            {tx({ fr: "Contactez AmiVio", en: "Contact AmiVio", ar: "تواصل مع AmiVio" })}
          </button>
        </AmivioContact>
      </p>
    </div>
  );
}
