import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  Clock,
  Coins,
  LandPlot,
  Plus,
  RotateCcw,
  Save,
  Tags,
  ToggleRight,
  Trash2,
} from "lucide-react";
import {
  useAdminSettings,
  useUpdateSettings,
  useResetSettings,
  useSaveOpeningHours,
  useScheduleExceptions,
  useCreateScheduleException,
  useDeleteScheduleException,
  useAdminTokenPackages,
  useSaveTokenPackage,
  useDeleteTokenPackage,
  useListTerrains,
  settingsKeys,
  apiErrorMessage,
  type AdminSettings,
  type SettingsPatch,
  type SettingsSection,
  type OpeningHoursDay,
  type TokenPackage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx, type Copy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ─────────────────────────────── Shared pieces ─────────────────────────────── */

type Tx = (c: Copy) => string;

/** Same ranges as the API and the database CHECK constraints. */
const LIMITS = {
  bookingDurationMinutes: [30, 240],
  minPlayers: [1, 8],
  maxPlayers: [1, 8],
  minAdvanceMinutes: [0, 10080],
  maxAdvanceDays: [1, 365],
  cancellationNoticeHours: [0, 168],
  playerPrice: [0, 100000],
  fullCourtPrice: [0, 100000],
  tokenCostPlayer: [0, 100],
  tokenCostFullCourt: [0, 400],
  tokenUnitPrice: [0, 100000],
  tokenMinPurchase: [1, 1000],
  reminderLeadMinutes: [15, 1440],
} as const satisfies Partial<Record<keyof SettingsPatch, readonly [number, number]>>;
type NumKey = keyof typeof LIMITS;
const INTEGER: NumKey[] = [
  "bookingDurationMinutes",
  "minPlayers",
  "maxPlayers",
  "minAdvanceMinutes",
  "maxAdvanceDays",
  "cancellationNoticeHours",
  "tokenCostPlayer",
  "tokenCostFullCourt",
  "tokenMinPurchase",
  "reminderLeadMinutes",
];

function numberError(key: NumKey, raw: string, tx: Tx): string | null {
  if (raw.trim() === "") return tx({ fr: "Obligatoire", en: "Required" });
  const n = Number(raw);
  const [min, max] = LIMITS[key];
  if (!Number.isFinite(n)) return tx({ fr: "Nombre invalide", en: "Invalid number" });
  if (INTEGER.includes(key) && !Number.isInteger(n))
    return tx({ fr: "Nombre entier", en: "Whole number" });
  if (n < min || n > max)
    return tx({ fr: `Entre ${min} et ${max}`, en: `Between ${min} and ${max}` });
  if (key === "bookingDurationMinutes" && n % 5 !== 0)
    return tx({ fr: "Multiple de 5 minutes", en: "Multiple of 5 minutes" });
  return null;
}

function Section({
  id,
  icon,
  title,
  description,
  children,
  footer,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      id={id}
      className="enter scroll-mt-24 rounded-[30px] bg-card p-5 shadow-sm sm:p-7"
      aria-labelledby={`${id}-title`}
    >
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-court">
          {icon}
        </span>
        <span className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="disp m-0 text-[26px] leading-tight">
            {title}
          </h2>
          <p className="m-0 text-sm text-muted-foreground">{description}</p>
        </span>
      </header>
      <div className="flex flex-col gap-5">{children}</div>
      {footer && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[#E4E8F7] pt-4">
          {footer}
        </div>
      )}
    </section>
  );
}

function NumberField({
  id,
  label,
  hint,
  suffix,
  value,
  onChange,
  error,
  step,
}: {
  id: string;
  label: string;
  hint: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  step?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={error ? undefined : hint}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step ?? "1"}
          value={value}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(suffix && "pe-16", error && "border-destructive")}
        />
        {suffix && (
          <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <span id={`${id}-err`} role="alert" className="mt-1 text-sm font-semibold text-destructive">
          {error}
        </span>
      )}
    </Field>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl bg-mist p-4">
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">{label}</span>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </label>
  );
}

/** Form state for one section: strings for inputs, booleans for switches. */
type Draft = Record<string, string | boolean>;
function draftOf(s: AdminSettings, keys: (keyof SettingsPatch)[]): Draft {
  return Object.fromEntries(
    keys.map((k) => [k, typeof s[k] === "boolean" ? (s[k] as boolean) : String(s[k])]),
  );
}
function patchOf(d: Draft): SettingsPatch {
  return Object.fromEntries(
    Object.entries(d).map(([k, v]) => [
      k,
      typeof v === "boolean" || k === "currency" || k === "lateCancellation" ? v : Number(v),
    ]),
  ) as SettingsPatch;
}

