import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetOpenMatches,
  useListTerrains,
  useListTournaments,
  useListNews,
} from "@workspace/api-client-react";
import {
  ArrowRightIcon,
  CalendarDotsIcon,
  CheckIcon,
  CoinsIcon,
  DeviceMobileIcon,
  MoneyIcon,
  PhoneIcon,
  UsersIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { LiveBoard, useTonight } from "@/components/smash/live-board";
import { BallIcon } from "@/components/smash/brand";
import { Avatar, Eyebrow, LiveDot } from "@/components/smash/primitives";
import { useTx, useI18n } from "@/lib/i18n";
import { CLUB, CLUB_PHOTOS, PHOTOS } from "@/config/club";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/services/api";
import { clubTime, clubDate } from "@/lib/club-time";
import { useClubRules } from "@/hooks/use-club-rules";
import { money, packSaving, plural, tokenWord, tokensLabel } from "@/lib/labels";
import { EventCover } from "@/components/smash/cover";
import { scrollToSection } from "@/lib/scroll";

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
  const rules = useClubRules();
  const tx = useTx();
  const { lang } = useI18n();
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
  const tokenPrice = rules.tokenUnitPrice || null;
  const packs = rules.tokenPackages;
  /** The friends one booker brings: every spot of a match but their own. */
  const friends = Math.max(1, rules.maxPlayers - 1);
  const noticeHours = rules.cancellationNoticeHours;
  // The pack with the lowest price per token, when one is cheaper than the others
  const bestPack = useMemo(() => {
    const each = (p: (typeof packs)[number]) => p.price / p.tokens;
    const sorted = [...packs].sort((a, b) => each(a) - each(b));
    return sorted.length > 1 && each(sorted[0]) < each(sorted[1]) ? sorted[0].id : null;
  }, [packs]);
  const upcomingTournaments = (tournaments ?? [])
    .filter((t) => t.status === "open" || t.status === "upcoming")
    .slice(0, 3);
  const articles = news?.data ?? [];

  const ticker = useMemo(() => {
    const items: string[] = [];
    (matches ?? []).slice(0, 3).forEach((m) =>
      items.push(
        tx({
          fr: `Open match ${clubTime(m.startTime)}, ${m.openSpots} ${plural(m.openSpots, "place", "places")}`,
          en: `Open match ${clubTime(m.startTime)}, ${m.openSpots} ${plural(m.openSpots, "spot", "spots")}`,
          ar: `مباراة مفتوحة ${clubTime(m.startTime)}`,
        }),
      ),
    );
    tonight.times.slice(0, 4).forEach((tm) => {
      const n = tonight.freeAt(tm);
      if (n)
        items.push(
          tx({
            fr: `${n} ${plural(n, "terrain libre", "terrains libres")} à ${tm}`,
            en: `${n} ${plural(n, "court", "courts")} free at ${tm}`,
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

  // "/#about" opened directly (a shared link, a bookmark): go to the section once drawn
  useEffect(() => {
    const section = window.location.hash.slice(1);
    if (section === "about" || section === "how") scrollToSection(section, "auto");
  }, []);

  return (
    <>
      {/* ─────────── HERO ─────────── */}
      <section className="on-dark relative grid grid-cols-[minmax(0,1fr)] items-center gap-10 overflow-clip bg-night px-5 pb-16 pt-28 text-white lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-8 lg:px-16 lg:pb-[96px] lg:pt-[124px]">
        <img
          src={PHOTOS.hero}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        {/* Keeps the text readable over the photo: darker where the words are */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(10_16_48/.82)_0%,rgb(10_16_48/.66)_45%,rgb(10_16_48/.9)_100%)] lg:bg-[linear-gradient(90deg,rgb(10_16_48/.92)_0%,rgb(10_16_48/.7)_48%,rgb(10_16_48/.38)_100%)]"
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
          <h1 className="disp m-0 text-[clamp(44px,4.9vw,72px)] leading-[0.94]">
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
          <p className="rise delay-4 m-0 max-w-[520px] text-[17px] leading-relaxed text-muted-d lg:text-lg">
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
                        fr: `${freeNow} ${plural(freeNow, "terrain libre", "terrains libres")}`,
                        en: `${freeNow} ${plural(freeNow, "court", "courts")} free`,
                        ar: `${freeNow} ملعب متاح`,
                      })}
                </span>
              </span>
              <Button asChild variant="lime" size="lg" className="shine">
                <Link href="/terrains">
                  {tx({ fr: "Réserver", en: "Book a court", ar: "احجز ملعبًا" })}
                  <ArrowRightIcon className="btn-ic" />
                </Link>
              </Button>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center gap-3.5">
              <span className="flex" aria-hidden="true">
                <span className="flex size-[38px] items-center justify-center rounded-full border-2 border-night bg-court text-xs font-extrabold">
                  {tx({ fr: "Vous", en: "You", ar: "أنت" })}
                </span>
                {Array.from({ length: Math.min(friends, 5) }, (_, i) => (
                  <span
                    key={i}
                    className="-ms-2 size-[38px] rounded-full border-2 border-dashed border-white/40"
                  />
                ))}
              </span>
              <span className="text-[15px] text-soft-d">
                {tx({
                  fr: `Invitez ${friends} ${plural(friends, "ami", "amis")} avec un seul lien. Chacun paie sa place.`,
                  en: `Invite ${friends} ${plural(friends, "friend", "friends")} with one link. Everyone pays their own spot.`,
                  ar: `ادعُ ${friends} ${plural(friends, "صديقًا", "أصدقاء")} برابط واحد. كل واحد يدفع مكانه.`,
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

      {/* ─────────── HOW IT WORKS (nav: Comment ça marche) ─────────── */}
      <section
        id="how"
        aria-labelledby="how-title"
        className="relative flex -scroll-mt-6 flex-col gap-16 overflow-clip bg-mist px-5 py-24 lg:-scroll-mt-3 lg:gap-[90px] lg:px-16 lg:pb-40 lg:pt-[150px]"
      >
        <div className="flex flex-col items-start gap-5 lg:items-center lg:text-center">
          <span data-reveal="" className="label text-court">
            {tx({ fr: "Comment ça marche", en: "How it works", ar: "كيف يعمل" })}
          </span>
          <h2
            id="how-title"
            data-reveal=""
            className="disp m-0 max-w-[1100px] text-[clamp(46px,7.2vw,104px)] leading-[0.92]"
          >
            {tx({
              fr: "Deux façons de réserver.",
              en: "Two ways to book.",
              ar: "طريقتان للحجز.",
            })}
          </h2>
          <p
            data-reveal="late"
            className="m-0 max-w-[620px] text-lg text-muted-foreground lg:text-[21px]"
          >
            {tx({
              fr: "Un coup de fil au club, ou quelques taps sur le site. À vous de choisir.",
              en: "A call to the club, or a few taps on the site. Your choice.",
              ar: "اتصال بالنادي، أو بضع نقرات على الموقع. الخيار لك.",
            })}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
          <article
            data-reveal=""
            className="lift flex flex-col gap-5 rounded-[36px] bg-white p-7 shadow-[0_40px_70px_-50px_rgb(16_26_77/.5)] lg:p-10"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-mist text-court">
                <PhoneIcon className="size-6" weight="duotone" />
              </span>
              <span className="label text-muted-foreground">
                {tx({ fr: "Option 1", en: "Option 1", ar: "الخيار 1" })}
              </span>
            </span>
            <h3 className="disp m-0 text-[34px] leading-none lg:text-[44px]">
              {tx({ fr: "Par téléphone", en: "By phone", ar: "عبر الهاتف" })}
            </h3>
            <p className="m-0 max-w-[460px] text-[17px] leading-relaxed text-body">
              {tx({
                fr: "Appelez le club : on bloque votre terrain à l'heure qui vous arrange.",
                en: "Call the club: we hold your court at the time that suits you.",
                ar: "اتصل بالنادي: نحجز لك الملعب في الوقت الذي يناسبك.",
              })}
            </p>
            <span className="flex items-center gap-2.5 text-[15px] font-bold">
              <MoneyIcon className="size-5 text-[#0F6B3C]" />
              {tx({
                fr: "Paiement en espèces à l'accueil, le jour du match.",
                en: "Pay cash at the front desk on match day.",
                ar: "الدفع نقدًا في الاستقبال يوم المباراة.",
              })}
            </span>
            <div className="mt-auto pt-2">
              {CLUB.phone ? (
                <Button asChild variant="dark" size="lg" className="w-full sm:w-auto">
                  <a href={CLUB.phoneHref}>
                    <PhoneIcon className="size-5" />
                    <span dir="ltr">{CLUB.phone}</span>
                  </a>
                </Button>
              ) : (
                <Button asChild variant="dark" size="lg" className="w-full sm:w-auto">
                  <Link href="/contact">
                    {tx({ fr: "Contacter le club", en: "Contact the club", ar: "اتصل بالنادي" })}
                    <ArrowRightIcon className="btn-ic" />
                  </Link>
                </Button>
              )}
            </div>
          </article>
          <article
            data-reveal="late"
            className="on-dark lift flex flex-col gap-5 rounded-[36px] bg-night p-7 text-white lg:p-10"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-ball">
                <DeviceMobileIcon className="size-6" weight="duotone" />
              </span>
              <span className="label text-muted-d">
                {tx({ fr: "Option 2", en: "Option 2", ar: "الخيار 2" })}
              </span>
            </span>
            <h3 className="disp m-0 text-[34px] leading-none lg:text-[44px]">
              {tx({ fr: "Sur le site", en: "On the site", ar: "عبر الموقع" })}
            </h3>
            <p className="m-0 max-w-[460px] text-[17px] leading-relaxed text-soft-d">
              {tx({
                fr: "Réservez vous-même, à toute heure, depuis votre téléphone. Sans appel ni attente.",
                en: "Book by yourself, at any hour, from your phone. No call, no waiting.",
                ar: "احجز بنفسك في أي وقت من هاتفك. بلا اتصال ولا انتظار.",
              })}
            </p>
            <span className="flex items-center gap-2.5 text-[15px] font-bold">
              <CoinsIcon className="size-5 text-ball" />
              {tx({
                fr: `Paiement en tokens : ${tokensLabel(rules.tokenCostPlayer)} par place.`,
                en: `Pay with tokens: ${tokensLabel(rules.tokenCostPlayer)} per spot.`,
                ar: `الدفع بالرصيد: ${tokensLabel(rules.tokenCostPlayer)} لكل مكان.`,
              })}
            </span>
            <div className="mt-auto pt-2">
              <Button asChild variant="lime" size="lg" className="w-full sm:w-auto">
                <Link href="/terrains">
                  {tx({ fr: "Voir les créneaux", en: "See available slots", ar: "شاهد المواعيد" })}
                  <ArrowRightIcon className="btn-ic" />
                </Link>
              </Button>
            </div>
          </article>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-center lg:text-center">
          <span data-reveal="" className="label text-court">
            {tx({ fr: "Sur le site", en: "On the site", ar: "عبر الموقع" })}
          </span>
          <h3 data-reveal="" className="disp m-0 text-[40px] leading-none lg:text-[64px]">
            {tx({
              fr: "Quatre étapes, et vous jouez.",
              en: "Four steps, and you play.",
              ar: "أربع خطوات وتلعب.",
            })}
          </h3>
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
              title: tx({
                fr: "Rechargez vos tokens",
                en: "Top up your tokens",
                ar: "اشحن رصيدك",
              }),
              text: tx({
                fr: `Passez à l'accueil et payez en espèces : vos tokens arrivent sur votre compte dans la minute. ${tokensLabel(rules.tokenCostPlayer)} = une place de joueur.`,
                en: `Stop by the front desk and pay cash: your tokens land on your account within the minute. ${tokensLabel(rules.tokenCostPlayer)} = one player spot.`,
                ar: `مرّ على الاستقبال وادفع نقدًا: يصل رصيدك إلى حسابك خلال دقيقة. ${tokensLabel(rules.tokenCostPlayer)} = مكان لاعب واحد.`,
              }),
              visual: (
                <div className="flex flex-col gap-5 rounded-[36px] bg-ball p-7 text-night lg:p-8">
                  <div className="flex items-center justify-between">
                    <span className="label">
                      {tx({ fr: "Votre solde", en: "Your balance", ar: "رصيدك" })}
                    </span>
                    <CoinsIcon className="size-7" weight="duotone" />
                  </div>
                  <span className="disp text-[84px] leading-none" dir="ltr">
                    10
                  </span>
                  <span className="pop-in flex items-center gap-2 self-start rounded-full bg-night px-4 py-2 text-[15px] font-extrabold text-white">
                    <MoneyIcon className="size-4 text-ball" />
                    {tx({
                      fr: "+10 tokens · payé à l'accueil",
                      en: "+10 tokens · paid at the desk",
                      ar: "+10 رصيد · مدفوع في الاستقبال",
                    })}
                  </span>
                </div>
              ),
            },
            {
              n: 2,
              title: tx({
                fr: "Repérez un terrain libre",
                en: "Spot a free court",
                ar: "اختر ملعبًا متاحًا",
              }),
              text: tx({
                fr: "Tous les terrains et tous les créneaux de la semaine sur un seul écran. Ceux qui sont libres s'allument : touchez le vôtre.",
                en: "Every court and every slot of the week on one screen. The free ones light up: tap yours.",
                ar: "كل الملاعب والمواعيد في شاشة واحدة. المتاح منها يضيء: اضغط على موعدك.",
              }),
              visual: (
                <div className="flex flex-col gap-4 rounded-[36px] bg-white p-6 shadow-[0_40px_70px_-50px_rgb(16_26_77/.5)] lg:p-8">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-extrabold">
                      {tx({ fr: "Ce soir", en: "Tonight", ar: "الليلة" })}
                    </span>
                    <span className="label text-muted-foreground">
                      {rules.bookingDurationMinutes} min
                    </span>
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
              n: 3,
              title: tx({
                fr: "Votre place, ou tout le terrain",
                en: "Your spot, or the whole court",
                ar: "مكانك، أو الملعب كله",
              }),
              text: tx({
                fr: `Réservez seulement votre place (${tokensLabel(rules.tokenCostPlayer)}) et envoyez le lien à vos amis : chacun prend la sienne. Ou prenez le terrain complet (${tokensLabel(rules.tokenCostFullCourt)}) et invitez qui vous voulez.`,
                en: `Book just your spot (${tokensLabel(rules.tokenCostPlayer)}) and send the link to your friends: each takes their own. Or take the full court (${tokensLabel(rules.tokenCostFullCourt)}) and invite whoever you like.`,
                ar: `احجز مكانك فقط (${tokensLabel(rules.tokenCostPlayer)}) وأرسل الرابط لأصدقائك: كل واحد يأخذ مكانه. أو احجز الملعب كاملًا (${tokensLabel(rules.tokenCostFullCourt)}) وادعُ من تشاء.`,
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
              n: 4,
              title: tx({ fr: "Jouez, profitez", en: "Play and enjoy", ar: "العب واستمتع" }),
              text: tx({
                fr: "Un rappel arrive avant le match avec votre terrain. Les lumières sont allumées : il ne vous reste qu'à vous amuser.",
                en: "A reminder arrives before the match with your court. The lights are on: all that's left is to have fun.",
                ar: "يصلك تذكير قبل المباراة مع رقم ملعبك. الأضواء مضاءة: لم يبقَ إلا أن تستمتع.",
              }),
              visual: (
                <div className="flex flex-col gap-4 rounded-[36px] bg-night p-7">
                  <div className="lights-on relative h-[210px] rounded-[14px] border-4 border-white bg-court shadow-[0_0_0_10px_rgb(221_247_74/.25),0_0_60px_rgb(46_76_246/.6)]">
                    <span className="draw-y absolute inset-y-0 start-1/2 -ms-0.5 w-1 bg-white" />
                    <span className="absolute inset-y-0 start-[15%] w-[3px] bg-white/75" />
                    <span className="absolute inset-y-0 start-[85%] w-[3px] bg-white/75" />
                    <span className="absolute start-[15%] end-[15%] top-1/2 h-[3px] bg-white/75" />
                    <span className="absolute start-1/2 top-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-ball px-5 text-[15px] font-extrabold text-night rtl:translate-x-1/2">
                      <CheckIcon className="size-4" />
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
                    fr: `Étape ${step.n} sur 4`,
                    en: `Step ${step.n} of 4`,
                    ar: `الخطوة ${step.n} من 4`,
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
                    fr: `${matches.length} ${plural(matches.length, "match cherche", "matchs cherchent")} des joueurs`,
                    en: `${matches.length} ${plural(matches.length, "match", "matches")} looking for players`,
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
                fr: `Des joueurs ouvrent leurs matchs. Prenez la place libre pour ${tokensLabel(rules.tokenCostPlayer)} et c'est parti.`,
                en: `Players open their matches. Take the empty spot for ${tokensLabel(rules.tokenCostPlayer)} and you're in.`,
                ar: `اللاعبون يفتحون مبارياتهم. خذ المكان الشاغر بـ ${rules.tokenCostPlayer} رصيد.`,
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
              <ArrowRightIcon className="btn-ic" />
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
                  <span
                    className="disp self-start text-[52px] leading-[0.9] lg:text-[60px]"
                    dir="ltr"
                  >
                    {clubTime(m.startTime)}
                  </span>
                  <span className="mt-1 text-sm font-semibold text-[#DCE3FF]">
                    {clubDate(m.startTime, lang, {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
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

      {/* ─────────── THE CLUB (courts and photos; reachable at /#about) ─────────── */}
      <section
        id="about"
        aria-labelledby="about-title"
        className="on-dark relative flex -scroll-mt-6 flex-col gap-12 overflow-clip bg-night px-5 py-24 text-white lg:-scroll-mt-3 lg:gap-14 lg:px-16 lg:pb-[150px] lg:pt-[140px]"
      >
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-5">
            <span data-reveal="" className="label text-ball">
              {tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
            </span>
            <h2
              id="about-title"
              data-reveal=""
              className="disp m-0 max-w-[820px] text-[clamp(46px,7.2vw,104px)] leading-[0.92]"
            >
              {tx({
                fr: "Un club taillé pour le prochain match.",
                en: "A club built for the next match.",
                ar: "نادٍ مصمم للمباراة القادمة.",
              })}
            </h2>
          </div>
          <p data-reveal="late" className="m-0 max-w-[400px] text-lg leading-relaxed text-muted-d">
            {tx({
              fr: "Des terrains indoor pour tous les temps, de l'outdoor pour les beaux soirs.",
              en: "Indoor courts for any weather, outdoor for the good evenings.",
              ar: "ملاعب داخلية لكل الأجواء وخارجية للأمسيات الجميلة.",
            })}
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
          <figure className="photo photo-fx parallax zoom-in m-0 h-[420px] rounded-[32px] lg:col-span-8 lg:h-[620px] lg:rounded-[40px]">
            <img
              {...CLUB_PHOTOS.main}
              sizes="(min-width: 1024px) 64vw, 100vw"
              alt={tx({
                fr: "Les terrains du club",
                en: "The club's courts",
                ar: "ملاعب النادي",
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
          <figure className="photo photo-fx photo-wipe parallax m-0 h-[420px] rounded-[32px] lg:col-span-4 lg:h-[620px] lg:rounded-[40px]">
            <img
              {...CLUB_PHOTOS.detail}
              sizes="(min-width: 1024px) 32vw, 100vw"
              alt={tx({
                fr: "Raquette et balles sur le terrain",
                en: "Racket and balls on the court",
                ar: "مضرب وكرات على الملعب",
              })}
              loading="lazy"
              decoding="async"
              className="photo-layer"
            />
            <figcaption className="photo-cap absolute bottom-4 start-4 rounded-full bg-night/75 px-4 py-2 text-sm font-bold">
              {tx({ fr: "Prêt à jouer", en: "Ready to play", ar: "جاهز للعب" })}
            </figcaption>
          </figure>
        </div>
        <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
          <figure className="photo photo-fx photo-wipe parallax m-0 h-[320px] rounded-[32px] lg:col-span-5 lg:h-[420px]">
            <img
              {...CLUB_PHOTOS.indoor}
              sizes="(min-width: 1024px) 40vw, 100vw"
              alt="Indoor"
              loading="lazy"
              decoding="async"
              className="photo-layer"
            />
            <figcaption className="photo-cap absolute bottom-4 start-4 rounded-full bg-night/75 px-4 py-2 text-sm font-bold">
              Indoor
            </figcaption>
          </figure>
          <figure className="photo photo-fx photo-wipe photo-wipe-late parallax m-0 h-[320px] rounded-[32px] lg:col-span-4 lg:mt-[70px] lg:h-[420px]">
            <img
              {...CLUB_PHOTOS.outdoor}
              sizes="(min-width: 1024px) 32vw, 100vw"
              alt="Outdoor"
              loading="lazy"
              decoding="async"
              className="photo-layer"
            />
            <figcaption className="photo-cap absolute bottom-4 start-4 rounded-full bg-night/75 px-4 py-2 text-sm font-bold">
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
            {CLUB.fullAddress && (
              <address className="flex flex-col gap-1 text-[17px] font-semibold not-italic">
                {CLUB.address && <span>{CLUB.address}</span>}
                {CLUB.postal && <span>{CLUB.postal}</span>}
              </address>
            )}
            <span className="text-[15px]">
              {rules.openEveryDay
                ? tx({ fr: "Tous les jours", en: "Every day", ar: "كل يوم" })
                : tx({ fr: "Horaires", en: "Hours", ar: "الساعات" })}{" "}
              <span dir="ltr">{rules.hoursLabel}</span>
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
              fr: `${tokensLabel(rules.tokenCostPlayer)} = 1 place.`,
              en: `${tokensLabel(rules.tokenCostPlayer)} = 1 spot.`,
              ar: `${rules.tokenCostPlayer} رصيد = مكان واحد.`,
            })}
          </h2>
          <p
            data-reveal="late"
            className="m-0 max-w-[640px] text-lg text-muted-foreground lg:text-xl"
          >
            {tx({
              fr: `Chaque joueur paie sa place pour ${rules.bookingDurationMinutes} minutes.`,
              en: `Each player pays their own spot for ${rules.bookingDurationMinutes} minutes.`,
              ar: `كل لاعب يدفع مكانه لمدة ${rules.bookingDurationMinutes} دقيقة.`,
            })}
            {tokenPrice
              ? tx({
                  fr: ` Un token coûte ${tokenPrice} ${rules.currency}.`,
                  en: ` One token costs ${tokenPrice} ${rules.currency}.`,
                  ar: ` الرصيد الواحد ${tokenPrice} ${rules.currency}.`,
                })
              : ""}
          </p>
        </div>
        <div className="grid w-full max-w-[1080px] gap-5 self-center lg:grid-cols-2 lg:gap-6">
          {[
            {
              dark: false,
              label: tx({ fr: "Ma place", en: "Your spot", ar: "مكانك" }),
              n: rules.tokenCostPlayer,
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
              n: rules.tokenCostFullCourt,
              sub: tx({
                fr: `Les ${rules.maxPlayers} places, pour jouer entre amis`,
                en: `All ${rules.maxPlayers} spots, for playing with friends`,
                ar: `الأماكن الـ ${rules.maxPlayers} كلها للعب مع الأصدقاء`,
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
                <span className="disp text-3xl">{tokenWord(p.n)}</span>
              </p>
              <div
                className={cn(
                  "flex items-center gap-3.5 rounded-[22px] px-5 py-4",
                  p.dark ? "bg-white/8" : "bg-white",
                )}
              >
                <CoinsIcon className={cn("size-5", p.dark ? "text-ball" : "text-court")} />
                <span className="text-base font-semibold">{p.sub}</span>
              </div>
              {tokenPrice && (
                <span
                  className={cn("text-[15px]", p.dark ? "text-muted-d" : "text-muted-foreground")}
                >
                  ≈ {p.n * tokenPrice} {rules.currency}
                </span>
              )}
              <Button asChild variant={p.dark ? "lime" : "outline"} size="lg" className="mt-auto">
                <Link href={p.href}>{p.cta}</Link>
              </Button>
            </article>
          ))}
        </div>
        {packs.length > 0 && (
          <div
            data-testid="home-packs"
            className="flex w-full max-w-[1080px] flex-col gap-6 self-center"
          >
            <div className="flex flex-col items-start gap-2 lg:items-center lg:text-center">
              <h3 data-reveal="" className="disp m-0 text-[clamp(30px,3.6vw,48px)] leading-none">
                {tx({ fr: "Packs de tokens", en: "Token packs", ar: "باقات الرصيد" })}
              </h3>
              <p data-reveal="" className="m-0 text-base text-muted-foreground lg:text-lg">
                {tx({
                  fr: "Plus vous prenez de tokens, moins chaque partie coûte.",
                  en: "The more tokens you take, the less each game costs.",
                  ar: "كلما أخذت رصيدًا أكثر، قلّت تكلفة كل مباراة.",
                })}
              </p>
            </div>
            <ul className="stagger m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(230px,300px))] lg:justify-center">
              {packs.map((p) => {
                const saving = tokenPrice ? packSaving(p, tokenPrice) : null;
                const best = p.id === bestPack;
                return (
                  <li
                    key={p.id}
                    data-reveal="late"
                    className={cn(
                      "lift relative flex flex-col gap-4 rounded-[28px] p-6 lg:p-7",
                      best ? "bg-ball text-night" : "bg-mist",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="label">{p.name}</span>
                      {saving && saving.percent >= 1 && (
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-sm font-extrabold",
                            best ? "bg-night text-ball" : "bg-ball text-night",
                          )}
                        >
                          −{saving.percent} %
                        </span>
                      )}
                    </span>
                    <p className="m-0 flex items-baseline gap-2">
                      <span className="disp text-[72px] leading-[0.85] tracking-[-0.04em]">
                        {p.tokens}
                      </span>
                      <span className="disp text-2xl">{tokenWord(p.tokens)}</span>
                    </p>
                    <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[28px] font-extrabold leading-none">
                        {money(p.price)} {rules.currency}
                      </span>
                      {saving && (
                        <span className={best ? "text-night/70" : "text-muted-foreground"}>
                          {tx({ fr: "au lieu de", en: "instead of", ar: "بدلًا من" })}{" "}
                          <s>
                            {money(saving.regular)} {rules.currency}
                          </s>
                        </span>
                      )}
                    </p>
                    <span
                      className={cn("text-sm", best ? "text-night/70" : "text-muted-foreground")}
                    >
                      {best && packs.length > 1
                        ? tx({
                            fr: `Le meilleur prix : ${money(p.price / p.tokens)} ${rules.currency} le token`,
                            en: `Best price: ${money(p.price / p.tokens)} ${rules.currency} per token`,
                            ar: `أفضل سعر: ${money(p.price / p.tokens)} ${rules.currency} للرصيد`,
                          })
                        : tx({
                            fr: `Soit ${money(p.price / p.tokens)} ${rules.currency} le token`,
                            en: `${money(p.price / p.tokens)} ${rules.currency} per token`,
                            ar: `أي ${money(p.price / p.tokens)} ${rules.currency} للرصيد`,
                          })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p
          data-reveal="late"
          className="m-0 self-center text-center text-[15px] text-muted-foreground"
        >
          {tx({
            fr: "Les tokens et les packs se paient à l'accueil du club.",
            en: "Tokens and packs are paid at the club front desk.",
            ar: "يُدفع الرصيد والباقات في استقبال النادي.",
          })}{" "}
          {noticeHours > 0
            ? tx({
                fr: `Annulation jusqu'à ${noticeHours} h avant le match = tokens remboursés.`,
                en: `Cancel up to ${noticeHours} h before the match and your tokens are refunded.`,
                ar: `الإلغاء قبل المباراة بـ ${noticeHours} ساعة يعيد الرصيد.`,
              })
            : tx({
                fr: "Annulation avant le match = tokens remboursés.",
                en: "Cancel before the match and your tokens are refunded.",
                ar: "الإلغاء قبل المباراة يعيد الرصيد.",
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
                    <ArrowRightIcon className="btn-ic" />
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
                    <EventCover
                      src={mediaSrc(t.imageUrl)}
                      seed={t.id}
                      className="h-[200px]"
                      imgClassName="transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="flex flex-col gap-3 p-6">
                      <span className="flex items-center gap-2 text-sm font-bold text-court">
                        <CalendarDotsIcon className="size-4" />
                        {clubDate(t.startDate, lang, "dateLong")}
                      </span>
                      <span className="disp text-2xl tracking-[-0.02em]">{t.name}</span>
                      {t.maxTeams ? (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <UsersIcon className="size-4" />
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
