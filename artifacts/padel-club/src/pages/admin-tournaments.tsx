import { useState } from "react";
import {
  useListTournaments,
  useCreateTournament,
  useUpdateTournament,
  useTournamentTeams,
  useRemoveTournamentTeam,
  tournamentTeamsKey,
  getListTournamentsQueryKey,
  type TournamentTeam,
} from "@workspace/api-client-react";
import type { Tournament } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDotsIcon,
  GiftIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  ProhibitIcon,
  TrashIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, useConfirm, type Tone } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx, useI18n } from "@/lib/i18n";
import { clubDate, clubDateTime, toClubInput, fromClubInput } from "@/lib/club-time";
import { apiErrorText } from "@/lib/api-errors";
import { plural } from "@/lib/labels";
import { EventCover } from "@/components/smash/cover";

type Status = Tournament["status"];
type Form = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  maxTeams: string;
  status: Status;
  prizeInfo: string;
  imageUrl: string;
};
const blank: Form = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  maxTeams: "16",
  status: "upcoming",
  prizeInfo: "",
  imageUrl: "",
};
const TONE: Record<Status, Tone> = {
  upcoming: "muted",
  open: "lime",
  ongoing: "court",
  completed: "success",
  cancelled: "danger",
};

export default function AdminTournaments() {
  const tx = useTx();
  const { lang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: tournaments, isLoading } = useListTournaments({
    query: { queryKey: getListTournamentsQueryKey() },
  });
  const createMutation = useCreateTournament();
  const updateMutation = useUpdateTournament();
  const [editing, setEditing] = useState<Tournament | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
  const saving = createMutation.isPending || updateMutation.isPending;
  /** The tournament whose teams are shown: who registered, and how to reach them. */
  const [teamsOf, setTeamsOf] = useState<Tournament | null>(null);
  const teams = useTournamentTeams(teamsOf?.id ?? null);
  const removeTeam = useRemoveTournamentTeam();

  async function takeOut(t: Tournament, team: TournamentTeam) {
    const who = team.teamName || team.member.name;
    const ok = await confirm({
      title: tx({
        fr: `Retirer ${who} de ${t.name} ?`,
        en: `Remove ${who} from ${t.name}?`,
        ar: `إزالة ${who} من ${t.name}؟`,
      }),
      description: tx({
        fr: "La place est rendue. Prévenez l'équipe : elle ne reçoit pas de message.",
        en: "The place is freed. Tell the team: they get no message.",
        ar: "يُحرَّر المكان. أبلغ الفريق: لا تصله رسالة.",
      }),
      confirmLabel: tx({ fr: "Retirer l'équipe", en: "Remove the team", ar: "إزالة الفريق" }),
      destructive: true,
    });
    if (!ok) return;
    removeTeam.mutate(
      { id: t.id, registrationId: team.id },
      {
        onSuccess: () => {
          toast({ title: tx({ fr: "Équipe retirée", en: "Team removed", ar: "أُزيل الفريق" }) });
          qc.invalidateQueries({ queryKey: tournamentTeamsKey(t.id) });
          refresh();
        },
        onError: (e) =>
          toast({
            title: tx({
              fr: "Action impossible",
              en: "Couldn't do that",
              ar: "تعذر تنفيذ الإجراء",
            }),
            description: apiErrorText(e, tx),
            variant: "destructive",
          }),
      },
    );
  }

  const statusLabel = (s: Status) =>
    ({
      upcoming: tx({ fr: "Annoncé", en: "Announced", ar: "مُعلن" }),
      open: tx({ fr: "Inscriptions ouvertes", en: "Registration open", ar: "التسجيل مفتوح" }),
      ongoing: tx({ fr: "En cours", en: "In progress", ar: "جارية" }),
      completed: tx({ fr: "Terminé", en: "Finished", ar: "انتهت" }),
      cancelled: tx({ fr: "Annulé", en: "Cancelled", ar: "ملغاة" }),
    })[s];

  const openCreate = () => {
    setForm(blank);
    setEditing("new");
  };
  const openEdit = (t: Tournament) => {
    setForm({
      name: t.name,
      description: t.description ?? "",
      status: t.status,
      prizeInfo: t.prizeInfo ?? "",
      imageUrl: t.imageUrl ?? "",
      maxTeams: t.maxTeams ? String(t.maxTeams) : "",
      startDate: toClubInput(t.startDate),
      endDate: toClubInput(t.endDate),
    });
    setEditing(t);
  };

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate) {
      toast({
        title: tx({
          fr: "Nom et date de début requis",
          en: "Name and start date are required",
          ar: "الاسم وتاريخ البدء مطلوبان",
        }),
        variant: "destructive",
      });
      return;
    }
    if (form.endDate && form.endDate < form.startDate) {
      toast({
        title: tx({
          fr: "La fin doit être après le début",
          en: "End must be after start",
          ar: "يجب أن تكون النهاية بعد البداية",
        }),
        variant: "destructive",
      });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      startDate: fromClubInput(form.startDate),
      endDate: form.endDate ? fromClubInput(form.endDate) : undefined,
      maxTeams: form.maxTeams ? parseInt(form.maxTeams) : undefined,
      status: form.status,
      prizeInfo: form.prizeInfo || undefined,
      imageUrl: form.imageUrl || undefined,
    };
    const done = (msg: string) => () => {
      toast({ title: msg });
      setEditing(null);
      refresh();
    };
    const fail = (e: unknown) =>
      toast({
        title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
        description: apiErrorText(e, tx),
        variant: "destructive",
      });
    if (editing && editing !== "new")
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: done(
            tx({ fr: "Tournoi mis à jour", en: "Tournament updated", ar: "تم تحديث البطولة" }),
          ),
          onError: fail,
        },
      );
    else
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: done(
            tx({ fr: "Tournoi créé", en: "Tournament created", ar: "تم إنشاء البطولة" }),
          ),
          onError: fail,
        },
      );
  }

  function setStatus(t: Tournament, status: Status) {
    updateMutation.mutate(
      { id: t.id, data: { status } },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `${t.name} · ${statusLabel(status)}` });
        },
      },
    );
  }

  async function cancelTournament(t: Tournament) {
    const ok = await confirm({
      title: tx({ fr: `Annuler ${t.name} ?`, en: `Cancel ${t.name}?`, ar: `إلغاء ${t.name}؟` }),
      description: tx({
        fr: `${t.registeredTeams ?? 0} ${plural(t.registeredTeams ?? 0, "équipe inscrite verra", "équipes inscrites verront")} le tournoi comme annulé.`,
        en: `${t.registeredTeams ?? 0} registered ${plural(t.registeredTeams ?? 0, "team", "teams")} will see it as cancelled.`,
        ar: `${t.registeredTeams ?? 0} فريق مسجل سيرى البطولة ملغاة.`,
      }),
      confirmLabel: tx({ fr: "Annuler le tournoi", en: "Cancel tournament", ar: "إلغاء البطولة" }),
      destructive: true,
    });
    if (ok) setStatus(t, "cancelled");
  }

  const next: Partial<Record<Status, { to: Status; label: string }>> = {
    upcoming: {
      to: "open",
      label: tx({ fr: "Ouvrir les inscriptions", en: "Open registration", ar: "فتح التسجيل" }),
    },
    open: { to: "ongoing", label: tx({ fr: "Démarrer", en: "Start", ar: "بدء" }) },
    ongoing: { to: "completed", label: tx({ fr: "Terminer", en: "Finish", ar: "إنهاء" }) },
  };
  const list = [...(tournaments ?? [])].sort(
    (a, b) => +new Date(b.startDate) - +new Date(a.startDate),
  );

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Tournois", en: "Tournaments", ar: "البطولات" })}
        subtitle={tx({
          fr: "Créez un tournoi, ouvrez les inscriptions, suivez les équipes.",
          en: "Create a tournament, open registration, follow the teams.",
          ar: "أنشئ بطولة وافتح التسجيل وتابع الفرق.",
        })}
        actions={
          <Button data-testid="btn-create-tournament" onClick={openCreate}>
            <PlusIcon />
            {tx({ fr: "Nouveau tournoi", en: "New tournament", ar: "بطولة جديدة" })}
          </Button>
        }
      />

      {isLoading ? (
        <div className="stagger grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[360px] !rounded-[30px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<TrophyIcon className="size-7" />}
          title={tx({ fr: "Aucun tournoi", en: "No tournaments", ar: "لا بطولات" })}
          action={
            <Button onClick={openCreate}>
              <PlusIcon />
              {tx({ fr: "Créer un tournoi", en: "Create a tournament", ar: "إنشاء بطولة" })}
            </Button>
          }
        />
      ) : (
        <div className="stagger grid gap-5 md:grid-cols-2">
          {list.map((t) => {
            const pct = t.maxTeams
              ? Math.min(100, Math.round(((t.registeredTeams ?? 0) / t.maxTeams) * 100))
              : null;
            const step = next[t.status];
            return (
              <article
                key={t.id}
                data-testid={`card-tournament-${t.id}`}
                className="lift enter flex flex-col overflow-hidden rounded-[30px] bg-card shadow-sm"
              >
                <div className="relative h-[150px]">
                  <EventCover src={t.imageUrl} seed={t.id} className="size-full" />
                  <span className="absolute start-4 top-4">
                    <Pill tone={TONE[t.status]}>{statusLabel(t.status)}</Pill>
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="disp m-0 text-[26px] leading-tight">{t.name}</h2>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(t)}
                      data-testid={`btn-edit-tournament-${t.id}`}
                      aria-label={tx({ fr: "Modifier", en: "Edit", ar: "تعديل" })}
                    >
                      <PencilSimpleIcon />
                    </Button>
                  </div>
                  <span className="flex items-center gap-2 text-sm font-bold text-court">
                    <CalendarDotsIcon className="size-4" />
                    {clubDateTime(t.startDate, lang, "shortYear")}
                    {t.endDate ? ` → ${clubDate(t.endDate, lang, "dayMonth")}` : ""}
                  </span>
                  {t.prizeInfo && (
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <GiftIcon className="size-4 text-coral" />
                      {t.prizeInfo}
                    </span>
                  )}
                  {pct !== null && (
                    <div className="flex flex-col gap-2">
                      <span className="flex justify-between text-sm font-bold">
                        <span className="flex items-center gap-2">
                          <UsersIcon className="size-4" />
                          {tx({ fr: "Équipes", en: "Teams", ar: "الفرق" })}
                        </span>
                        <span>
                          {t.registeredTeams ?? 0}/{t.maxTeams}
                        </span>
                      </span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full bg-court"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    onClick={() => setTeamsOf(t)}
                    data-testid={`btn-teams-${t.id}`}
                  >
                    <UsersIcon />
                    {tx({
                      fr: `Équipes inscrites · ${t.registeredTeams ?? 0}`,
                      en: `Registered teams · ${t.registeredTeams ?? 0}`,
                      ar: `الفرق المسجلة · ${t.registeredTeams ?? 0}`,
                    })}
                  </Button>
                  {(step || (t.status !== "cancelled" && t.status !== "completed")) && (
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-[#E4E8F7] pt-4">
                      {step && (
                        <Button
                          size="sm"
                          onClick={() => setStatus(t, step.to)}
                          disabled={updateMutation.isPending}
                        >
                          {step.label}
                        </Button>
                      )}
                      {t.status !== "cancelled" && t.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => cancelTournament(t)}
                        >
                          <ProhibitIcon />
                          {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!teamsOf} onOpenChange={(o) => !o && setTeamsOf(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {tx({ fr: "Équipes inscrites", en: "Registered teams", ar: "الفرق المسجلة" })}
            </DialogTitle>
            <DialogDescription>
              {teamsOf?.name}
              {teamsOf?.maxTeams
                ? ` · ${teams.data?.length ?? teamsOf.registeredTeams ?? 0}/${teamsOf.maxTeams}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {teams.isError ? (
            <ErrorState
              text={tx({
                fr: "Les équipes n'ont pas chargé.",
                en: "The teams didn't load.",
                ar: "لم يتم تحميل الفرق.",
              })}
              onRetry={() => teams.refetch()}
            />
          ) : teams.isLoading ? (
            <Skeleton className="h-28" />
          ) : !teams.data?.length ? (
            <p className="m-0 rounded-2xl bg-mist px-4 py-8 text-center text-muted-foreground">
              {tx({
                fr: "Aucune équipe inscrite pour l'instant.",
                en: "No team has registered yet.",
                ar: "لا فرق مسجلة بعد.",
              })}
            </p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0" data-testid="tournament-teams">
              {teams.data.map((team, i) => (
                <li
                  key={team.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#E4E8F7] p-3"
                >
                  <span className="disp flex size-9 shrink-0 items-center justify-center rounded-full bg-mist text-court">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-extrabold">
                      {team.teamName || team.member.name}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {team.teamName ? `${team.member.name} · ` : ""}
                      {clubDate(team.createdAt, lang, "dayMonth")}
                    </span>
                  </span>
                  {team.member.phone && (
                    <Button asChild variant="secondary" size="icon-sm">
                      <a
                        href={`tel:${team.member.phone.replace(/[^\d+]/g, "")}`}
                        aria-label={tx({
                          fr: `Appeler ${team.member.name} au ${team.member.phone}`,
                          en: `Call ${team.member.name} on ${team.member.phone}`,
                          ar: `اتصل بـ ${team.member.name} على ${team.member.phone}`,
                        })}
                        title={team.member.phone}
                      >
                        <PhoneIcon />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    disabled={removeTeam.isPending}
                    onClick={() => teamsOf && takeOut(teamsOf, team)}
                    aria-label={tx({
                      fr: `Retirer ${team.teamName || team.member.name}`,
                      en: `Remove ${team.teamName || team.member.name}`,
                      ar: `إزالة ${team.teamName || team.member.name}`,
                    })}
                  >
                    <TrashIcon />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({ fr: "Nouveau tournoi", en: "New tournament", ar: "بطولة جديدة" })
                : tx({ fr: "Modifier le tournoi", en: "Edit tournament", ar: "تعديل البطولة" })}
            </DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="tr-name" required>
              <Input
                id="tr-name"
                data-testid="input-tournament-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Open de Printemps"
              />
            </Field>
            <Field
              label={tx({ fr: "Description", en: "Description", ar: "الوصف" })}
              htmlFor="tr-desc"
            >
              <Textarea
                id="tr-desc"
                rows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder={tx({
                  fr: "Format, niveau, règlement…",
                  en: "Format, level, rules…",
                  ar: "الصيغة، المستوى، القواعد…",
                })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={tx({ fr: "Début", en: "Start", ar: "البداية" })}
                htmlFor="tr-start"
                required
              >
                <Input
                  id="tr-start"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </Field>
              <Field label={tx({ fr: "Fin", en: "End", ar: "النهاية" })} htmlFor="tr-end">
                <Input
                  id="tr-end"
                  type="datetime-local"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </Field>
              <Field label={tx({ fr: "Statut", en: "Status", ar: "الحالة" })}>
                <Select value={form.status} onValueChange={(v) => set("status", v as Status)}>
                  <SelectTrigger data-testid="select-tournament-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["upcoming", "open", "ongoing", "completed", "cancelled"] as Status[]).map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={tx({ fr: "Équipes max", en: "Max teams", ar: "أقصى عدد فرق" })}
                htmlFor="tr-max"
              >
                <Input
                  id="tr-max"
                  type="number"
                  min={2}
                  inputMode="numeric"
                  value={form.maxTeams}
                  onChange={(e) => set("maxTeams", e.target.value)}
                />
              </Field>
            </div>
            <Field label={tx({ fr: "Dotation", en: "Prizes", ar: "الجوائز" })} htmlFor="tr-prize">
              <Input
                id="tr-prize"
                value={form.prizeInfo}
                onChange={(e) => set("prizeInfo", e.target.value)}
                placeholder={tx({
                  fr: "Ex : raquettes + 20 tokens",
                  en: "e.g. rackets + 20 tokens",
                  ar: "مثال: مضارب + 20 رصيد",
                })}
              />
            </Field>
            <Field
              label={tx({ fr: "Image (URL)", en: "Image (URL)", ar: "الصورة (رابط)" })}
              htmlFor="tr-img"
              hint={tx({
                fr: "Vide = photo par défaut du club.",
                en: "Empty = default club photo.",
                ar: "فارغ = صورة النادي الافتراضية.",
              })}
            >
              <Input
                id="tr-img"
                type="url"
                dir="ltr"
                value={form.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Button
              data-testid="btn-save-tournament"
              type="submit"
              size="lg"
              disabled={saving}
              loading={saving}
            >
              {saving
                ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" })
                : tx({ fr: "Enregistrer", en: "Save tournament", ar: "حفظ" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