/** One editable section of club_settings with save + reset-to-default. */
function useSettingsSection(
  settings: AdminSettings | undefined,
  section: SettingsSection,
  keys: (keyof SettingsPatch)[],
) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const update = useUpdateSettings();
  const reset = useResetSettings();
  const [draft, setDraft] = useState<Draft>({});
  useEffect(() => {
    if (settings) setDraft(draftOf(settings, keys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  const dirty = !!settings && JSON.stringify(draft) !== JSON.stringify(draftOf(settings, keys));
  const after = (data: AdminSettings) => {
    qc.setQueryData(settingsKeys.admin, data);
    qc.invalidateQueries({ queryKey: settingsKeys.rules });
    qc.invalidateQueries({ queryKey: ["/api/calendar"] });
  };
  const save = (onSaved?: () => void) =>
    update.mutate(patchOf(draft), {
      onSuccess: (data) => {
        after(data);
        toast({
          title: tx({ fr: "Réglages enregistrés", en: "Settings saved", ar: "تم حفظ الإعدادات" }),
        });
        onSaved?.();
      },
      onError: (e) =>
        toast({
          title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
          description: apiErrorMessage(e, ""),
          variant: "destructive",
        }),
    });
  const resetToDefault = () =>
    reset.mutate(section, {
      onSuccess: (data) => {
        after(data);
        toast({
          title: tx({
            fr: "Valeurs par défaut rétablies",
            en: "Defaults restored",
            ar: "تمت الاستعادة",
          }),
        });
      },
      onError: (e) => toast({ title: apiErrorMessage(e, "Error"), variant: "destructive" }),
    });
  const set = (k: keyof SettingsPatch, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));
  return { draft, set, dirty, save, resetToDefault, busy: update.isPending || reset.isPending };
}

function SectionButtons({
  dirty,
  busy,
  invalid,
  onSave,
  onReset,
}: {
  dirty: boolean;
  busy: boolean;
  invalid?: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const tx = useTx();
  return (
    <>
      <Button type="button" variant="ghost" onClick={onReset} disabled={busy}>
        <RotateCcw />
        {tx({ fr: "Valeurs par défaut", en: "Reset to default", ar: "القيم الافتراضية" })}
      </Button>
      <Button
        type="button"
        onClick={onSave}
        disabled={!dirty || busy || invalid}
        data-testid="btn-save-settings"
      >
        <Save />
        {busy ? "…" : tx({ fr: "Enregistrer", en: "Save", ar: "حفظ" })}
      </Button>
    </>
  );
}

/* ────────────────────────────────── Page ─────────────────────────────────── */

const NAV = [
  { id: "courts", icon: LandPlot, fr: "Terrains", en: "Courts" },
  { id: "booking", icon: CalendarClock, fr: "Réservations", en: "Booking" },
  { id: "pricing", icon: Tags, fr: "Tarifs", en: "Pricing" },
  { id: "tokens", icon: Coins, fr: "Tokens", en: "Tokens" },
  { id: "hours", icon: Clock, fr: "Horaires", en: "Opening hours" },
  { id: "features", icon: ToggleRight, fr: "Fonctionnalités", en: "Features" },
  { id: "notifications", icon: Bell, fr: "Notifications", en: "Notifications" },
] as const;

export default function AdminSettings() {
  const tx = useTx();
  const { data: settings, isLoading } = useAdminSettings();
  const { confirm, dialog } = useConfirm();

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Réglages du club", en: "Club settings", ar: "إعدادات النادي" })}
        subtitle={tx({
          fr: "Les règles de fonctionnement du club. Chaque changement s'applique aux prochaines réservations ; les réservations existantes gardent leurs horaires et leurs prix.",
          en: "How the club runs. Every change applies to the next bookings; existing bookings keep their times and prices.",
          ar: "قواعد تشغيل النادي. ينطبق كل تغيير على الحجوزات القادمة.",
        })}
      />
      <nav
        aria-label={tx({ fr: "Sections", en: "Sections" })}
        className="hscroll -mx-4 -mt-4 flex gap-2 px-4 sm:mx-0 sm:px-0"
      >
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold shadow-sm hover:text-court"
          >
            <n.icon className="size-4" />
            {tx({ fr: n.fr, en: n.en })}
          </a>
        ))}
      </nav>
      {isLoading || !settings ? (
        <div className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[260px] !rounded-[30px]" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <CourtsSection />
          <BookingSection settings={settings} confirm={confirm} />
          <PricingSection settings={settings} />
          <TokensSection settings={settings} />
          <HoursSection settings={settings} />
          <FeaturesSection settings={settings} />
          <NotificationsSection settings={settings} />
          <p className="m-0 text-center text-xs text-muted-foreground">
            {tx({
              fr: `Dernière modification : ${new Date(settings.updatedAt).toLocaleString("fr-FR")}`,
              en: `Last change: ${new Date(settings.updatedAt).toLocaleString("en-GB")}`,
            })}
          </p>
        </div>
      )}
      {dialog}
    </Page>
  );
}

/* ───────────────────────────────── Sections ──────────────────────────────── */

