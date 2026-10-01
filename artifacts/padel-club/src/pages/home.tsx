import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  useGetOpenMatches,
  useListTerrains,
  useListTournaments,
  useListNews,
} from "@workspace/api-client-react";
import { ArrowRight, Check, Coins, Users, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveBoard, useTonight } from "@/components/smash/live-board";
import { BallIcon } from "@/components/smash/brand";
import { Avatar, Eyebrow, LiveDot } from "@/components/smash/primitives";
import { useTx, useDateLocale } from "@/lib/i18n";
import { CLUB, PHOTOS } from "@/config/club";
import { cn } from "@/lib/utils";
import { clubTime } from "@/lib/club-time";

const signInTo = (path: string) => `/sign-in?redirect=${encodeURIComponent(path)}`;

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] bg-white/6 px-5 py-4">
      <span className="disp text-[44px] leading-none lg:text-[56px]">{value}</span>
      <span className="text-sm text-muted-d">{label}</span>
    </div>
  );
}

export default function Home() {
  const tx = useTx();
  const locale = useDateLocale();
  const tonight = useTonight();
  const [timeIndex, setTimeIndex] = useState(0);
  const { data: matches, isLoading: matchesLoading } = useGetOpenMatches();
  const { data: terrains } = useListTerrains();
  const { data: tournaments } = useListTournaments();
  const { data: news } = useListNews({ limit: 3 });

  const time = tonight.times.slice(0, 4)[Math.min(timeIndex, 3)];
  const freeNow = time ? tonight.freeAt(time) : 0;
  const active = (terrains ?? []).filter((t) => t.isActive !== false);
  const indoor = active.filter((t) => t.type === "indoor").length;
  const outdoor = active.filter((t) => t.type === "outdoor").length;
  const prices = active.map((t) => t.pricePerPerson).filter((p) => p > 0);
  const tokenPrice = prices.length ? Math.min(...prices) : null;
  const upcomingTournaments = (tournaments ?? [])
    .filter((t) => t.status === "open" || t.status === "upcoming")
    .slice(0, 3);
  const articles = news?.data ?? [];

  const ticker = useMemo(() => {
    const items: string[] = [];
    (matches ?? []).slice(0, 3).forEach((m) =>
      items.push(
        tx({
          fr: `Open match ${clubTime(m.startTime)}, ${m.openSpots} place(s)`,
          en: `Open match ${clubTime(m.startTime)}, ${m.openSpots} spot(s)`,
          ar: `مباراة مفتوحة ${clubTime(m.startTime)}`,
        }),
      ),
    );
    tonight.times.slice(0, 4).forEach((tm) => {
      const n = tonight.freeAt(tm);
      if (n)
        items.push(
          tx({
            fr: `${n} terrain(s) libre(s) à ${tm}`,
            en: `${n} court(s) free at ${tm}`,
            ar: `${n} ملعب متاح ${tm}`,
          }),
        );
    });
    upcomingTournaments.forEach((t) => items.push(`${t.name}`));
    if (items.length < 4)
      items.push(
        tx({ fr: "Réservez en 3 taps", en: "Book in 3 taps", ar: "احجز بثلاث نقرات" }),
        tx({ fr: "Indoor et outdoor", en: "Indoor and outdoor", ar: "داخلي وخارجي" }),
        tx({
          fr: "Open matches tous les soirs",
          en: "Open matches every night",
          ar: "مباريات مفتوحة كل مساء",
        }),
      );
    return items;
  }, [matches, tonight, upcomingTournaments, tx]);

  return (
    <>
      {/* ─────────── HERO ─────────── */}
      <section className="on-dark relative grid grid-cols-[minmax(0,1fr)] items-center gap-10 overflow-clip bg-night px-5 pb-16 pt-28 text-white lg:grid-cols-[540px_minmax(0,1fr)] lg:gap-8 lg:px-16 lg:pb-[110px] lg:pt-[150px]">
        <img
          src={PHOTOS.hero}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-[.14] mix-blend-luminosity"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -end-40 top-10 size-[420px] rounded-full bg-[radial-gradient(circle,rgb(46_76_246/.4)_0%,transparent_65%)] lg:end-32 lg:top-44 lg:size-[720px]"
        />

        <div className="relative flex flex-col gap-6 lg:gap-7">
          <Eyebrow live className="text-ball">
            {tonight.isTomorrow
              ? tx({
                  fr: "En direct pour demain",
                  en: "Live for tomorrow",
                  ar: "مباشر لليوم التالي",
                })
              : tx({
                  fr: "En direct du club ce soir",
                  en: "Live from the club tonight",
                  ar: "مباشر من النادي الليلة",
                })}
          </Eyebrow>
          <h1 className="disp m-0 text-[clamp(50px,6.2vw,92px)] leading-[0.94]">
            {[
              tx({ fr: "Un terrain libre.", en: "See a free court.", ar: "ملعب متاح." }),
              tx({ fr: "Un tap.", en: "Tap it.", ar: "نقرة واحدة." }),
              tx({ fr: "On joue ce soir.", en: "Play tonight.", ar: "العب الليلة." }),
            ].map((line, i) => (
              <span key={i} className="block overflow-hidden pb-1">
                <span className={`rise delay-${i + 1}`}>{line}</span>
              </span>
            ))}
          </h1>
          <p className="rise delay-4 m-0 max-w-[480px] text-[17px] leading-relaxed text-muted-d lg:text-xl">
            {tx({
              fr: "Tous les terrains du club, en direct. Choisissez l'heure, prenez un terrain et amenez vos amis. La confirmation arrive avant vos chaussures.",
              en: "Every court at the club, live. Choose a time, pick your court and bring your friends. Confirmation arrives before your shoes are on.",
              ar: "كل ملاعب النادي مباشرة. اختر الوقت واحجز ملعبك وادعُ أصدقاءك. يصلك التأكيد فورًا.",
            })}
          </p>
          <div className="rise delay-5 flex flex-col gap-4 rounded-[28px] border border-white/12 bg-white/6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex flex-col gap-1">
                <span className="label text-muted-d">
                  {time
                    ? tx({ fr: `À ${time}`, en: `At ${time}`, ar: `عند ${time}` })
                    : tx({ fr: "Ce soir", en: "Tonight", ar: "الليلة" })}
                </span>
                <span className="disp text-[30px] tracking-[-0.02em]" aria-live="polite">
                  {tonight.isLoading
                    ? "…"
                    : tx({
                        fr: `${freeNow} terrain(s) libre(s)`,
                        en: `${freeNow} court(s) free`,
                        ar: `${freeNow} ملعب متاح`,
                      })}
                </span>
              </span>
              <Button asChild variant="lime" size="lg">
                <Link href="/terrains">
                  {tx({ fr: "Réserver", en: "Book a court", ar: "احجز ملعبًا" })}
                  <ArrowRight className="btn-ic" />
                </Link>
              </Button>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center gap-3.5">
              <span className="flex" aria-hidden="true">
                <span className="flex size-[38px] items-center justify-center rounded-full border-2 border-night bg-court text-xs font-extrabold">
                  {tx({ fr: "Vous", en: "You", ar: "أنت" })}
                </span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="-ms-2 size-[38px] rounded-full border-2 border-dashed border-white/40"
                  />
                ))}
              </span>
              <span className="text-[15px] text-soft-d">
                {tx({
                  fr: "Invitez 3 amis avec un seul lien. Chacun paie sa place.",
                  en: "Invite 3 friends with one link. Everyone pays their own spot.",
                  ar: "ادعُ 3 أصدقاء برابط واحد. كل واحد يدفع مكانه.",
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="relative">
          <LiveBoard tonight={tonight} timeIndex={timeIndex} onTime={setTimeIndex} />
        </div>
      </section>

      {/* ─────────── TICKER ─────────── */}
      <div
        className="ticker relative z-[2] overflow-hidden bg-ball py-4 text-night lg:py-5"
        aria-label={tx({ fr: "Activité du club", en: "Club activity", ar: "نشاط النادي" })}
      >
        <div className="ticker-track disp flex w-max text-[20px] tracking-[-0.02em] lg:text-[26px]">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 gap-14 pe-14" aria-hidden={k === 1 || undefined}>
              {ticker.map((t, i) => (
                <span key={i} className="flex items-center gap-14 whitespace-nowrap">
                  {t}
                  <BallIcon />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─────────── JOURNEY ─────────── */}
      <section className="relative flex flex-col gap-16 overflow-clip bg-mist px-5 py-24 lg:gap-[90px] lg:px-16 lg:pb-40 lg:pt-[150px]">
        <div className="flex flex-col items-start gap-5 lg:items-center lg:text-center">
          <span data-reveal="" className="label text-court">
            {tx({ fr: "Comment ça marche", en: "How booking works", ar: "كيف يعمل الحجز" })}
          </span>
          <h2
            data-reveal=""
            className="disp m-0 max-w-[1100px] text-[clamp(46px,7.2vw,104px)] leading-[0.92]"
          >
            {tx({
              fr: "Du canapé au terrain.",
              en: "From the sofa to the court.",
              ar: "من الأريكة إلى الملعب.",
            })}
          </h2>
          <p
            data-reveal="late"
            className="m-0 max-w-[560px] text-lg text-muted-foreground lg:text-[21px]"
          >
            {tx({
              fr: "Trois taps. Pas d'appel, pas d'attente.",
              en: "Three taps. No calls, no waiting.",
              ar: "ثلاث نقرات. بلا اتصال ولا انتظار.",
            })}
          </p>
        </div>
        <ol className="relative m-0 flex list-none flex-col gap-20 p-0 lg:gap-[110px]">
          <li
            aria-hidden="true"
            className="absolute bottom-10 start-5 top-10 w-[3px] rounded bg-ink/8 lg:start-1/2 lg:-ms-[1.5px]"
          >
            <div className="draw-y absolute inset-0 rounded bg-court" />
          </li>
          {[
            {
              n: 1,
              title: tx({ fr: "Choisissez l'heure", en: "Pick a time", ar: "اختر الوقت" }),
              text: tx({
                fr: "Tous les terrains, tous les créneaux de la semaine sur un seul écran. Les créneaux libres s'allument.",
                en: "Every court and slot of the week on one screen. Free slots light up.",
                ar: "كل الملاعب والمواعيد في شاشة واحدة. المواعيد المتاحة تضيء.",
              }),
              visual: (
                <div className="flex flex-col gap-4 rounded-[36px] bg-white p-6 shadow-[0_40px_70px_-50px_rgb(16_26_77/.5)] lg:p-8">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-extrabold">
                      {tx({ fr: "Ce soir", en: "Tonight", ar: "الليلة" })}
                    </span>
                    <span className="label text-muted-foreground">{CLUB.slotMinutes} min</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2.5" dir="ltr">
                    {["17:00", "18:30", "20:00", "21:30"].map((t) => (
                      <span
                        key={t}
                        className={cn(
                          "flex h-16 items-center justify-center rounded-[18px] text-lg font-extrabold",
                          t === "18:30"
                            ? "switch-on bg-court text-white shadow-[0_14px_24px_-14px_rgb(46_76_246/.9)]"
                            : "bg-mist",
                        )}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {[1, 0, 1, 1, 0, 1].map((f, i) => (
                      <span
                        key={i}
                        className={cn("h-2.5 flex-1 rounded-full", f ? "bg-ball" : "bg-[#E6E9F5]")}
                      />
                    ))}
                  </div>
                </div>
              ),
            },
            {
              n: 2,
              title: tx({
                fr: "Invitez vos partenaires",
                en: "Invite your partners",
                ar: "ادعُ شركاءك",
              }),
              text: tx({
                fr: "Un lien sur WhatsApp. Vos amis rejoignent la réservation et paient leur place, ou vous prenez le terrain complet.",
                en: "One WhatsApp link. Friends join and pay their spot, or you take the full court.",
                ar: "رابط واحد على واتساب. ينضم أصدقاؤك ويدفع كل منهم مكانه.",
              }),
              visual: (
                <div className="on-dark relative h-[300px] overflow-hidden rounded-[36px] bg-ink p-8 text-white">
                  <span className="label text-muted-d">
                    {tx({ fr: "Votre match", en: "Your match", ar: "مباراتك" })}
                  </span>
                  <div className="absolute start-1/2 top-[56%] flex -translate-x-1/2 -translate-y-1/2 gap-3 rtl:translate-x-1/2 lg:gap-4">
                    {[
                      ["YA", "-140px", "-60px"],
                      ["SK", "-40px", "120px"],
                      ["MB", "60px", "-120px"],
                      ["RT", "150px", "70px"],
                    ].map(([ini, fx, fy], i) => (
                      <span
                        key={ini}
                        className="fly-in"
                        style={{ "--fx": fx, "--fy": fy } as React.CSSProperties}
                      >
                        <Avatar name={ini} index={i} size={76} ring="#101A4D" />
                      </span>
                    ))}
                  </div>
                  <span className="absolute bottom-7 start-8 flex items-center gap-2.5 text-[15px] text-soft-d">
                    <LiveDot />
                    {tx({
                      fr: "4 joueurs sur 4 confirmés",
                      en: "4 of 4 players confirmed",
                      ar: "4 من 4 لاعبين مؤكدون",
                    })}
                  </span>
                </div>
              ),
            },
            {
              n: 3,
              title: tx({ fr: "Venez jouer", en: "Show up and play", ar: "تعال والعب" }),
              text: tx({
                fr: "Un rappel arrive avant le match avec votre terrain. Les lumières sont déjà allumées.",
                en: "A reminder arrives before the match with your court. The lights are already on.",
                ar: "يصلك تذكير قبل المباراة مع رقم ملعبك.",
              }),
              visual: (
                <div className="flex flex-col gap-4 rounded-[36px] bg-night p-7">
                  <div className="lights-on relative h-[210px] rounded-[14px] border-4 border-white bg-court shadow-[0_0_0_10px_rgb(221_247_74/.25),0_0_60px_rgb(46_76_246/.6)]">
                    <span className="draw-y absolute inset-y-0 start-1/2 -ms-0.5 w-1 bg-white" />
                    <span className="absolute inset-y-0 start-[15%] w-[3px] bg-white/75" />
                    <span className="absolute inset-y-0 start-[85%] w-[3px] bg-white/75" />
                    <span className="absolute start-[15%] end-[15%] top-1/2 h-[3px] bg-white/75" />
                    <span className="absolute start-1/2 top-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-ball px-5 text-[15px] font-extrabold text-night rtl:translate-x-1/2">
                      <Check className="size-4" />
                      {tx({ fr: "Terrain prêt", en: "Court ready", ar: "الملعب جاهز" })}
                    </span>
                  </div>
                </div>
              ),
            },
          ].map((step, i) => (
            <li
              key={step.n}
              className="grid items-center gap-8 ps-12 lg:grid-cols-2 lg:gap-[140px] lg:ps-0"
            >
              <div
                data-reveal=""
                className={cn("flex flex-col gap-4", i % 2 ? "lg:order-2 lg:pe-16" : "lg:ps-16")}
              >
                <span className="label text-muted-foreground">
                  {tx({
                    fr: `Étape ${step.n} sur 3`,
                    en: `Step ${step.n} of 3`,
                    ar: `الخطوة ${step.n} من 3`,
                  })}
                </span>
                <h3 className="disp m-0 text-[40px] leading-none lg:text-[56px]">{step.title}</h3>
                <p className="m-0 max-w-[440px] text-[17px] leading-relaxed text-body lg:text-[19px]">
                  {step.text}
                </p>
              </div>
              <div data-reveal="late" aria-hidden="true" className={cn(i % 2 && "lg:order-1")}>
                {step.visual}
              </div>
            </li>
          ))}
        </ol>
        <div data-reveal="" className="flex lg:justify-center">
          <Button asChild size="xl" className="w-full lg:w-auto">
            <Link href="/terrains">
              {tx({ fr: "Voir les créneaux", en: "See available slots", ar: "شاهد المواعيد" })}
              <ArrowRight className="btn-ic" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ─────────── OPEN MATCHES ─────────── */}
      <section
        id="matches"
        className="on-dark relative -mt-14 overflow-clip rounded-t-[40px] bg-court pb-24 pt-24 text-white lg:rounded-t-[56px] lg:pb-[140px] lg:pt-[130px]"
      >
        <div
          aria-hidden="true"
          className="drift-left disp pointer-events-none absolute start-0 top-10 whitespace-nowrap text-[160px] leading-none text-white/7 lg:text-[240px]"
        >
          {tx({
            fr: "Rejoignez un match. Rencontrez des joueurs.",
            en: "Join a match. Meet your people.",
            ar: "انضم إلى مباراة.",
          })}
        </div>
        <div className="relative flex flex-col justify-between gap-8 px-5 lg:flex-row lg:items-end lg:px-16">
          <div className="flex max-w-[760px] flex-col gap-5">
            <Eyebrow live data-reveal="" className="text-ball">
              {matches
                ? tx({
                    fr: `${matches.length} match(s) cherchent des joueurs`,
                    en: `${matches.length} match(es) looking for players`,
                    ar: `${matches.length} مباراة تبحث عن لاعبين`,
                  })
                : "Open matches"}
            </Eyebrow>
            <h2 data-reveal="" className="disp m-0 text-[clamp(46px,7.2vw,104px)] leading-[0.92]">
              {tx({
                fr: "Pas de partenaire ? Pas de souci.",
                en: "No partner? No problem.",
                ar: "لا شريك؟ لا مشكلة.",
              })}
            </h2>
            <p
              data-reveal="late"
              className="m-0 max-w-[560px] text-lg text-[#DCE3FF] lg:text-[21px]"
            >
              {tx({
                fr: "Des joueurs ouvrent leurs matchs. Prenez la place libre pour 1 token et c'est parti.",
                en: "Players open their matches. Take the empty spot for 1 token and you're in.",
                ar: "اللاعبون يفتحون مبارياتهم. خذ المكان الشاغر برصيد واحد.",
              })}
            </p>
          </div>
          <Button asChild variant="lime" size="lg" data-reveal="late">
            <Link href="/open-matches">
              {tx({
                fr: "Tous les open matches",
                en: "All open matches",
                ar: "كل المباريات المفتوحة",
              })}
              <ArrowRight className="btn-ic" />
            </Link>
          </Button>
        </div>
        <div
          className="hscroll relative mt-12 gap-4 px-5 pb-6 pt-5 lg:mt-16 lg:gap-5 lg:px-16"
          role="list"
        >
          {matchesLoading &&
            Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="skeleton-dark h-[320px] w-[300px] animate-pulse !rounded-[34px] lg:w-[380px]"
              />
            ))}
          {(matches ?? []).slice(0, 8).map((m) => (
            <article
              role="listitem"
              key={m.reservationId}
              className="match flex w-[300px] flex-col gap-5 rounded-[34px] bg-court-2 p-6 lg:w-[380px] lg:p-7"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex flex-col">
                  <span className="disp text-[52px] leading-[0.9] lg:text-[60px]" dir="ltr">
                    {clubTime(m.startTime)}
                  </span>
                  <span className="mt-1 text-sm font-semibold capitalize text-[#DCE3FF]">
                    {format(new Date(m.startTime), "EEEE d MMM", { locale })}
                  </span>
                </span>
                <span className="rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-bold">
                  {m.terrain?.name}
                </span>
              </div>
              <p className="m-0 min-h-[24px] text-[17px] font-bold">
                {m.publicDescription ||
                  tx({ fr: "Match amical", en: "Friendly match", ar: "مباراة ودية" })}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-white/14 pt-5">
                <span
                  className="flex ps-2"
                  aria-label={tx({
                    fr: `${m.filledSpots} joueurs sur ${m.totalSpots}`,
                    en: `${m.filledSpots} of ${m.totalSpots} players`,
                    ar: `${m.filledSpots} من ${m.totalSpots}`,
                  })}
                >
                  {m.players.map((p, i) => (
                    <span
                      key={i}
                      className="avatar -ms-2.5"
                      style={{ "--i": i } as React.CSSProperties}
                    >
                      <Avatar name={p.name} index={i} size={46} ring="#1A2FB8" />
                    </span>
                  ))}
                  {Array.from({ length: m.openSpots }, (_, i) => (
                    <span
                      key={`o${i}`}
                      className="open-seat -ms-2.5 flex size-[46px] items-center justify-center rounded-full text-lg"
                      style={{ "--i": m.players.length + i } as React.CSSProperties}
                    >
                      +
                    </span>
                  ))}
                </span>
                <Button asChild variant="lime" size="sm">
                  <Link href={signInTo("/open-matches")}>
                    {tx({ fr: "Rejoindre", en: "Join", ar: "انضم" })}
                  </Link>
                </Button>
              </div>
            </article>
          ))}
          {matches && (
            <div
              role="listitem"
              className="flex w-[280px] flex-col justify-between gap-5 rounded-[34px] border-2 border-dashed border-white/35 p-7"
            >
              <span className="disp text-[34px] leading-none">
                {matches.length === 0
                  ? tx({
                      fr: "Aucun open match pour l'instant.",
                      en: "No open matches yet.",
                      ar: "لا مباريات مفتوحة حاليًا.",
                    })
                  : tx({
                      fr: "Rien à votre heure ?",
                      en: "Nothing at your time?",
                      ar: "لا شيء في وقتك؟",
                    })}
              </span>
              <span className="text-base text-[#DCE3FF]">
                {tx({
                  fr: "Réservez votre place et ouvrez le match aux autres joueurs.",
                  en: "Book your spot and open the match to other players.",
                  ar: "احجز مكانك وافتح المباراة للآخرين.",
                })}
              </span>
              <Button asChild variant="lime" size="sm" className="self-start">
                <Link href="/terrains">
                  {tx({ fr: "Créer un match", en: "Start a match", ar: "أنشئ مباراة" })}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ─────────── THE CLUB ─────────── */}
      <section className="on-dark relative flex flex-col gap-12 overflow-clip bg-night px-5 py-24 text-white lg:gap-14 lg:px-16 lg:pb-[150px] lg:pt-[140px]">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <h2
            data-reveal=""
            className="disp m-0 max-w-[820px] text-[clamp(46px,7.2vw,104px)] leading-[0.92]"
          >
            {tx({
              fr: "Un club taillé pour le prochain match.",
              en: "A club built for the next match.",
              ar: "نادٍ مصمم للمباراة القادمة.",
            })}
          </h2>
          <p data-reveal="late" className="m-0 max-w-[400px] text-lg leading-relaxed text-muted-d">
            {tx({
              fr: "Des terrains indoor pour tous les temps, de l'outdoor pour les beaux soirs.",
              en: "Indoor courts for any weather, outdoor for the good evenings.",
              ar: "ملاعب داخلية لكل الأجواء وخارجية للأمسيات الجميلة.",
            })}
          </p>
        </div>
        <figure className="photo parallax zoom-in m-0 h-[420px] rounded-[32px] lg:h-[620px] lg:rounded-[40px]">
          <img
            src={PHOTOS.hero}
            alt={tx({
              fr: "Terrain du club la nuit",
              en: "Club court at night",
              ar: "ملعب النادي ليلًا",
            })}
            loading="lazy"
            decoding="async"
            className="photo-layer"
          />
          {active.length > 0 && (
            <div className="absolute end-4 top-4 grid grid-cols-3 gap-2.5 rounded-[28px] bg-night/75 p-2.5 backdrop-blur-sm lg:end-7 lg:top-7">
              <Counter
                value={active.length}
                label={tx({ fr: "terrains", en: "courts", ar: "ملاعب" })}
              />
              <Counter value={indoor} label="indoor" />
              <Counter value={outdoor} label="outdoor" />
            </div>
          )}
        </figure>
        <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
          <figure className="photo parallax m-0 h-[320px] rounded-[32px] lg:col-span-5 lg:h-[420px]">
            <img
              src={PHOTOS.indoor}
              alt="Indoor"
              loading="lazy"
              decoding="async"
              className="photo-layer"
            />
            <figcaption className="absolute bottom-4 start-4 rounded-full bg-night/75 px-4 py-2 text-sm font-bold">
              Indoor
            </figcaption>
          </figure>
          <figure className="photo parallax m-0 h-[320px] rounded-[32px] lg:col-span-4 lg:mt-[70px] lg:h-[420px]">
            <img
              src={PHOTOS.outdoor}
              alt="Outdoor"
              loading="lazy"
              decoding="async"
              className="photo-layer"
            />
            <figcaption className="absolute bottom-4 start-4 rounded-full bg-night/75 px-4 py-2 text-sm font-bold">
              Outdoor
            </figcaption>
          </figure>
          <div
            data-reveal="late"
            className="flex flex-col justify-between gap-5 rounded-[32px] bg-ball p-7 text-night lg:col-span-3"
          >
            <span className="label">
              {tx({ fr: "Nous trouver", en: "Visit us", ar: "زورونا" })}
            </span>
            <address className="flex flex-col gap-1 text-[17px] font-semibold not-italic">
              <span>{CLUB.address}</span>
              <span>{CLUB.postal}</span>
            </address>
            <span className="text-[15px]">
              {tx({ fr: "Tous les jours", en: "Every day", ar: "كل يوم" })}{" "}
              <span dir="ltr">{CLUB.hours}</span>
            </span>
            <Button asChild variant="dark" size="sm" className="self-start">
              <Link href="/contact">
                {tx({ fr: "Itinéraire", en: "Directions", ar: "الاتجاهات" })}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─────────── PRICING (tokens) ─────────── */}
      <section className="relative -mt-14 flex flex-col gap-12 rounded-t-[40px] bg-white px-5 py-24 lg:gap-16 lg:rounded-t-[56px] lg:px-16 lg:pb-[130px] lg:pt-[140px]">
        <div className="flex flex-col items-start gap-5 lg:items-center lg:text-center">
          <span data-reveal="" className="label text-court">
            {tx({ fr: "Tarifs", en: "Prices", ar: "الأسعار" })}
          </span>
          <h2 data-reveal="" className="disp m-0 text-[clamp(44px,6.6vw,96px)] leading-[0.92]">
            {tx({
              fr: "1 token = 1 place.",
              en: "1 token = 1 spot.",
              ar: "رصيد واحد = مكان واحد.",
            })}
          </h2>
          <p
            data-reveal="late"
            className="m-0 max-w-[640px] text-lg text-muted-foreground lg:text-xl"
          >
            {tx({
              fr: `Chaque joueur paie sa place pour ${CLUB.slotMinutes} minutes.`,
              en: `Each player pays their own spot for ${CLUB.slotMinutes} minutes.`,
              ar: `كل لاعب يدفع مكانه لمدة ${CLUB.slotMinutes} دقيقة.`,
            })}
            {tokenPrice
              ? tx({
                  fr: ` Un token coûte ${tokenPrice} ${CLUB.currency}.`,
                  en: ` One token costs ${tokenPrice} ${CLUB.currency}.`,
                  ar: ` الرصيد الواحد ${tokenPrice} ${CLUB.currency}.`,
                })
              : ""}
          </p>
        </div>
        <div className="grid w-full max-w-[1080px] gap-5 self-center lg:grid-cols-2 lg:gap-6">
          {[
            {
              dark: false,
              label: tx({ fr: "Ma place", en: "Your spot", ar: "مكانك" }),
              n: CLUB.tokensOwnSpot,
              sub: tx({
                fr: "Rejoignez un open match ou ouvrez le vôtre",
                en: "Join an open match or open your own",
                ar: "انضم لمباراة مفتوحة أو افتح مباراتك",
              }),
              cta: tx({
                fr: "Voir les open matches",
                en: "See open matches",
                ar: "المباريات المفتوحة",
              }),
              href: "/open-matches",
            },
            {
              dark: true,
              label: tx({ fr: "Terrain complet", en: "Full court", ar: "ملعب كامل" }),
              n: CLUB.tokensFullCourt,
              sub: tx({
                fr: "Les 4 places, pour jouer entre amis",
                en: "All 4 spots, for playing with friends",
                ar: "الأماكن الأربعة للعب مع الأصدقاء",
              }),
              cta: tx({ fr: "Réserver un terrain", en: "Book a court", ar: "احجز ملعبًا" }),
              href: "/terrains",
            },
          ].map((p) => (
            <article
              key={p.label}
              data-reveal={p.dark ? "late" : ""}
              className={cn(
                "lift flex flex-col gap-6 rounded-[32px] p-7 lg:rounded-[40px] lg:p-11",
                p.dark ? "on-dark bg-ink text-white" : "bg-mist",
              )}
            >
              <span className={cn("label", p.dark ? "text-ball" : "text-muted-foreground")}>
                {p.label}
              </span>
              <p className="m-0 flex items-baseline gap-3">
                <span className="disp text-[110px] leading-[0.82] tracking-[-0.05em] lg:text-[160px]">
                  {p.n}
                </span>
                <span className="disp text-3xl">token{p.n > 1 ? "s" : ""}</span>
              </p>
              <div
                className={cn(
                  "flex items-center gap-3.5 rounded-[22px] px-5 py-4",
                  p.dark ? "bg-white/8" : "bg-white",
                )}
              >
                <Coins className={cn("size-5", p.dark ? "text-ball" : "text-court")} />
                <span className="text-base font-semibold">{p.sub}</span>
              </div>
              {tokenPrice && (
                <span
                  className={cn("text-[15px]", p.dark ? "text-muted-d" : "text-muted-foreground")}
                >
                  ≈ {p.n * tokenPrice} {CLUB.currency}
                </span>
              )}
              <Button asChild variant={p.dark ? "lime" : "outline"} size="lg" className="mt-auto">
                <Link href={p.href}>{p.cta}</Link>
              </Button>
            </article>
          ))}
        </div>
        <p
          data-reveal="late"
          className="m-0 self-center text-center text-[15px] text-muted-foreground"
        >
          {tx({
            fr: "Les tokens se rechargent à l'accueil du club. Annulation = token remboursé.",
            en: "Top up tokens at the club front desk. Cancel and your token is refunded.",
            ar: "يُشحن الرصيد في استقبال النادي. الإلغاء يعيد الرصيد.",
          })}
        </p>
      </section>

      {/* ─────────── TOURNAMENTS + NEWS ─────────── */}
      {(upcomingTournaments.length > 0 || articles.length > 0) && (
        <section className="flex flex-col gap-16 bg-mist px-5 py-24 lg:px-16 lg:py-[130px]">
          {upcomingTournaments.length > 0 && (
            <div className="flex flex-col gap-10">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div className="flex flex-col gap-4">
                  <span data-reveal="" className="label text-court">
                    {tx({ fr: "Tournois", en: "Tournaments", ar: "البطولات" })}
                  </span>
                  <h2
                    data-reveal=""
                    className="disp m-0 text-[clamp(40px,5.6vw,80px)] leading-[0.92]"
                  >
                    {tx({ fr: "Montez de niveau.", en: "Raise your level.", ar: "ارفع مستواك." })}
                  </h2>
                </div>
                <Button asChild variant="outline">
                  <Link href="/tournaments">
                    {tx({ fr: "Tous les tournois", en: "All tournaments", ar: "كل البطولات" })}
                    <ArrowRight className="btn-ic" />
                  </Link>
                </Button>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {upcomingTournaments.map((t) => (
                  <Link
                    key={t.id}
                    href="/tournaments"
                    data-reveal="late"
                    className="lift group flex flex-col overflow-hidden rounded-[32px] bg-white"
                  >
                    <span className="photo h-[200px]">
                      <img
                        src={t.imageUrl || PHOTOS.tournament}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </span>
                    <span className="flex flex-col gap-3 p-6">
                      <span className="flex items-center gap-2 text-sm font-bold text-court">
                        <CalendarDays className="size-4" />
                        {format(new Date(t.startDate), "d MMMM yyyy", { locale })}
                      </span>
                      <span className="disp text-2xl tracking-[-0.02em]">{t.name}</span>
                      {t.maxTeams ? (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="size-4" />
                          {t.registeredTeams ?? 0}/{t.maxTeams}{" "}
                          {tx({ fr: "équipes", en: "teams", ar: "فرق" })}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {articles.length > 0 && (
            <div className="flex flex-col gap-8">
              <div className="flex items-end justify-between gap-5">
                <h2 data-reveal="" className="disp m-0 text-[clamp(32px,4vw,56px)] leading-none">
                  {tx({ fr: "Du côté du club", en: "From the club", ar: "من النادي" })}
                </h2>
                <Link href="/news" className="ulink font-bold text-court">
                  {tx({ fr: "Toutes les actus", en: "All news", ar: "كل الأخبار" })}
                </Link>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {articles.map((a) => (
                  <Link
                    key={a.id}
                    href="/news"
                    data-reveal="late"
                    className="lift flex flex-col gap-3 rounded-[28px] bg-white p-6"
                  >
                    <span className="label text-court">
                      {a.category || tx({ fr: "Actu", en: "News", ar: "خبر" })}
                    </span>
                    <span className="text-xl font-extrabold leading-snug">{a.title}</span>
                    <span className="line-clamp-2 text-[15px] text-muted-foreground">
                      {a.excerpt || a.content}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
