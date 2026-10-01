import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  useListTournaments,
  useRegisterForTournament,
  getListTournamentsQueryKey,
} from "@workspace/api-client-react";
import type { Tournament } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDotsIcon, GiftIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useI18n, useTx, useDateLocale } from "@/lib/i18n";
import { PHOTOS } from "@/config/club";

type Filter = "all" | "open" | "upcoming" | "past";

export default function Tournaments() {
  const tx = useTx();
  const { t } = useI18n();
  const locale = useDateLocale();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const { data: tournaments, isLoading, isError, refetch } = useListTournaments();
  const registerMutation = useRegisterForTournament();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");

  const statusLabel = (s: Tournament["status"]) =>
    ({
      open: tx({ fr: "Inscriptions ouvertes", en: "Registration open", ar: "التسجيل مفتوح" }),
      upcoming: tx({ fr: "Bientôt", en: "Coming soon", ar: "قريبًا" }),
      ongoing: tx({ fr: "En cours", en: "In progress", ar: "جارية" }),
      completed: tx({ fr: "Terminé", en: "Finished", ar: "انتهت" }),
      cancelled: tx({ fr: "Annulé", en: "Cancelled", ar: "ملغاة" }),
    })[s];
  const statusVariant = (s: Tournament["status"]) =>
    (s === "open"
      ? "lime"
      : s === "ongoing"
        ? "default"
        : s === "cancelled"
          ? "danger"
          : "muted") as "lime" | "default" | "danger" | "muted";

  const list = (tournaments ?? []).filter(
    (x) =>
      filter === "all" ||
      (filter === "past"
        ? x.status === "completed" || x.status === "cancelled"
        : filter === "upcoming"
          ? x.status === "upcoming" || x.status === "ongoing"
          : x.status === "open"),
  );

  const register = (id: number) => {
    if (!isSignedIn) {
      setLocation(`/sign-in?redirect=${encodeURIComponent("/tournaments")}`);
      return;
    }
    registerMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: tx({
              fr: "Inscription confirmée !",
              en: "You're registered!",
              ar: "تم التسجيل!",
            }),
          });
          qc.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        },
        onError: (e: any) =>
          toast({
            title: tx({
              fr: "Inscription impossible",
              en: "Registration failed",
              ar: "تعذر التسجيل",
            }),
            description: e?.data?.error,
            variant: "destructive",
          }),
      },
    );
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: tx({ fr: "Tous", en: "All", ar: "الكل" }) },
    { id: "open", label: tx({ fr: "Ouverts", en: "Open", ar: "مفتوحة" }) },
    { id: "upcoming", label: tx({ fr: "À venir", en: "Upcoming", ar: "قادمة" }) },
    { id: "past", label: tx({ fr: "Passés", en: "Past", ar: "سابقة" }) },
  ];

  return (
    <Page wide>
      <PageHeader
        eyebrow={t("tournaments")}
        title={tx({ fr: "Montez de niveau.", en: "Raise your level.", ar: "ارفع مستواك." })}
        subtitle={tx({
          fr: "Les tournois du club, pour tous les niveaux. Inscrivez votre équipe en un tap.",
          en: "Club tournaments for every level. Register your team in one tap.",
          ar: "بطولات النادي لكل المستويات. سجّل فريقك بنقرة.",
        })}
      />
      <div role="group" className="enter flex self-start rounded-full bg-card p-1 shadow-sm">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className="pill-tab h-10"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isError ? (
        <ErrorState
          text={tx({
            fr: "Les tournois n'ont pas chargé.",
            en: "Tournaments didn't load.",
            ar: "لم يتم تحميل البطولات.",
          })}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="stagger grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[440px] !rounded-[32px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<TrophyIcon className="size-7" />}
          title={tx({
            fr: "Pas de tournoi ici pour l'instant",
            en: "No tournaments here yet",
            ar: "لا بطولات حاليًا",
          })}
        />
      ) : (
        <div className="stagger grid gap-5 md:grid-cols-2">
          {list.map((x) => {
            const pct = x.maxTeams
              ? Math.min(100, Math.round(((x.registeredTeams ?? 0) / x.maxTeams) * 100))
              : null;
            const full = pct === 100;
            return (
              <article
                key={x.id}
                className="lift group flex flex-col overflow-hidden rounded-[32px] bg-card shadow-sm"
              >
                <div className="photo relative h-[220px]">
                  <img
                    src={x.imageUrl || PHOTOS.tournament}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <Badge
                    variant={statusVariant(x.status)}
                    className="absolute start-4 top-4 px-3 py-1.5 text-[13px]"
                  >
                    {statusLabel(x.status)}
                  </Badge>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-6 sm:p-7">
                  <span className="flex items-center gap-2 text-sm font-bold capitalize text-court">
                    <CalendarDotsIcon className="size-4" />
                    {format(new Date(x.startDate), "EEEE d MMMM yyyy", { locale })}
                    {x.endDate ? ` → ${format(new Date(x.endDate), "d MMM", { locale })}` : ""}
                  </span>
                  <h2 className="disp m-0 text-[30px] leading-tight">{x.name}</h2>
                  {x.description && (
                    <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">
                      {x.description}
                    </p>
                  )}
                  {x.prizeInfo && (
                    <span className="flex items-center gap-2 rounded-2xl bg-ball/60 px-4 py-3 text-sm font-bold text-night">
                      <GiftIcon className="size-4" />
                      {x.prizeInfo}
                    </span>
                  )}
                  {pct !== null && (
                    <div className="flex flex-col gap-2">
                      <span className="flex items-center justify-between text-sm font-bold">
                        <span className="flex items-center gap-2">
                          <UsersIcon className="size-4" />
                          {tx({ fr: "Équipes", en: "Teams", ar: "الفرق" })}
                        </span>
                        <span>
                          {x.registeredTeams ?? 0}/{x.maxTeams}
                        </span>
                      </span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full bg-court transition-[width] duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </div>
                  )}
                  {x.status === "open" && (
                    <Button
                      className="mt-auto"
                      size="lg"
                      onClick={() => register(x.id)}
                      disabled={full}
                      loading={
                        registerMutation.isPending && registerMutation.variables?.id === x.id
                      }
                    >
                      {full
                        ? tx({ fr: "Complet", en: "Full", ar: "مكتمل" })
                        : tx({
                            fr: "Inscrire mon équipe",
                            en: "Register my team",
                            ar: "سجّل فريقي",
                          })}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Page>
  );
}