function CourtsSection() {
  const tx = useTx();
  const { data: terrains } = useListTerrains();
  const bookable = (terrains ?? []).filter((t) => t.isActive && !t.isMaintenance).length;
  const maintenance = (terrains ?? []).filter((t) => t.isMaintenance).length;
  return (
    <Section
      id="courts"
      icon={<LandPlot className="size-5" />}
      title={tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
      description={tx({
        fr: "Ajoutez, renommez, réordonnez, mettez en maintenance ou archivez vos terrains. Chaque terrain peut avoir son propre prix ou ses propres horaires.",
        en: "Add, rename, reorder, put under maintenance or archive courts. Each court may have its own price or hours.",
      })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap gap-2">
          <Pill tone="lime">
            {tx({ fr: `${bookable} réservable(s)`, en: `${bookable} bookable` })}
          </Pill>
          {maintenance > 0 && (
            <Pill tone="warning">
              {tx({ fr: `${maintenance} en maintenance`, en: `${maintenance} under maintenance` })}
            </Pill>
          )}
          <Pill>
            {tx({
              fr: `${terrains?.length ?? 0} au total`,
              en: `${terrains?.length ?? 0} in total`,
            })}
          </Pill>
        </span>
        <Button variant="outline" asChild>
          <Link href="/admin/terrains">
            {tx({ fr: "Gérer les terrains", en: "Manage courts", ar: "إدارة الملاعب" })}
          </Link>
        </Button>
      </div>
    </Section>
  );
}

const DURATIONS = ["60", "90", "120"];

function BookingSection({
  settings,
  confirm,
}: {
  settings: AdminSettings;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const tx = useTx();
  const s = useSettingsSection(settings, "booking", [
    "bookingDurationMinutes",
    "minPlayers",
    "maxPlayers",
    "minAdvanceMinutes",
    "maxAdvanceDays",
    "cancellationNoticeHours",
    "lateCancellation",
  ]);
  const d = s.draft;
  const err = (k: NumKey) => (d[k] === undefined ? null : numberError(k, String(d[k]), tx));
  const playersError =
    !err("minPlayers") && !err("maxPlayers") && Number(d.minPlayers) > Number(d.maxPlayers)
      ? tx({ fr: "Le minimum dépasse le maximum", en: "Minimum is above maximum" })
      : null;
  const invalid =
    (
      [
        "bookingDurationMinutes",
        "minPlayers",
        "maxPlayers",
        "minAdvanceMinutes",
        "maxAdvanceDays",
        "cancellationNoticeHours",
      ] as NumKey[]
    ).some((k) => err(k)) || !!playersError;
  const custom =
    d.bookingDurationMinutes !== undefined && !DURATIONS.includes(String(d.bookingDurationMinutes));
  const [showCustom, setShowCustom] = useState(false);

  const onSave = async () => {
    const changedGrid =
      Number(d.bookingDurationMinutes) !== settings.bookingDurationMinutes ||
      Number(d.maxPlayers) !== settings.maxPlayers;
    if (changedGrid && settings.upcomingBookings > 0) {
      const ok = await confirm({
        title: tx({
          fr: "Changer la durée ou le nombre de joueurs ?",
          en: "Change duration or players?",
        }),
        description: tx({
          fr: `${settings.upcomingBookings} réservation(s) à venir gardent leurs horaires et leur nombre de places. Le nouveau réglage s'applique aux prochaines réservations ; le planning s'adapte automatiquement autour des matchs existants.`,
          en: `${settings.upcomingBookings} upcoming booking(s) keep their times and spots. The new setting applies to new bookings; the schedule works around existing matches.`,
        }),
        confirmLabel: tx({ fr: "Appliquer", en: "Apply" }),
      });
      if (!ok) return;
    }
    s.save();
  };

  return (
    <Section
      id="booking"
      icon={<CalendarClock className="size-5" />}
      title={tx({ fr: "Réservations", en: "Booking", ar: "الحجوزات" })}
      description={tx({
        fr: "Durée d'un match, nombre de joueurs, fenêtre de réservation et règles d'annulation.",
        en: "Match length, number of players, booking window and cancellation rules.",
      })}
      footer={
        <SectionButtons
          dirty={s.dirty}
          busy={s.busy}
          invalid={invalid}
          onSave={onSave}
          onReset={s.resetToDefault}
        />
      }
    >
      <Field
        label={tx({ fr: "Durée d'un match", en: "Match duration", ar: "مدة المباراة" })}
        hint={tx({
          fr: "Le planning est découpé en créneaux de cette durée à partir de l'heure d'ouverture. Ex : 90 min → 08:00, 09:30, 11:00…",
          en: "The schedule is cut into slots of this length from opening time. e.g. 90 min → 08:00, 09:30, 11:00…",
        })}
      >
        <Segmented
          label={tx({ fr: "Durée", en: "Duration" })}
          value={custom || showCustom ? "custom" : String(d.bookingDurationMinutes)}
          onChange={(v) => {
            if (v === "custom") setShowCustom(true);
            else {
              setShowCustom(false);
              s.set("bookingDurationMinutes", v);
            }
          }}
          options={[
            ...DURATIONS.map((v) => ({ value: v, label: `${v} min` })),
            { value: "custom", label: tx({ fr: "Autre", en: "Custom" }) },
          ]}
        />
      </Field>
      {(custom || showCustom) && (
        <NumberField
          id="set-duration"
          label={tx({ fr: "Durée personnalisée", en: "Custom duration" })}
          hint={tx({
            fr: "Entre 30 et 240 minutes, par pas de 5.",
            en: "30 to 240 minutes, in steps of 5.",
          })}
          suffix="min"
          step="5"
          value={String(d.bookingDurationMinutes ?? "")}
          onChange={(v) => s.set("bookingDurationMinutes", v)}
          error={err("bookingDurationMinutes")}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="set-min-players"
          label={tx({ fr: "Joueurs minimum", en: "Minimum players", ar: "الحد الأدنى للاعبين" })}
          hint={tx({
            fr: "Indicatif, affiché aux joueurs. Une réservation « ma place » reste possible à 1.",
            en: "For information, shown to players. Booking a single spot stays possible.",
          })}
          value={String(d.minPlayers ?? "")}
          onChange={(v) => s.set("minPlayers", v)}
          error={err("minPlayers") ?? playersError}
        />
        <NumberField
          id="set-max-players"
          label={tx({
            fr: "Joueurs maximum (places par match)",
            en: "Maximum players (spots per match)",
            ar: "الحد الأقصى للاعبين",
          })}
          hint={tx({ fr: "Ex : 4 pour le padel en double.", en: "e.g. 4 for doubles padel." })}
          value={String(d.maxPlayers ?? "")}
          onChange={(v) => s.set("maxPlayers", v)}
          error={err("maxPlayers")}
        />
        <NumberField
          id="set-min-advance"
          label={tx({
            fr: "Réserver au plus tard",
            en: "Book at the latest",
            ar: "آخر موعد للحجز",
          })}
          hint={tx({
            fr: "Minutes avant le début du match. Ex : 30 → un match à 18:00 se réserve jusqu'à 17:30.",
            en: "Minutes before the match starts. e.g. 30 → an 18:00 match can be booked until 17:30.",
          })}
          suffix="min"
          value={String(d.minAdvanceMinutes ?? "")}
          onChange={(v) => s.set("minAdvanceMinutes", v)}
          error={err("minAdvanceMinutes")}
        />
        <NumberField
          id="set-max-advance"
          label={tx({
            fr: "Réserver au plus tôt",
            en: "Book at the earliest",
            ar: "أقصى مدة للحجز المسبق",
          })}
          hint={tx({
            fr: "Jours à l'avance. Ex : 14 → deux semaines.",
            en: "Days ahead. e.g. 14 → two weeks.",
          })}
          suffix={tx({ fr: "jours", en: "days" })}
          value={String(d.maxAdvanceDays ?? "")}
          onChange={(v) => s.set("maxAdvanceDays", v)}
          error={err("maxAdvanceDays")}
        />
        <NumberField
          id="set-cancel"
          label={tx({ fr: "Délai d'annulation", en: "Cancellation deadline", ar: "مهلة الإلغاء" })}
          hint={tx({
            fr: "Heures avant le match pour annuler avec remboursement des tokens. 0 = jusqu'au début du match.",
            en: "Hours before the match to cancel with a token refund. 0 = until the match starts.",
          })}
          suffix="h"
          value={String(d.cancellationNoticeHours ?? "")}
          onChange={(v) => s.set("cancellationNoticeHours", v)}
          error={err("cancellationNoticeHours")}
        />
        <Field
          label={tx({ fr: "Après ce délai", en: "After the deadline", ar: "بعد المهلة" })}
          hint={tx({
            fr: "« Interdire » : le joueur doit appeler le club. « Sans remboursement » : il peut annuler mais ses tokens ne sont pas rendus. L'admin peut toujours annuler et rembourser.",
            en: "“Forbid”: the player calls the club. “No refund”: they may cancel but keep no tokens back. Admins can always cancel and refund.",
          })}
        >
          <Segmented
            label={tx({ fr: "Après le délai", en: "After the deadline" })}
            value={String(d.lateCancellation ?? "forbid") as "forbid" | "no_refund"}
            onChange={(v) => s.set("lateCancellation", v)}
            options={[
              { value: "forbid", label: tx({ fr: "Interdire", en: "Forbid" }) },
              { value: "no_refund", label: tx({ fr: "Sans remboursement", en: "No refund" }) },
            ]}
          />
        </Field>
      </div>
    </Section>
  );
}

function PricingSection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const s = useSettingsSection(settings, "pricing", ["currency", "playerPrice", "fullCourtPrice"]);
  const d = s.draft;
  const err = (k: NumKey) => (d[k] === undefined ? null : numberError(k, String(d[k]), tx));
  const currencyError =
    d.currency !== undefined && !/^[A-Z]{3}$/.test(String(d.currency))
      ? tx({ fr: "Code à 3 lettres majuscules, ex : TND", en: "3 capital letters, e.g. TND" })
      : null;
  const cur = String(d.currency ?? settings.currency);
  return (
    <Section
      id="pricing"
      icon={<Tags className="size-5" />}
      title={tx({ fr: "Tarifs", en: "Pricing", ar: "الأسعار" })}
      description={tx({
        fr: "Prix payés en espèces à l'accueil. Les heures pleines / creuses, week-ends et jours fériés se règlent dans Tarifs → règles (elles sont prioritaires).",
        en: "Cash prices at the desk. Peak / off-peak, weekend and holiday prices are set as pricing rules (they take priority).",
      })}
      footer={
        <SectionButtons
          dirty={s.dirty}
          busy={s.busy}
          invalid={!!(err("playerPrice") || err("fullCourtPrice") || currencyError)}
          onSave={() => s.save()}
          onReset={s.resetToDefault}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={tx({ fr: "Devise", en: "Currency", ar: "العملة" })}
          htmlFor="set-currency"
          hint={currencyError ?? tx({ fr: "Ex : TND, EUR, MAD", en: "e.g. TND, EUR, MAD" })}
        >
          <Input
            id="set-currency"
            maxLength={3}
            value={cur}
            aria-invalid={!!currencyError || undefined}
            onChange={(e) => s.set("currency", e.target.value.toUpperCase())}
          />
        </Field>
        <NumberField
          id="set-player-price"
          label={tx({ fr: "Prix par joueur", en: "Price per player", ar: "السعر للاعب" })}
          hint={tx({ fr: "Ex : 25 pour un match de 90 min.", en: "e.g. 25 for a 90-min match." })}
          suffix={cur}
          step="0.5"
          value={String(d.playerPrice ?? "")}
          onChange={(v) => s.set("playerPrice", v)}
          error={err("playerPrice")}
        />
        <NumberField
          id="set-court-price"
          label={tx({
            fr: "Prix du terrain complet",
            en: "Full court price",
            ar: "سعر الملعب الكامل",
          })}
          hint={tx({ fr: "Ex : 100 (4 × 25).", en: "e.g. 100 (4 × 25)." })}
          suffix={cur}
          step="0.5"
          value={String(d.fullCourtPrice ?? "")}
          onChange={(v) => s.set("fullCourtPrice", v)}
          error={err("fullCourtPrice")}
        />
      </div>
      <Link href="/admin/pricing" className="ulink self-start text-sm font-bold text-court">
        {tx({
          fr: "Heures pleines, heures creuses, week-end → règles de prix",
          en: "Peak, off-peak, weekend → pricing rules",
        })}
      </Link>
    </Section>
  );
}

function TokensSection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const s = useSettingsSection(settings, "tokens", [
    "tokenCostPlayer",
    "tokenCostFullCourt",
    "tokenUnitPrice",
    "tokenMinPurchase",
  ]);
  const d = s.draft;
  const err = (k: NumKey) => (d[k] === undefined ? null : numberError(k, String(d[k]), tx));
  const keys: NumKey[] = [
    "tokenCostPlayer",
    "tokenCostFullCourt",
    "tokenUnitPrice",
    "tokenMinPurchase",
  ];
  return (
    <Section
      id="tokens"
      icon={<Coins className="size-5" />}
      title={tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" })}
      description={tx({
        fr: "Les joueurs paient en espèces à l'accueil, l'admin crédite des tokens, les réservations les débitent. Les tokens n'expirent pas.",
        en: "Players pay cash at the desk, the admin credits tokens, bookings debit them. Tokens do not expire.",
      })}
      footer={
        <SectionButtons
          dirty={s.dirty}
          busy={s.busy}
          invalid={keys.some((k) => err(k))}
          onSave={() => s.save()}
          onReset={s.resetToDefault}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="set-token-player"
          label={tx({ fr: "Tokens pour une place", en: "Tokens for one spot", ar: "رصيد المكان" })}
          hint={tx({
            fr: "Ex : 1. Une règle de prix peut le changer selon l'heure.",
            en: "e.g. 1. A pricing rule may change it by time.",
          })}
          suffix="tokens"
          value={String(d.tokenCostPlayer ?? "")}
          onChange={(v) => s.set("tokenCostPlayer", v)}
          error={err("tokenCostPlayer")}
        />
        <NumberField
          id="set-token-court"
          label={tx({
            fr: "Tokens pour le terrain complet",
            en: "Tokens for the full court",
            ar: "رصيد الملعب الكامل",
          })}
          hint={tx({
            fr: "Ex : 4. Les invités du réservant jouent gratuitement.",
            en: "e.g. 4. The booker's guests play free.",
          })}
          suffix="tokens"
          value={String(d.tokenCostFullCourt ?? "")}
          onChange={(v) => s.set("tokenCostFullCourt", v)}
          error={err("tokenCostFullCourt")}
        />
        <NumberField
          id="set-token-price"
          label={tx({ fr: "Prix d'un token", en: "Price of one token", ar: "سعر الرصيد" })}
          hint={tx({
            fr: "Prix affiché aux joueurs, hors packs. Ex : 25.",
            en: "Shown to players, outside packs. e.g. 25.",
          })}
          suffix={settings.currency}
          step="0.5"
          value={String(d.tokenUnitPrice ?? "")}
          onChange={(v) => s.set("tokenUnitPrice", v)}
          error={err("tokenUnitPrice")}
        />
        <NumberField
          id="set-token-min"
          label={tx({ fr: "Achat minimum", en: "Minimum purchase", ar: "الحد الأدنى للشراء" })}
          hint={tx({
            fr: "Pour une vente à l'unité (les cadeaux et corrections ne sont pas limités).",
            en: "For a single-token sale (gifts and corrections aren't limited).",
          })}
          suffix="tokens"
          value={String(d.tokenMinPurchase ?? "")}
          onChange={(v) => s.set("tokenMinPurchase", v)}
          error={err("tokenMinPurchase")}
        />
      </div>
      <TokenPackages currency={settings.currency} />
    </Section>
  );
}

function TokenPackages({ currency }: { currency: string }) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: packs } = useAdminTokenPackages();
  const save = useSaveTokenPackage();
  const remove = useDeleteTokenPackage();
  const [draft, setDraft] = useState({ name: "", tokens: "", price: "" });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: settingsKeys.packages });
    qc.invalidateQueries({ queryKey: settingsKeys.rules });
  };
  const fail = (e: unknown) =>
    toast({ title: apiErrorMessage(e, "Error"), variant: "destructive" });
  const valid =
    draft.name.trim() &&
    Number.isInteger(Number(draft.tokens)) &&
    Number(draft.tokens) >= 1 &&
    Number(draft.tokens) <= 1000 &&
    draft.price !== "" &&
    Number(draft.price) >= 0;
  const toggle = (p: TokenPackage) =>
    save.mutate(
      { id: p.id, data: { isActive: !p.isActive } },
      { onSuccess: refresh, onError: fail },
    );
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-mist p-4">
      <span className="font-extrabold">
        {tx({ fr: "Packs vendus à l'accueil", en: "Packs sold at the desk" })}
      </span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(packs ?? []).map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2",
              !p.isActive && "opacity-60",
            )}
          >
            <span className="font-bold">
              {p.name} · {p.tokens} tokens · {p.price} {currency}
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                {tx({
                  fr: `soit ${(p.price / p.tokens).toFixed(2)} ${currency}/token`,
                  en: `${(p.price / p.tokens).toFixed(2)} ${currency}/token`,
                })}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-bold">
                <Switch checked={!!p.isActive} onCheckedChange={() => toggle(p)} />
                {tx({ fr: "En vente", en: "On sale" })}
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                aria-label={tx({ fr: `Supprimer ${p.name}`, en: `Delete ${p.name}` })}
                onClick={() => remove.mutate(p.id, { onSuccess: refresh, onError: fail })}
              >
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_110px_130px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          save.mutate(
            {
              data: {
                name: draft.name.trim(),
                tokens: Number(draft.tokens),
                price: Number(draft.price),
                sortOrder: (packs?.length ?? 0) + 1,
              },
            },
            {
              onSuccess: () => {
                setDraft({ name: "", tokens: "", price: "" });
                refresh();
                toast({ title: tx({ fr: "Pack ajouté", en: "Pack added" }) });
              },
              onError: fail,
            },
          );
        }}
      >
        <Input
          aria-label={tx({ fr: "Nom du pack", en: "Pack name" })}
          placeholder={tx({ fr: "Ex : Pack 10", en: "e.g. Pack 10" })}
          value={draft.name}
          maxLength={60}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Input
          aria-label="Tokens"
          type="number"
          min={1}
          max={1000}
          placeholder="Tokens"
          value={draft.tokens}
          onChange={(e) => setDraft({ ...draft, tokens: e.target.value })}
        />
        <Input
          aria-label={tx({ fr: "Prix", en: "Price" })}
          type="number"
          min={0}
          step="0.5"
          placeholder={`${tx({ fr: "Prix", en: "Price" })} (${currency})`}
          value={draft.price}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })}
        />
        <Button type="submit" variant="outline" disabled={!valid || save.isPending}>
          <Plus />
          {tx({ fr: "Ajouter", en: "Add" })}
        </Button>
      </form>
    </div>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const DAY_NAMES: Record<number, Copy> = {
  0: { fr: "Dimanche", en: "Sunday", ar: "الأحد" },
  1: { fr: "Lundi", en: "Monday", ar: "الإثنين" },
  2: { fr: "Mardi", en: "Tuesday", ar: "الثلاثاء" },
  3: { fr: "Mercredi", en: "Wednesday", ar: "الأربعاء" },
  4: { fr: "Jeudi", en: "Thursday", ar: "الخميس" },
  5: { fr: "Vendredi", en: "Friday", ar: "الجمعة" },
  6: { fr: "Samedi", en: "Saturday", ar: "السبت" },
};

