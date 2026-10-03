import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListTournaments,
  useRegisterTournamentTeam,
  useUnregisterTournament,
  getListTournamentsQueryKey,
} from "@workspace/api-client-react";
import type { Tournament } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDotsIcon, CheckIcon, GiftIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, useConfirm } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useI18n, useTx } from "@/lib/i18n";
import { mediaSrc } from "@/services/api";
import { clubDate } from "@/lib/club-time";
import { apiErrorText } from "@/lib/api-errors";
import { EventCover } from "@/components/smash/cover";

type Filter = "all" | "open" | "upcoming" | "past";

export default function Tournaments() {
  const tx = useTx();
  const { t } = useI18n();
  const { lang } = useI18n();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const { data: tournaments, isLoading, isError, refetch } = useListTournaments();
  const registerMutation = useRegisterTournamentTeam();
  const unregisterMutation = useUnregisterTournament();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  /** The tournament a team is being registered for, and the name given to the team. */
  const [joining, setJoining] = useState<Tournament | null>(null);
  const [teamName, setTeamName] = useState("");

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

  const openRegister = (t: Tournament) => {
    if (!isSignedIn) {
      setLocation(`/sign-in?redirect=${encodeURIComponent("/tournaments")}`);
      return;
    }
    setTeamName("");
    setJoining(t);
  };

  async function unregister(t: Tournament) {
    const ok = await confirm({
      title: tx({
        fr: `Retirer votre équipe de ${t.name} ?`,
        en: `Withdraw your team from ${t.name}?`,
        ar: `سحب فريقك من ${t.name}؟`,
      }),
      description: tx({
        fr: "Votre place est rendue à une autre équipe.",
        en: "Your place goes back to another team.",
        ar: "يعود مكانك لفريق آخر.",
      }),
      confirmLabel: tx({ fr: "Me désinscrire", en: "Withdraw", ar: "انسحاب" }),
      destructive: true,
    });
    if (!ok) return;
    unregisterMutation.mutate(t.id, {
      onSuccess: () => {
        toast({
          title: tx({
            fr: "Inscription annulée",
            en: "Registration cancelled",
            ar: "تم إلغاء التسجيل",
          }),
        });
        qc.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
      },
      onError: (e) =>
        toast({
          title: tx({
            fr: "Désinscription impossible",
            en: "Couldn't withdraw",
            ar: "تعذر الانسحاب",
          }),
          description: apiErrorText(e, tx),
          variant: "destructive",
        }),
    });
  }

  const register = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joining) return;
    registerMutation.mutate(
      { id: joining.id, teamName: teamName.trim() || undefined },
      {
        onSuccess: () => {
          toast({
            title: tx({
              fr: "Inscription confirmée !",
              en: "You're registered!",
              ar: "تم التسجيل!",
            }),
          });
          setJoining(null);
          qc.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        },
        onError: (e) =>
          toast({
            title: tx({
              fr: "Inscription impossible",
              en: "Registration failed",
              ar: "تعذر التسجيل",
            }),
            description: apiErrorText(e, tx),
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
      <div
        role="group"
        aria-label={tx({
          fr: "Tournois affichés",
          en: "Tournaments shown",
          ar: "البطولات المعروضة",
        })}
        className="enter pill-group"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className="pill-tab"
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
                <div className="relative h-[220px]">
                  <EventCover
                    src={mediaSrc(x.imageUrl)}
                    seed={x.id}
                    className="size-full"
                    imgClassName="transition-transform duration-700 group-hover:scale-105"
                  />
                  <Badge
                    variant={statusVariant(x.status)}
                    className="absolute start-4 top-4 px-3 py-1.5 text-[13px]"
                  >
                    {statusLabel(x.status)}
                  </Badge>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-6 sm:p-7">
                  <span className="flex items-center gap-2 text-sm font-bold text-court">
                    <CalendarDotsIcon className="size-4" />
                    {clubDate(x.startDate, lang, "longYear")}
                    {x.endDate ? ` → ${clubDate(x.endDate, lang, "dayMonth")}` : ""}
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
                  {x.isRegistered ? (
                    <div
                      data-testid={`registered-${x.id}`}
                      className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ball/60 px-4 py-3"
                    >
                      <span className="flex items-center gap-2 text-[15px] font-extrabold text-night">
                        <CheckIcon className="size-4" />
                        {tx({
                          fr: "Votre équipe est inscrite",
                          en: "Your team is registered",
                          ar: "فريقك مسجل",
                        })}
                      </span>
                      {(x.status === "open" || x.status === "upcoming") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => unregister(x)}
                          disabled={unregisterMutation.isPending}
                        >
                          {tx({ fr: "Me désinscrire", en: "Withdraw", ar: "انسحاب" })}
                        </Button>
                      )}
                    </div>
                  ) : (
                    x.status === "open" && (
                      <Button
                        className="mt-auto"
                        size="lg"
                        onClick={() => openRegister(x)}
                        disabled={full}
                      >
                        {full
                          ? tx({ fr: "Complet", en: "Full", ar: "مكتمل" })
                          : tx({
                              fr: "Inscrire mon équipe",
                              en: "Register my team",
                              ar: "سجّل فريقي",
                            })}
                      </Button>
                    )
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!joining} onOpenChange={(o) => !o && setJoining(null)}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {tx({ fr: "Inscrire mon équipe", en: "Register my team", ar: "سجّل فريقي" })}
            </DialogTitle>
            <DialogDescription>{joining?.name}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={register}>
            <Field
              label={tx({ fr: "Nom de l'équipe", en: "Team name", ar: "اسم الفريق" })}
              htmlFor="team-name"
              hint={tx({
                fr: "Optionnel. Par exemple vos deux prénoms : le club sait ainsi avec qui vous jouez.",
                en: "Optional. Your two first names, for example: the club then knows who you play with.",
                ar: "اختياري. مثلًا اسماكما: ليعرف النادي مع من تلعب.",
              })}
            >
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Karim & Mehdi"
                maxLength={80}
                autoComplete="off"
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              disabled={registerMutation.isPending}
              loading={registerMutation.isPending}
              data-testid="btn-register-team"
            >
              {tx({
                fr: "Confirmer l'inscription",
                en: "Confirm registration",
                ar: "تأكيد التسجيل",
              })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
