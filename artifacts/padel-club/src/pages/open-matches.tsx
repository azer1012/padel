import { useMemo, useState } from "react";
import { Link } from "wouter";
import { isToday, isTomorrow, differenceInCalendarDays } from "date-fns";
import { useGetOpenMatches } from "@workspace/api-client-react";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { MatchCard } from "@/components/smash/match-card";
import { useJoinMatch } from "@/hooks/use-join-match";
import { useTx } from "@/lib/i18n";

type Range = "all" | "today" | "tomorrow" | "week";

export default function OpenMatches() {
  const tx = useTx();
  const { data: matches, isLoading, isError, refetch } = useGetOpenMatches();
  const { run, pendingId } = useJoinMatch();
  const [range, setRange] = useState<Range>("all");

  const filtered = useMemo(
    () =>
      (matches ?? [])
        .filter((m) => {
          const d = new Date(m.startTime);
          if (range === "today") return isToday(d);
          if (range === "tomorrow") return isTomorrow(d);
          if (range === "week") return differenceInCalendarDays(d, new Date()) < 7;
          return true;
        })
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
    [matches, range],
  );

  const ranges: { id: Range; label: string }[] = [
    { id: "all", label: tx({ fr: "Tous", en: "All", ar: "الكل" }) },
    { id: "today", label: tx({ fr: "Aujourd'hui", en: "Today", ar: "اليوم" }) },
    { id: "tomorrow", label: tx({ fr: "Demain", en: "Tomorrow", ar: "غدًا" }) },
    { id: "week", label: tx({ fr: "7 jours", en: "Next 7 days", ar: "7 أيام" }) },
  ];

  return (
    <Page wide>
      <PageHeader
        eyebrow="Open matches"
        title={tx({
          fr: "Pas de partenaire ? Pas de souci.",
          en: "No partner? No problem.",
          ar: "لا شريك؟ لا مشكلة.",
        })}
        subtitle={tx({
          fr: "Des joueurs ouvrent leurs matchs au club. Prenez une place libre pour 1 token.",
          en: "Players open their matches to the club. Take an open spot for 1 token.",
          ar: "اللاعبون يفتحون مبارياتهم. خذ مكانًا شاغرًا برصيد واحد.",
        })}
        actions={
          <Button asChild variant="dark">
            <Link href="/terrains">
              {tx({ fr: "Ouvrir mon match", en: "Open my own match", ar: "افتح مباراتي" })}
            </Link>
          </Button>
        }
      />
      <div
        role="group"
        aria-label={tx({ fr: "Période", en: "When", ar: "الفترة" })}
        className="enter flex self-start rounded-full bg-card p-1 shadow-sm"
      >
        {ranges.map((r) => (
          <button
            key={r.id}
            type="button"
            className="pill-tab h-10"
            aria-pressed={range === r.id}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {isError ? (
        <ErrorState
          text={tx({
            fr: "Les open matches n'ont pas chargé.",
            en: "Open matches didn't load.",
            ar: "لم يتم تحميل المباريات.",
          })}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[300px] !rounded-[30px]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Swords className="size-7" />}
          title={tx({
            fr: "Aucun open match pour l'instant",
            en: "No open matches right now",
            ar: "لا مباريات مفتوحة حاليًا",
          })}
          text={tx({
            fr: "Réservez votre place et cochez « open match » : les joueurs du club pourront vous rejoindre.",
            en: "Book your spot and switch on “open match” so club players can join you.",
            ar: "احجز مكانك وفعّل «مباراة مفتوحة» ليتمكن اللاعبون من الانضمام.",
          })}
          action={
            <Button asChild>
              <Link href="/terrains">
                {tx({ fr: "Voir les créneaux", en: "See slots", ar: "المواعيد" })}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <MatchCard
              key={m.reservationId}
              match={m}
              pending={pendingId === m.reservationId}
              onJoin={() => run(m.reservationId, m.startTime)}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