function HoursSection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const saveHours = useSaveOpeningHours();
  const reset = useResetSettings();
  const [days, setDays] = useState<OpeningHoursDay[]>(settings.openingHours);
  useEffect(() => setDays(settings.openingHours), [settings.openingHours]);
  const dirty = JSON.stringify(days) !== JSON.stringify(settings.openingHours);
  const dayError = (d: OpeningHoursDay) =>
    !d.isClosed && d.openTime >= d.closeTime
      ? tx({ fr: "La fermeture doit suivre l'ouverture", en: "Closing must be after opening" })
      : null;
  const invalid = days.some((d) => dayError(d));
  const setDay = (weekday: number, patch: Partial<OpeningHoursDay>) =>
    setDays((all) => all.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const after = () => {
    qc.invalidateQueries({ queryKey: settingsKeys.admin });
    qc.invalidateQueries({ queryKey: settingsKeys.rules });
    qc.invalidateQueries({ queryKey: ["/api/calendar"] });
  };
  return (
    <Section
      id="hours"
      icon={<Clock className="size-5" />}
      title={tx({ fr: "Horaires d'ouverture", en: "Opening hours", ar: "ساعات العمل" })}
      description={tx({
        fr: "Horaires de chaque jour de la semaine, puis les exceptions : jours fériés, fermetures, horaires spéciaux ou maintenance d'un terrain.",
        en: "Hours for each weekday, then exceptions: holidays, closures, special hours or a court's maintenance day.",
      })}
      footer={
        <SectionButtons
          dirty={dirty}
          busy={saveHours.isPending || reset.isPending}
          invalid={invalid}
          onSave={() =>
            saveHours.mutate(days, {
              onSuccess: () => {
                after();
                toast({
                  title: tx({
                    fr: "Horaires enregistrés",
                    en: "Hours saved",
                    ar: "تم حفظ الساعات",
                  }),
                });
              },
              onError: (e) => toast({ title: apiErrorMessage(e, "Error"), variant: "destructive" }),
            })
          }
          onReset={() =>
            reset.mutate("openingHours", {
              onSuccess: () => {
                after();
                toast({
                  title: tx({
                    fr: "Horaires par défaut rétablis (08:00–23:00)",
                    en: "Default hours restored (08:00–23:00)",
                  }),
                });
              },
            })
          }
        />
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {WEEK.map((w) => {
          const d = days.find((x) => x.weekday === w);
          if (!d) return null;
          const error = dayError(d);
          return (
            <li
              key={w}
              className="grid grid-cols-[110px_auto_1fr] items-center gap-3 rounded-2xl bg-mist p-3 sm:grid-cols-[140px_150px_1fr]"
            >
              <span className="font-bold">{tx(DAY_NAMES[w])}</span>
              <label className="flex items-center gap-2 text-sm font-bold">
                <Switch
                  checked={!d.isClosed}
                  onCheckedChange={(v) => setDay(w, { isClosed: !v })}
                />
                {d.isClosed ? tx({ fr: "Fermé", en: "Closed" }) : tx({ fr: "Ouvert", en: "Open" })}
              </label>
              {!d.isClosed && (
                <span className="flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    className="w-[120px]"
                    aria-label={tx({
                      fr: `Ouverture ${tx(DAY_NAMES[w])}`,
                      en: `Opens ${tx(DAY_NAMES[w])}`,
                    })}
                    value={d.openTime}
                    onChange={(e) => setDay(w, { openTime: e.target.value })}
                  />
                  <span aria-hidden="true">–</span>
                  <Input
                    type="time"
                    className="w-[120px]"
                    aria-label={tx({
                      fr: `Fermeture ${tx(DAY_NAMES[w])}`,
                      en: `Closes ${tx(DAY_NAMES[w])}`,
                    })}
                    value={d.closeTime === "24:00" ? "00:00" : d.closeTime}
                    onChange={(e) =>
                      setDay(w, {
                        closeTime: e.target.value === "00:00" ? "24:00" : e.target.value,
                      })
                    }
                  />
                  {error && (
                    <span role="alert" className="text-sm font-semibold text-destructive">
                      {error}
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-xs text-muted-foreground">
        {tx({
          fr: "Astuce : fermeture à 00:00 = minuit.",
          en: "Tip: closing at 00:00 = midnight.",
        })}
      </p>
      <Exceptions />
    </Section>
  );
}

function Exceptions() {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: list } = useScheduleExceptions();
  const { data: terrains } = useListTerrains();
  const create = useCreateScheduleException();
  const remove = useDeleteScheduleException();
  const [form, setForm] = useState({
    date: "",
    terrainId: "",
    isClosed: true,
    openTime: "10:00",
    closeTime: "18:00",
    reason: "",
  });
  const courtName = useMemo(() => new Map((terrains ?? []).map((t) => [t.id, t.name])), [terrains]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: settingsKeys.exceptions });
    qc.invalidateQueries({ queryKey: ["/api/calendar"] });
  };
  const invalid = !form.date || (!form.isClosed && form.openTime >= form.closeTime);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-mist p-4">
      <span className="font-extrabold">
        {tx({
          fr: "Exceptions (jours fériés, fermetures, maintenance)",
          en: "Exceptions (holidays, closures, maintenance)",
        })}
      </span>
      {list?.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold" dir="ltr">
                  {e.date}
                </span>
                <Pill tone={e.isClosed ? "danger" : "info"}>
                  {e.isClosed ? tx({ fr: "Fermé", en: "Closed" }) : `${e.openTime}–${e.closeTime}`}
                </Pill>
                <span className="text-sm text-muted-foreground">
                  {e.terrainId
                    ? (courtName.get(e.terrainId) ?? `#${e.terrainId}`)
                    : tx({ fr: "Tout le club", en: "Whole club" })}
                  {e.reason ? ` · ${e.reason}` : ""}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                aria-label={tx({ fr: "Supprimer l'exception", en: "Delete exception" })}
                onClick={() => remove.mutate(e.id, { onSuccess: refresh })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          {tx({ fr: "Aucune exception à venir.", en: "No upcoming exception." })}
        </p>
      )}
      <form
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (invalid) return;
          create.mutate(
            {
              date: form.date,
              terrainId: form.terrainId ? Number(form.terrainId) : null,
              isClosed: form.isClosed,
              openTime: form.isClosed ? null : form.openTime,
              closeTime: form.isClosed ? null : form.closeTime,
              reason: form.reason || null,
            },
            {
              onSuccess: () => {
                refresh();
                setForm((f) => ({ ...f, date: "", reason: "" }));
                toast({ title: tx({ fr: "Exception ajoutée", en: "Exception added" }) });
              },
              onError: (e) => toast({ title: apiErrorMessage(e, "Error"), variant: "destructive" }),
            },
          );
        }}
      >
        <Input
          type="date"
          aria-label="Date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <select
          aria-label={tx({ fr: "Terrain concerné", en: "Court" })}
          className="h-12 rounded-2xl border-2 border-[#E4E8F7] bg-card px-3 text-sm font-semibold"
          value={form.terrainId}
          onChange={(e) => setForm({ ...form, terrainId: e.target.value })}
        >
          <option value="">{tx({ fr: "Tout le club", en: "Whole club" })}</option>
          {(terrains ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Segmented
          label={tx({ fr: "Type d'exception", en: "Exception type" })}
          value={form.isClosed ? "closed" : "hours"}
          onChange={(v) => setForm({ ...form, isClosed: v === "closed" })}
          options={[
            { value: "closed", label: tx({ fr: "Fermé", en: "Closed" }) },
            { value: "hours", label: tx({ fr: "Horaires spéciaux", en: "Special hours" }) },
          ]}
        />
        {!form.isClosed && (
          <span className="flex items-center gap-2">
            <Input
              type="time"
              aria-label={tx({ fr: "Ouverture", en: "Opens" })}
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            />
            <span aria-hidden="true">–</span>
            <Input
              type="time"
              aria-label={tx({ fr: "Fermeture", en: "Closes" })}
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            />
          </span>
        )}
        <Input
          aria-label={tx({ fr: "Motif", en: "Reason" })}
          maxLength={120}
          placeholder={tx({
            fr: "Motif (ex : Aïd, tournoi, nouveau gazon)",
            en: "Reason (e.g. holiday, tournament)",
          })}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <Button type="submit" variant="outline" disabled={invalid || create.isPending}>
          <Plus />
          {tx({ fr: "Ajouter l'exception", en: "Add exception" })}
        </Button>
      </form>
    </div>
  );
}

function FeaturesSection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const s = useSettingsSection(settings, "features", [
    "openMatchesEnabled",
    "invitationsEnabled",
    "cashPaymentEnabled",
  ]);
  const d = s.draft;
  return (
    <Section
      id="features"
      icon={<ToggleRight className="size-5" />}
      title={tx({ fr: "Fonctionnalités", en: "Features", ar: "الميزات" })}
      description={tx({
        fr: "Activez seulement ce que votre club utilise. Une fonction désactivée disparaît de l'app et est refusée par le serveur.",
        en: "Turn on only what your club uses. A disabled feature disappears from the app and is refused by the server.",
      })}
      footer={
        <SectionButtons
          dirty={s.dirty}
          busy={s.busy}
          onSave={() => s.save()}
          onReset={s.resetToDefault}
        />
      }
    >
      <ToggleRow
        testId="toggle-open-matches"
        label={tx({ fr: "Open matches", en: "Open matches" })}
        hint={tx({
          fr: "Les joueurs peuvent rejoindre la place libre d'un match publié par un autre membre.",
          en: "Players can join a free spot in a match published by another member.",
        })}
        checked={!!d.openMatchesEnabled}
        onChange={(v) => s.set("openMatchesEnabled", v)}
      />
      <ToggleRow
        label={tx({ fr: "Invitations", en: "Invitations" })}
        hint={tx({
          fr: "Lien, QR code et invitation d'un membre dans l'app (accepter / refuser).",
          en: "Link, QR code and in-app member invitation (accept / decline).",
        })}
        checked={!!d.invitationsEnabled}
        onChange={(v) => s.set("invitationsEnabled", v)}
      />
      <ToggleRow
        label={tx({ fr: "Paiement au club (partiel)", en: "Pay at the club (partial payments)" })}
        hint={tx({
          fr: "Un joueur peut réserver sa place et la payer en espèces à l'accueil. Désactivé : tokens uniquement.",
          en: "A player may hold a spot and pay cash at the desk. Off: tokens only.",
        })}
        checked={!!d.cashPaymentEnabled}
        onChange={(v) => s.set("cashPaymentEnabled", v)}
      />
    </Section>
  );
}

function NotificationsSection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const s = useSettingsSection(settings, "notifications", [
    "bookingConfirmationNotificationsEnabled",
    "remindersEnabled",
    "reminderLeadMinutes",
    "cancellationNotificationsEnabled",
    "invitationNotificationsEnabled",
    "tokenNotificationsEnabled",
    "matchFinishedNotificationsEnabled",
  ]);
  const d = s.draft;
  const leadError =
    d.reminderLeadMinutes === undefined
      ? null
      : numberError("reminderLeadMinutes", String(d.reminderLeadMinutes), tx);
  const rows: [keyof SettingsPatch, Copy, Copy][] = [
    [
      "bookingConfirmationNotificationsEnabled",
      { fr: "Confirmation de réservation", en: "Booking confirmation" },
      { fr: "Après chaque réservation ou place prise.", en: "After each booking or joined spot." },
    ],
    [
      "cancellationNotificationsEnabled",
      { fr: "Annulation", en: "Cancellation" },
      {
        fr: "À tous les joueurs du match, avec le remboursement.",
        en: "To every player of the match, with the refund.",
      },
    ],
    [
      "invitationNotificationsEnabled",
      { fr: "Invitation à un match", en: "Match invitation" },
      { fr: "Quand un membre est invité dans l'app.", en: "When a member is invited in the app." },
    ],
    [
      "tokenNotificationsEnabled",
      { fr: "Tokens crédités", en: "Tokens credited" },
      { fr: "Quand l'accueil crédite des tokens.", en: "When the desk credits tokens." },
    ],
    [
      "matchFinishedNotificationsEnabled",
      { fr: "Après le match", en: "After the match" },
      {
        fr: "Remerciement et invitation à réserver le suivant.",
        en: "Thank-you and invitation to book the next one.",
      },
    ],
    [
      "remindersEnabled",
      { fr: "Rappel avant le match", en: "Reminder before the match" },
      {
        fr: "Envoyé à chaque joueur avant le début.",
        en: "Sent to every player before the start.",
      },
    ],
  ];
  return (
    <Section
      id="notifications"
      icon={<Bell className="size-5" />}
      title={tx({ fr: "Notifications", en: "Notifications", ar: "الإشعارات" })}
      description={tx({
        fr: "Messages envoyés par le club (dans l'app, par e-mail et en push selon les préférences de chaque membre).",
        en: "Messages sent by the club (in-app, e-mail and push, per each member's preferences).",
      })}
      footer={
        <SectionButtons
          dirty={s.dirty}
          busy={s.busy}
          invalid={!!leadError}
          onSave={() => s.save()}
          onReset={s.resetToDefault}
        />
      }
    >
      {rows.map(([k, label, hint]) => (
        <ToggleRow
          key={k}
          label={tx(label)}
          hint={tx(hint)}
          checked={!!d[k]}
          onChange={(v) => s.set(k, v)}
        />
      ))}
      {!!d.remindersEnabled && (
        <NumberField
          id="set-reminder-lead"
          label={tx({ fr: "Envoyer le rappel", en: "Send the reminder" })}
          hint={tx({
            fr: "Minutes avant le match. Ex : 120 = 2 h avant.",
            en: "Minutes before the match. e.g. 120 = 2 h before.",
          })}
          suffix="min"
          value={String(d.reminderLeadMinutes ?? "")}
          onChange={(v) => s.set("reminderLeadMinutes", v)}
          error={leadError}
        />
      )}
    </Section>
  );
}
