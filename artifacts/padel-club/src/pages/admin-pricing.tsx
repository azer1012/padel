import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminPricingRules,
  useCreatePricingRule,
  useUpdatePricingRule,
  useDeletePricingRule,
  useListTerrains,
  extrasKeys,
  type PricingRule,
  type PricingRuleInput,
} from "@workspace/api-client-react";
import { Plus, Pencil, Trash2, Zap, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx, useDateLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";

type Form = {
  name: string;
  terrainId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  tokensPerSpot: number;
  pricePerPerson: string;
  isPeak: boolean;
  isActive: boolean;
};
const blank: Form = {
  name: "",
  terrainId: "all",
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "17:00",
  endTime: "24:00",
  tokensPerSpot: 2,
  pricePerPerson: "",
  isPeak: true,
  isActive: true,
};
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
/** Hour rows of the preview grid: from the earliest opening to the latest closing. */
function clubHours(days: { isClosed: boolean; openTime: string; closeTime: string }[]) {
  const open = days.filter((d) => !d.isClosed);
  const first = open.length ? Math.min(...open.map((d) => Number(d.openTime.slice(0, 2)))) : 8;
  const last = open.length
    ? Math.max(
        ...open.map((d) =>
          Math.ceil((Number(d.closeTime.slice(0, 2)) * 60 + Number(d.closeTime.slice(3))) / 60),
        ),
      )
    : 24;
  return Array.from({ length: Math.max(1, last - first) }, (_, i) => i + first);
}

/** Same resolution as the server (lib/pricing.ts): highest priority, court-specific first, newest first. */
function resolve(rules: PricingRule[], day: number, time: string, terrainId: number | null) {
  const m = rules.filter(
    (r) =>
      r.isActive &&
      (r.terrainId == null || r.terrainId === terrainId) &&
      r.daysOfWeek.includes(day) &&
      time >= r.startTime &&
      time < r.endTime,
  );
  m.sort(
    (a, b) =>
      b.priority - a.priority ||
      Number(b.terrainId != null) - Number(a.terrainId != null) ||
      b.id - a.id,
  );
  return m[0];
}

export default function AdminPricing() {
  const tx = useTx();
  const club = useClubRules();
  const HOURS = useMemo(() => clubHours(club.openingHours), [club.openingHours]);
  const locale = useDateLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: rules, isLoading } = useAdminPricingRules();
  const { data: terrains } = useListTerrains();
  const create = useCreatePricingRule(),
    update = useUpdatePricingRule(),
    del = useDeletePricingRule();
  const [editing, setEditing] = useState<PricingRule | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [previewCourt, setPreviewCourt] = useState("all");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: extrasKeys.adminPricingRules });
    qc.invalidateQueries({ queryKey: extrasKeys.pricingRules });
    qc.invalidateQueries({ queryKey: ["/api/calendar"] });
  };
  const dayName = (d: number) =>
    new Intl.DateTimeFormat(locale.code ?? "fr", { weekday: "short" }).format(
      new Date(2024, 0, 7 + d),
    );
  const courtName = (id: number | null) =>
    id == null
      ? tx({ fr: "Tous les terrains", en: "All courts", ar: "كل الملاعب" })
      : (terrains?.find((t) => t.id === id)?.name ?? `#${id}`);

  const openNew = () => {
    setForm(blank);
    setEditing("new");
  };
  const openEdit = (r: PricingRule) => {
    setForm({
      name: r.name,
      terrainId: r.terrainId ? String(r.terrainId) : "all",
      daysOfWeek: r.daysOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      tokensPerSpot: r.tokensPerSpot,
      pricePerPerson: r.pricePerPerson != null ? String(r.pricePerPerson) : "",
      isPeak: r.isPeak,
      isActive: r.isActive,
    });
    setEditing(r);
  };
  const fail = (e: any) =>
    toast({
      title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
      description: e?.data?.error,
      variant: "destructive",
    });

  function save(e: React.FormEvent) {
    e.preventDefault();
    const data: PricingRuleInput = {
      name: form.name.trim(),
      terrainId: form.terrainId === "all" ? null : Number(form.terrainId),
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
      tokensPerSpot: form.tokensPerSpot,
      pricePerPerson: form.pricePerPerson === "" ? null : Number(form.pricePerPerson),
      isPeak: form.isPeak,
      isActive: form.isActive,
    };
    const done = (m: string) => () => {
      toast({ title: m });
      setEditing(null);
      refresh();
    };
    if (editing && editing !== "new")
      update.mutate(
        { id: editing.id, data },
        {
          onSuccess: done(tx({ fr: "Tarif mis à jour", en: "Rule updated", ar: "تم التحديث" })),
          onError: fail,
        },
      );
    else
      create.mutate(data, {
        onSuccess: done(tx({ fr: "Tarif créé", en: "Rule created", ar: "تم الإنشاء" })),
        onError: fail,
      });
  }

  async function remove(r: PricingRule) {
    if (
      !(await confirm({
        title: tx({
          fr: `Supprimer « ${r.name} » ?`,
          en: `Delete “${r.name}”?`,
          ar: `حذف «${r.name}»؟`,
        }),
        description: tx({
          fr: "Les créneaux concernés reviendront au tarif de base. Les réservations existantes ne changent pas.",
          en: "Affected slots go back to the base price. Existing bookings don't change.",
          ar: "تعود المواعيد للسعر الأساسي. الحجوزات الحالية لا تتغير.",
        }),
        confirmLabel: tx({ fr: "Supprimer", en: "Delete", ar: "حذف" }),
        destructive: true,
      }))
    )
      return;
    del.mutate(r.id, {
      onSuccess: () => {
        toast({ title: tx({ fr: "Tarif supprimé", en: "Rule deleted", ar: "تم الحذف" }) });
        refresh();
      },
    });
  }

  const grid = useMemo(
    () =>
      ORDER.map((d) =>
        HOURS.map((h) => {
          const time = `${String(h).padStart(2, "0")}:00`;
          const r = resolve(
            rules ?? [],
            d,
            time,
            previewCourt === "all" ? null : Number(previewCourt),
          );
          return { r, tokens: r?.tokensPerSpot ?? club.tokenCostPlayer };
        }),
      ),
    [rules, previewCourt, HOURS, club.tokenCostPlayer],
  );
  const tone = (t: number, peak?: boolean) =>
    t >= 3
      ? "bg-coral text-night"
      : t === 2 || peak
        ? "bg-[#FFC8B6] text-night"
        : "bg-ball/70 text-night";

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Tarifs", en: "Pricing", ar: "الأسعار" })}
        subtitle={tx({
          fr: "Heures pleines et creuses : combien de tokens coûte une place selon le jour et l'heure. Sans règle, une place = 1 token.",
          en: "Peak and off-peak: how many tokens a spot costs by day and time. With no rule, a spot = 1 token.",
          ar: "ساعات الذروة وغير الذروة: كم رصيدًا يكلف المكان حسب اليوم والساعة. بدون قاعدة، المكان = رصيد واحد.",
        })}
        actions={
          <Button onClick={openNew} data-testid="btn-create-rule">
            <Plus />
            {tx({ fr: "Nouvelle règle", en: "New rule", ar: "قاعدة جديدة" })}
          </Button>
        }
      />

      {/* Weekly heat-map */}
      <section className="enter flex flex-col gap-4 rounded-[28px] bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="disp m-0 text-2xl">
            {tx({ fr: "Votre semaine", en: "Your week", ar: "أسبوعك" })}
          </h2>
          <Select value={previewCourt} onValueChange={setPreviewCourt}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {tx({ fr: "Tous les terrains", en: "All courts", ar: "كل الملاعب" })}
              </SelectItem>
              {terrains?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1" dir="ltr">
            <caption className="sr-only">
              {tx({
                fr: "Tokens par place selon le jour et l'heure",
                en: "Tokens per spot by day and hour",
                ar: "الرصيد لكل مكان حسب اليوم والساعة",
              })}
            </caption>
            <thead>
              <tr>
                <th />
                {HOURS.map((h) => (
                  <th key={h} scope="col" className="text-[11px] font-bold text-muted-foreground">
                    {String(h).padStart(2, "0")}h
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDER.map((d, i) => (
                <tr key={d}>
                  <th
                    scope="row"
                    className="w-12 pe-2 text-start text-xs font-extrabold capitalize"
                  >
                    {dayName(d)}
                  </th>
                  {grid[i].map((c, j) => (
                    <td
                      key={j}
                      title={c.r ? `${c.r.name}: ${c.tokens} token(s)` : "1 token"}
                      className={cn(
                        "h-9 rounded-md text-center text-xs font-extrabold",
                        c.r ? tone(c.tokens, c.r.isPeak) : "bg-mist text-muted-foreground",
                      )}
                    >
                      {c.tokens}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          {tx({
            fr: "Chiffre = tokens par place. Un terrain complet coûte 4 fois plus.",
            en: "Number = tokens per spot. A full court costs 4 times that.",
            ar: "الرقم = الرصيد لكل مكان. الملعب الكامل يكلف 4 أضعاف.",
          })}
        </p>
      </section>

      {isLoading ? (
        <Skeleton className="h-[160px] !rounded-[26px]" />
      ) : !rules?.length ? (
        <EmptyState
          icon={<Tags className="size-7" />}
          title={tx({
            fr: "Aucune règle : tout est à 1 token par place",
            en: "No rules: everything is 1 token per spot",
            ar: "لا قواعد: كل شيء برصيد واحد",
          })}
          text={tx({
            fr: "Créez une règle « heures pleines » pour les soirs de semaine, par exemple.",
            en: "Create a “peak hours” rule for weekday evenings, for example.",
            ar: "أنشئ قاعدة «ساعات الذروة» لأمسيات الأسبوع مثلًا.",
          })}
          action={
            <Button onClick={openNew}>
              <Plus />
              {tx({ fr: "Créer une règle", en: "Create a rule", ar: "إنشاء قاعدة" })}
            </Button>
          }
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className={cn(
                "lift enter flex flex-col gap-3 rounded-[26px] bg-card p-5 shadow-sm",
                !r.isActive && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-lg font-extrabold">
                    {r.isPeak && <Zap className="size-4 text-[#B1452A]" />}
                    {r.name}
                  </span>
                  <span className="text-sm text-muted-foreground">{courtName(r.terrainId)}</span>
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(r)}
                    aria-label={tx({ fr: "Modifier", en: "Edit", ar: "تعديل" })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => remove(r)}
                    aria-label={tx({ fr: "Supprimer", en: "Delete", ar: "حذف" })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ORDER.map((d) => (
                  <span
                    key={d}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold capitalize",
                      r.daysOfWeek.includes(d)
                        ? "bg-ink text-white"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {dayName(d)}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="info">
                  <span dir="ltr">
                    {r.startTime} – {r.endTime}
                  </span>
                </Pill>
                <Pill tone={r.tokensPerSpot >= 2 ? "danger" : "lime"}>
                  {r.tokensPerSpot} token{r.tokensPerSpot > 1 ? "s" : ""} /{" "}
                  {tx({ fr: "place", en: "spot", ar: "مكان" })}
                </Pill>
                {r.pricePerPerson != null && (
                  <Pill tone="muted">
                    {r.pricePerPerson} {club.currency}
                  </Pill>
                )}
                {!r.isActive && (
                  <Pill tone="muted">{tx({ fr: "Désactivée", en: "Off", ar: "معطلة" })}</Pill>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-[580px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({
                    fr: "Nouvelle règle de prix",
                    en: "New pricing rule",
                    ar: "قاعدة سعر جديدة",
                  })
                : tx({ fr: "Modifier la règle", en: "Edit rule", ar: "تعديل القاعدة" })}
            </DialogTitle>
            <DialogDescription>
              {tx({
                fr: "S'applique aux nouvelles réservations uniquement.",
                en: "Applies to new bookings only.",
                ar: "تُطبق على الحجوزات الجديدة فقط.",
              })}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={save}>
            <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="pr-name" required>
              <Input
                id="pr-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={tx({ fr: "Heures pleines", en: "Peak hours", ar: "ساعات الذروة" })}
                required
              />
            </Field>
            <Field label={tx({ fr: "Jours", en: "Days", ar: "الأيام" })}>
              <div className="flex flex-wrap gap-1.5" role="group">
                {ORDER.map((d) => {
                  const on = form.daysOfWeek.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          daysOfWeek: f.daysOfWeek.includes(d)
                            ? f.daysOfWeek.filter((x) => x !== d)
                            : [...f.daysOfWeek, d],
                        }))
                      }
                      className={cn(
                        "h-10 min-w-12 rounded-full border-2 px-3 text-sm font-bold capitalize transition-colors",
                        on
                          ? "border-ink bg-ink text-white"
                          : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                      )}
                    >
                      {dayName(d)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={tx({ fr: "De", en: "From", ar: "من" })} htmlFor="pr-start">
                <Input
                  id="pr-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </Field>
              <Field
                label={tx({ fr: "À", en: "To", ar: "إلى" })}
                htmlFor="pr-end"
                hint={tx({
                  fr: "24:00 = jusqu'à la fermeture",
                  en: "24:00 = until closing",
                  ar: "24:00 = حتى الإغلاق",
                })}
              >
                <Input
                  id="pr-end"
                  value={form.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                  pattern="([01]\d|2[0-4]):[0-5]\d"
                  placeholder="24:00"
                  dir="ltr"
                />
              </Field>
            </div>
            <Field
              label={tx({ fr: "Tokens par place", en: "Tokens per spot", ar: "الرصيد لكل مكان" })}
              hint={tx({
                fr: `Terrain complet = ${form.tokensPerSpot * club.maxPlayers} tokens`,
                en: `Full court = ${form.tokensPerSpot * club.maxPlayers} tokens`,
                ar: `الملعب الكامل = ${form.tokensPerSpot * club.maxPlayers}`,
              })}
            >
              <Segmented
                label="Tokens"
                value={String(form.tokensPerSpot)}
                onChange={(v) => set("tokensPerSpot", Number(v))}
                options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx({ fr: "Terrain", en: "Court", ar: "الملعب" })}>
                <Select value={form.terrainId} onValueChange={(v) => set("terrainId", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {tx({ fr: "Tous les terrains", en: "All courts", ar: "كل الملاعب" })}
                    </SelectItem>
                    {terrains?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={tx({
                  fr: `Prix affiché (${club.currency})`,
                  en: `Displayed price (${club.currency})`,
                  ar: `السعر المعروض (${club.currency})`,
                })}
                htmlFor="pr-price"
                hint={tx({
                  fr: "Pour les joueurs sans tokens",
                  en: "For walk-ins without tokens",
                  ar: "للاعبين بدون رصيد",
                })}
              >
                <Input
                  id="pr-price"
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={form.pricePerPerson}
                  onChange={(e) => set("pricePerPerson", e.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>
            <div className="flex flex-col gap-2 rounded-[20px] bg-secondary p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3 font-bold">
                <span className="flex items-center gap-2">
                  <Zap className="size-4 text-[#B1452A]" />
                  {tx({
                    fr: "Afficher comme heures pleines",
                    en: "Show as peak hours",
                    ar: "عرض كساعات ذروة",
                  })}
                </span>
                <Switch checked={form.isPeak} onCheckedChange={(v) => set("isPeak", v)} />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 font-bold">
                {tx({ fr: "Règle active", en: "Rule active", ar: "القاعدة نشطة" })}
                <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              </label>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={create.isPending || update.isPending || !form.daysOfWeek.length}
            >
              {create.isPending || update.isPending
                ? "…"
                : tx({ fr: "Enregistrer", en: "Save rule", ar: "حفظ" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
