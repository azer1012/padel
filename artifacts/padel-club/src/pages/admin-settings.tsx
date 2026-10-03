import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwiseIcon,
  BellIcon,
  CheckIcon,
  ClockCountdownIcon,
  ClockIcon,
  CoinsIcon,
  CourtIcon,
  FloppyDiskIcon,
  GiftIcon,
  PencilSimpleIcon,
  PlusIcon,
  TagIcon,
  ToggleRightIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
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
import { apiErrorText } from "@/lib/api-errors";
import { money, packSaving, plural, tokenWord, tokensLabel } from "@/lib/labels";

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
  loyaltySpendTokens: [1, 1000],
  loyaltyRewardTokens: [0.01, 100],
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
  "loyaltySpendTokens",
];

function numberError(key: NumKey, raw: string, tx: Tx): string | null {
  if (raw.trim() === "") return tx({ fr: "Obligatoire", en: "Required", ar: "مطلوب" });
  const n = Number(raw);
  const [min, max] = LIMITS[key];
  if (!Number.isFinite(n))
    return tx({ fr: "Nombre invalide", en: "Invalid number", ar: "رقم غير صالح" });
  if (INTEGER.includes(key) && !Number.isInteger(n))
    return tx({ fr: "Nombre entier", en: "Whole number", ar: "عدد صحيح فقط" });
  if (n < min || n > max)
    return tx({
      fr: `Entre ${min} et ${max}`,
      en: `Between ${min} and ${max}`,
      ar: `بين ${min} و ${max}`,
    });
  if (key === "loyaltyRewardTokens" && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)
    return tx({
      fr: "2 décimales au maximum",
      en: "At most 2 decimals",
      ar: "خانتان عشريتان كحد أقصى",
    });
  if (key === "bookingDurationMinutes" && n % 5 !== 0)
    return tx({
      fr: "Multiple de 5 minutes",
      en: "Multiple of 5 minutes",
      ar: "من مضاعفات 5 دقائق",
    });
  return null;
}

/**
 * Phones show one section at a time (the page would otherwise be seven screens long);
 * from `lg` every section is on the page and the section bar scrolls to it. Hidden
 * sections stay mounted, so edits in progress are never lost by switching.
 */
const SettingsNav = createContext<{
  active: string;
  report: (id: string, dirty: boolean) => void;
}>({ active: "", report: () => {} });

function Section({
  id,
  icon,
  title,
  description,
  children,
  footer,
  dirty = false,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Unsaved edits: flagged on the section bar. */
  dirty?: boolean;
}) {
  const { active, report } = useContext(SettingsNav);
  useEffect(() => report(id, dirty), [id, dirty, report]);
  return (
    <section
      id={id}
      className={cn(
        "enter scroll-mt-36 rounded-[30px] bg-card p-5 shadow-sm sm:p-7 lg:scroll-mt-20",
        active !== id && "max-lg:hidden",
      )}
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
  // Last server values shown in this section. When another section saves, the
  // settings object changes: follow it only if this section has no pending edits.
  const base = useRef<string>("");
  useEffect(() => {
    if (!settings) return;
    const next = draftOf(settings, keys);
    setDraft((current) =>
      base.current === "" || JSON.stringify(current) === base.current
        ? next
        : { ...next, ...current },
    );
    base.current = JSON.stringify(next);
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
        base.current = JSON.stringify(draft); // adopt the saved values as returned by the server
        after(data);
        toast({
          title: tx({ fr: "Réglages enregistrés", en: "Settings saved", ar: "تم حفظ الإعدادات" }),
        });
        onSaved?.();
      },
      onError: (e) =>
        toast({
          title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
          description: apiErrorText(e, tx),
          variant: "destructive",
        }),
    });
  const resetToDefault = () =>
    reset.mutate(section, {
      onSuccess: (data) => {
        base.current = "";
        after(data);
        toast({
          title: tx({
            fr: "Valeurs par défaut rétablies",
            en: "Defaults restored",
            ar: "تمت الاستعادة",
          }),
        });
      },
      onError: (e) => toast({ title: apiErrorText(e, tx), variant: "destructive" }),
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
        <ArrowCounterClockwiseIcon />
        {tx({ fr: "Valeurs par défaut", en: "Reset to default", ar: "القيم الافتراضية" })}
      </Button>
      <Button
        type="button"
        onClick={onSave}
        disabled={!dirty || busy || invalid}
        loading={busy}
        data-testid="btn-save-settings"
      >
        <FloppyDiskIcon />
        {tx({ fr: "Enregistrer", en: "Save", ar: "حفظ" })}
      </Button>
    </>
  );
}

/* ────────────────────────────────── Page ─────────────────────────────────── */

const NAV = [
  { id: "courts", icon: CourtIcon, fr: "Terrains", en: "Courts", ar: "الملاعب" },
  { id: "booking", icon: ClockCountdownIcon, fr: "Réservations", en: "Booking", ar: "الحجوزات" },
  { id: "pricing", icon: TagIcon, fr: "Tarifs", en: "Pricing", ar: "الأسعار" },
  { id: "tokens", icon: CoinsIcon, fr: "Tokens", en: "Tokens", ar: "الرصيد" },
  { id: "loyalty", icon: GiftIcon, fr: "Fidélité", en: "Loyalty", ar: "الوفاء" },
  { id: "hours", icon: ClockIcon, fr: "Horaires", en: "Opening hours", ar: "ساعات العمل" },
  { id: "features", icon: ToggleRightIcon, fr: "Fonctionnalités", en: "Features", ar: "الميزات" },
  {
    id: "notifications",
    icon: BellIcon,
    fr: "Notifications",
    en: "Notifications",
    ar: "الإشعارات",
  },
] as const;

export default function AdminSettings() {
  const tx = useTx();
  const { data: settings, isLoading } = useAdminSettings();
  const { confirm, dialog } = useConfirm();
  const [active, setActive] = useState<string>(NAV[0].id);
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({});
  const report = useCallback(
    (id: string, dirty: boolean) =>
      setUnsaved((u) => (!!u[id] === dirty ? u : { ...u, [id]: dirty })),
    [],
  );
  const nav = useMemo(() => ({ active, report }), [active, report]);
  const go = (id: string) => {
    setActive(id);
    // After the section is shown (phones) or simply into view (desktop)
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <Page wide>
      <PageHeader
        eyebrow={tx({ fr: "Admin", en: "Admin", ar: "الإدارة" })}
        title={tx({ fr: "Réglages du club", en: "Club settings", ar: "إعدادات النادي" })}
        subtitle={tx({
          fr: "Les règles de fonctionnement du club. Chaque changement s'applique aux prochaines réservations ; les réservations existantes gardent leurs horaires et leurs prix.",
          en: "How the club runs. Every change applies to the next bookings; existing bookings keep their times and prices.",
          ar: "قواعد تشغيل النادي. ينطبق كل تغيير على الحجوزات القادمة.",
        })}
      />
      <nav
        aria-label={tx({ fr: "Sections", en: "Sections", ar: "الأقسام" })}
        className="hscroll sticky top-16 z-30 -mx-4 -my-3 gap-2 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10"
      >
        {NAV.map((n) => {
          const on = active === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              aria-current={on ? "true" : undefined}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold shadow-sm transition-colors",
                on
                  ? "bg-ink text-white lg:bg-card lg:text-ink lg:hover:text-court"
                  : "bg-card hover:text-court",
              )}
            >
              <n.icon className="size-4" />
              {tx(n)}
              {unsaved[n.id] && (
                <>
                  <span aria-hidden="true" className="size-2 rounded-full bg-coral" />
                  <span className="sr-only">
                    {tx({
                      fr: "modifications non enregistrées",
                      en: "unsaved changes",
                      ar: "تعديلات غير محفوظة",
                    })}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </nav>
      {isLoading || !settings ? (
        <div className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[260px] !rounded-[30px]" />
          ))}
        </div>
      ) : (
        <SettingsNav.Provider value={nav}>
          <div className="flex flex-col gap-6">
            <CourtsSection />
            <BookingSection settings={settings} confirm={confirm} />
            <PricingSection settings={settings} />
            <TokensSection settings={settings} />
            <LoyaltySection settings={settings} />
            <HoursSection settings={settings} />
            <FeaturesSection settings={settings} />
            <NotificationsSection settings={settings} />
            <p className="m-0 text-center text-xs text-muted-foreground">
              {tx({
                fr: `Dernière modification : ${new Date(settings.updatedAt).toLocaleString("fr-FR")}`,
                en: `Last change: ${new Date(settings.updatedAt).toLocaleString("en-GB")}`,
                ar: `آخر تعديل: ${new Date(settings.updatedAt).toLocaleString("ar-TN")}`,
              })}
            </p>
          </div>
        </SettingsNav.Provider>
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
      icon={<CourtIcon className="size-5" />}
      title={tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
      description={tx({
        fr: "Ajoutez, renommez, réordonnez, mettez en maintenance ou archivez vos terrains. Chaque terrain peut avoir son propre prix ou ses propres horaires.",
        en: "Add, rename, reorder, put under maintenance or archive courts. Each court may have its own price or hours.",
        ar: "أضف ملاعبك، أعد تسميتها أو ترتيبها، ضعها تحت الصيانة أو أرشفها. يمكن أن يكون لكل ملعب سعره وساعاته الخاصة.",
      })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap gap-2">
          <Pill tone="lime">
            {tx({
              fr: `${bookable} ${plural(bookable, "réservable", "réservables")}`,
              en: `${bookable} bookable`,
              ar: `${bookable} قابلة للحجز`,
            })}
          </Pill>
          {maintenance > 0 && (
            <Pill tone="warning">
              {tx({
                fr: `${maintenance} en maintenance`,
                en: `${maintenance} under maintenance`,
                ar: `${maintenance} تحت الصيانة`,
              })}
            </Pill>
          )}
          <Pill>
            {tx({
              fr: `${terrains?.length ?? 0} au total`,
              en: `${terrains?.length ?? 0} in total`,
              ar: `${terrains?.length ?? 0} في المجموع`,
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
      ? tx({
          fr: "Le minimum dépasse le maximum",
          en: "Minimum is above maximum",
          ar: "الحد الأدنى أكبر من الحد الأقصى",
        })
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
          ar: "تغيير المدة أو عدد اللاعبين؟",
        }),
        description: tx({
          fr: `${settings.upcomingBookings} ${plural(settings.upcomingBookings, "réservation à venir garde", "réservations à venir gardent")} leurs horaires et leur nombre de places. Le nouveau réglage s'applique aux prochaines réservations ; le planning s'adapte automatiquement autour des matchs existants.`,
          en: `${settings.upcomingBookings} ${plural(settings.upcomingBookings, "upcoming booking keeps", "upcoming bookings keep")} their times and spots. The new setting applies to new bookings; the schedule works around existing matches.`,
          ar: `${settings.upcomingBookings} حجز قادم يحتفظ بموعده وعدد أماكنه. يُطبَّق الإعداد الجديد على الحجوزات القادمة، ويتكيّف الجدول تلقائيًا مع المباريات الحالية.`,
        }),
        confirmLabel: tx({ fr: "Appliquer", en: "Apply", ar: "تطبيق" }),
      });
      if (!ok) return;
    }
    s.save();
  };

  return (
    <Section
      id="booking"
      dirty={s.dirty}
      icon={<ClockCountdownIcon className="size-5" />}
      title={tx({ fr: "Réservations", en: "Booking", ar: "الحجوزات" })}
      description={tx({
        fr: "Durée d'un match, nombre de joueurs, fenêtre de réservation et règles d'annulation.",
        en: "Match length, number of players, booking window and cancellation rules.",
        ar: "مدة المباراة، عدد اللاعبين، فترة الحجز وقواعد الإلغاء.",
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
          ar: "يُقسَّم الجدول إلى فترات بهذه المدة ابتداءً من وقت الفتح. مثال: 90 دقيقة ← 08:00، 09:30، 11:00…",
        })}
      >
        <Segmented
          label={tx({ fr: "Durée", en: "Duration", ar: "المدة" })}
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
            { value: "custom", label: tx({ fr: "Autre", en: "Custom", ar: "أخرى" }) },
          ]}
        />
      </Field>
      {(custom || showCustom) && (
        <NumberField
          id="set-duration"
          label={tx({ fr: "Durée personnalisée", en: "Custom duration", ar: "مدة مخصصة" })}
          hint={tx({
            fr: "Entre 30 et 240 minutes, par pas de 5.",
            en: "30 to 240 minutes, in steps of 5.",
            ar: "من 30 إلى 240 دقيقة، بفواصل 5 دقائق.",
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
            fr: "Affiché aux joueurs sur un match incomplet (« encore 1 pour jouer »). Réserver seulement sa place reste possible.",
            en: "Shown to players on a match below it (“1 more to play”). Booking a single spot stays possible.",
            ar: "يُعرض للاعبين في مباراة غير مكتملة («ينقص 1 للعب»). يبقى حجز مكان واحد ممكنًا.",
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
          hint={tx({
            fr: "Ex : 4 pour le padel en double.",
            en: "e.g. 4 for doubles padel.",
            ar: "مثال: 4 للبادل الزوجي.",
          })}
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
            ar: "دقائق قبل بداية المباراة. مثال: 30 ← مباراة 18:00 تُحجز حتى 17:30.",
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
            ar: "عدد الأيام مسبقًا. مثال: 14 ← أسبوعان.",
          })}
          suffix={tx({ fr: "jours", en: "days", ar: "يوم" })}
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
            ar: "عدد الساعات قبل المباراة للإلغاء مع استرجاع الرصيد. 0 = حتى بداية المباراة.",
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
            ar: "«منع»: على اللاعب الاتصال بالنادي. «دون استرجاع»: يمكنه الإلغاء لكن لا يُعاد رصيده. يستطيع المسؤول دائمًا الإلغاء والاسترجاع.",
          })}
        >
          <Segmented
            label={tx({ fr: "Après le délai", en: "After the deadline", ar: "بعد المهلة" })}
            value={String(d.lateCancellation ?? "forbid") as "forbid" | "no_refund"}
            onChange={(v) => s.set("lateCancellation", v)}
            options={[
              { value: "forbid", label: tx({ fr: "Interdire", en: "Forbid", ar: "منع" }) },
              {
                value: "no_refund",
                label: tx({ fr: "Sans remboursement", en: "No refund", ar: "دون استرجاع" }),
              },
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
      ? tx({
          fr: "Code à 3 lettres majuscules, ex : TND",
          en: "3 capital letters, e.g. TND",
          ar: "رمز من 3 أحرف لاتينية كبيرة، مثال: TND",
        })
      : null;
  const cur = String(d.currency ?? settings.currency);
  return (
    <Section
      id="pricing"
      dirty={s.dirty}
      icon={<TagIcon className="size-5" />}
      title={tx({ fr: "Tarifs", en: "Pricing", ar: "الأسعار" })}
      description={tx({
        fr: "Prix payés en espèces à l'accueil. Les heures pleines / creuses, week-ends et jours fériés se règlent dans Tarifs → règles (elles sont prioritaires).",
        en: "Cash prices at the desk. Peak / off-peak, weekend and holiday prices are set as pricing rules (they take priority).",
        ar: "الأسعار المدفوعة نقدًا في الاستقبال. أسعار الذروة وخارجها ونهاية الأسبوع والعطل تُضبط في قواعد الأسعار (ولها الأولوية).",
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
          hint={
            currencyError ??
            tx({ fr: "Ex : TND, EUR, MAD", en: "e.g. TND, EUR, MAD", ar: "مثال: TND، EUR، MAD" })
          }
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
          hint={tx({
            fr: "Ex : 25 pour un match de 90 min.",
            en: "e.g. 25 for a 90-min match.",
            ar: "مثال: 25 لمباراة من 90 دقيقة.",
          })}
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
          hint={tx({
            fr: "Ex : 100 (4 × 25).",
            en: "e.g. 100 (4 × 25).",
            ar: "مثال: 100 (4 × 25).",
          })}
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
          ar: "ساعات الذروة، خارج الذروة، نهاية الأسبوع ← قواعد الأسعار",
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
      dirty={s.dirty}
      icon={<CoinsIcon className="size-5" />}
      title={tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" })}
      description={tx({
        fr: "Les joueurs paient en espèces à l'accueil, l'admin crédite des tokens, les réservations les débitent. Les tokens n'expirent pas.",
        en: "Players pay cash at the desk, the admin credits tokens, bookings debit them. Tokens do not expire.",
        ar: "يدفع اللاعبون نقدًا في الاستقبال، يضيف المسؤول الرصيد، وتخصمه الحجوزات. الرصيد لا تنتهي صلاحيته.",
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
            ar: "مثال: 1. يمكن لقاعدة سعر تغييره حسب الوقت.",
          })}
          suffix={tokenWord(2)}
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
            ar: "مثال: 4. ضيوف صاحب الحجز يلعبون مجانًا.",
          })}
          suffix={tokenWord(2)}
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
            ar: "السعر المعروض للاعبين خارج الباقات. مثال: 25.",
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
            ar: "للبيع بالوحدة (الهدايا والتصحيحات غير محدودة).",
          })}
          suffix={tokenWord(2)}
          value={String(d.tokenMinPurchase ?? "")}
          onChange={(v) => s.set("tokenMinPurchase", v)}
          error={err("tokenMinPurchase")}
        />
      </div>
      <TokenPackages currency={settings.currency} unitPrice={settings.tokenUnitPrice} />
    </Section>
  );
}

type PackDraft = { name: string; tokens: string; price: string };
const packValid = (d: PackDraft) =>
  !!d.name.trim() &&
  Number.isInteger(Number(d.tokens)) &&
  Number(d.tokens) >= 1 &&
  Number(d.tokens) <= 1000 &&
  d.price !== "" &&
  Number(d.price) > 0;

/** "au lieu de 250 TND (−20 %)", or the price of one token when the pack saves nothing. */
function PackPrice({
  tokens,
  price,
  unitPrice,
  currency,
}: {
  tokens: number;
  price: number;
  unitPrice: number;
  currency: string;
}) {
  const tx = useTx();
  const saving = packSaving({ tokens, price }, unitPrice);
  const each = money(price / tokens);
  if (saving)
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {tx({ fr: "au lieu de", en: "instead of", ar: "بدلًا من" })}{" "}
          <s>
            {money(saving.regular)} {currency}
          </s>
        </span>
        {saving.percent >= 1 && <Pill tone="lime">−{saving.percent} %</Pill>}
        <span>
          {tx({
            fr: `soit ${each} ${currency}/token`,
            en: `${each} ${currency}/token`,
            ar: `أي ${each} ${currency} للرصيد`,
          })}
        </span>
      </span>
    );
  return (
    <span className="text-sm text-muted-foreground">
      {tx({
        fr: `soit ${each} ${currency}/token, sans réduction`,
        en: `${each} ${currency}/token, no discount`,
        ar: `أي ${each} ${currency} للرصيد، بدون تخفيض`,
      })}
    </span>
  );
}

function PackForm({
  initial,
  currency,
  unitPrice,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: PackDraft;
  currency: string;
  unitPrice: number;
  busy: boolean;
  submitLabel: string;
  onSubmit: (d: PackDraft, reset: () => void) => void;
  onCancel?: () => void;
}) {
  const tx = useTx();
  const [d, setD] = useState(initial);
  const valid = packValid(d);
  return (
    <form
      data-testid={onCancel ? "pack-edit" : "pack-new"}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(d, () => setD({ name: "", tokens: "", price: "" }));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_110px_140px_auto]">
        <Input
          aria-label={tx({ fr: "Nom du pack", en: "Pack name", ar: "اسم الباقة" })}
          placeholder={tx({ fr: "Ex : Pack 10", en: "e.g. Pack 10", ar: "مثال: باقة 10" })}
          value={d.name}
          maxLength={60}
          onChange={(e) => setD({ ...d, name: e.target.value })}
        />
        <Input
          aria-label={tx({ fr: "Nombre de tokens", en: "Number of tokens", ar: "عدد الرصيد" })}
          type="number"
          min={1}
          max={1000}
          placeholder={tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" })}
          value={d.tokens}
          onChange={(e) => setD({ ...d, tokens: e.target.value })}
        />
        <Input
          aria-label={tx({
            fr: `Prix du pack (${currency})`,
            en: `Pack price (${currency})`,
            ar: `سعر الباقة (${currency})`,
          })}
          type="number"
          min={0.5}
          step="0.5"
          inputMode="decimal"
          placeholder={`${tx({ fr: "Prix", en: "Price", ar: "السعر" })} (${currency})`}
          value={d.price}
          onChange={(e) => setD({ ...d, price: e.target.value })}
        />
        <span className="flex gap-2">
          <Button
            type="submit"
            variant={onCancel ? "default" : "outline"}
            disabled={!valid || busy}
            loading={busy}
            className="flex-1"
          >
            {onCancel ? <CheckIcon /> : <PlusIcon />}
            {submitLabel}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label={tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
            >
              <XIcon />
            </Button>
          )}
        </span>
      </div>
      {valid && (
        <PackPrice
          tokens={Number(d.tokens)}
          price={Number(d.price)}
          unitPrice={unitPrice}
          currency={currency}
        />
      )}
    </form>
  );
}

function TokenPackages({ currency, unitPrice }: { currency: string; unitPrice: number }) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: packs } = useAdminTokenPackages();
  const save = useSaveTokenPackage();
  const remove = useDeleteTokenPackage();
  const [editing, setEditing] = useState<number | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: settingsKeys.packages });
    qc.invalidateQueries({ queryKey: settingsKeys.rules });
  };
  const fail = (e: unknown) => toast({ title: apiErrorText(e, tx), variant: "destructive" });
  const fields = (d: PackDraft) => ({
    name: d.name.trim(),
    tokens: Number(d.tokens),
    price: Number(d.price),
  });
  const toggle = (p: TokenPackage) =>
    save.mutate(
      { id: p.id, data: { isActive: !p.isActive } },
      { onSuccess: refresh, onError: fail },
    );
  async function del(p: TokenPackage) {
    const ok = await confirm({
      title: tx({
        fr: `Supprimer « ${p.name} » ?`,
        en: `Delete “${p.name}”?`,
        ar: `حذف «${p.name}»؟`,
      }),
      description: tx({
        fr: "Il disparaît des tarifs et de la vente à l'accueil. Un pack déjà vendu ne peut pas être supprimé : retirez-le de la vente.",
        en: "It leaves the prices and the desk. A pack already sold can't be deleted: take it off sale instead.",
        ar: "تختفي من الأسعار ومن البيع في الاستقبال. لا يمكن حذف باقة بيعت من قبل: أوقف بيعها.",
      }),
      confirmLabel: tx({ fr: "Supprimer", en: "Delete", ar: "حذف" }),
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(p.id, {
      onSuccess: () => {
        refresh();
        toast({ title: tx({ fr: "Pack supprimé", en: "Pack deleted", ar: "تم حذف الباقة" }) });
      },
      onError: fail,
    });
  }
  return (
    <div data-testid="token-packs" className="flex flex-col gap-3 rounded-2xl bg-mist p-4">
      <span className="flex flex-col gap-1">
        <span className="font-extrabold">
          {tx({ fr: "Packs de tokens", en: "Token packs", ar: "باقات الرصيد" })}
        </span>
        <span className="text-sm text-muted-foreground">
          {tx({
            fr: "Plusieurs tokens à prix réduit, vendus à l'accueil. Les packs en vente sont affichés aux joueurs dans les tarifs de la page d'accueil et dans leur portefeuille.",
            en: "Several tokens at a lower price, sold at the desk. Packs on sale are shown to players in the home page prices and in their wallet.",
            ar: "عدة أرصدة بسعر مخفّض تُباع في الاستقبال. تظهر الباقات المعروضة للاعبين في أسعار الصفحة الرئيسية وفي محفظتهم.",
          })}
        </span>
      </span>
      {packs && packs.length === 0 && (
        <span className="rounded-xl bg-card px-3 py-3 text-sm text-muted-foreground">
          {tx({
            fr: "Aucun pack : les tokens se vendent à l'unité.",
            en: "No packs: tokens are sold one by one.",
            ar: "لا توجد باقات: يُباع الرصيد بالوحدة.",
          })}
        </span>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(packs ?? []).map((p) =>
          editing === p.id ? (
            <li key={p.id} className="rounded-xl bg-card px-3 py-3">
              <PackForm
                initial={{ name: p.name, tokens: String(p.tokens), price: String(p.price) }}
                currency={currency}
                unitPrice={unitPrice}
                busy={save.isPending}
                submitLabel={tx({ fr: "Enregistrer", en: "Save", ar: "حفظ" })}
                onCancel={() => setEditing(null)}
                onSubmit={(d) =>
                  save.mutate(
                    { id: p.id, data: fields(d) },
                    {
                      onSuccess: () => {
                        setEditing(null);
                        refresh();
                        toast({
                          title: tx({
                            fr: "Pack modifié",
                            en: "Pack updated",
                            ar: "تم تعديل الباقة",
                          }),
                        });
                      },
                      onError: fail,
                    },
                  )
                }
              />
            </li>
          ) : (
            <li
              key={p.id}
              data-testid="pack-row"
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2",
                !p.isActive && "opacity-60",
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-bold">
                  {p.name} · {tokensLabel(p.tokens)} · {money(p.price)} {currency}
                </span>
                <PackPrice
                  tokens={p.tokens}
                  price={p.price}
                  unitPrice={unitPrice}
                  currency={currency}
                />
              </span>
              <span className="flex items-center gap-1">
                <label className="me-1 flex items-center gap-2 text-sm font-bold">
                  <Switch checked={!!p.isActive} onCheckedChange={() => toggle(p)} />
                  {tx({ fr: "En vente", en: "On sale", ar: "معروضة للبيع" })}
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tx({
                    fr: `Modifier ${p.name}`,
                    en: `Edit ${p.name}`,
                    ar: `تعديل ${p.name}`,
                  })}
                  onClick={() => setEditing(p.id)}
                >
                  <PencilSimpleIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  aria-label={tx({
                    fr: `Supprimer ${p.name}`,
                    en: `Delete ${p.name}`,
                    ar: `حذف ${p.name}`,
                  })}
                  onClick={() => del(p)}
                >
                  <TrashIcon />
                </Button>
              </span>
            </li>
          ),
        )}
      </ul>
      <PackForm
        initial={{ name: "", tokens: "", price: "" }}
        currency={currency}
        unitPrice={unitPrice}
        busy={save.isPending && editing === null}
        submitLabel={tx({ fr: "Ajouter", en: "Add", ar: "إضافة" })}
        onSubmit={(d, reset) =>
          save.mutate(
            { data: { ...fields(d), sortOrder: (packs?.length ?? 0) + 1 } },
            {
              onSuccess: () => {
                reset();
                refresh();
                toast({
                  title: tx({ fr: "Pack ajouté", en: "Pack added", ar: "تمت إضافة الباقة" }),
                });
              },
              onError: fail,
            },
          )
        }
      />
      {dialog}
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

function LoyaltySection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const s = useSettingsSection(settings, "loyalty", [
    "loyaltyEnabled",
    "loyaltySpendTokens",
    "loyaltyRewardTokens",
  ]);
  const d = s.draft;
  const err = (k: NumKey) => (d[k] === undefined ? null : numberError(k, String(d[k]), tx));
  const keys: NumKey[] = ["loyaltySpendTokens", "loyaltyRewardTokens"];
  const invalid = keys.some((k) => err(k));
  const spend = Number(d.loyaltySpendTokens);
  const reward = Number(d.loyaltyRewardTokens);
  // What the rule means for the two bookings a member can make
  const earns = (tokens: number) =>
    String(Math.round((tokens * Math.round(reward * 100)) / spend) / 100);
  return (
    <Section
      id="loyalty"
      dirty={s.dirty}
      icon={<GiftIcon className="size-5" />}
      title={tx({ fr: "Fidélité", en: "Loyalty", ar: "الوفاء" })}
      description={tx({
        fr: "Récompensez les joueurs qui réservent : chaque réservation payée en tokens leur rapporte une fraction de token. Dès qu'elles atteignent 1 token, il est ajouté à leur solde. Une réservation annulée et remboursée reprend sa récompense, y compris le token qu'elle avait déjà rapporté.",
        en: "Reward the players who book: every booking paid with tokens earns them a fraction of a token. As soon as the fractions reach 1 token, it is added to their balance. A cancelled, refunded booking takes its reward back, including the token it had already earned.",
        ar: "كافئ اللاعبين الذين يحجزون: كل حجز مدفوع بالرصيد يمنحهم جزءًا من رصيد. عند بلوغ 1 يُضاف إلى حسابهم. الحجز الملغى والمُسترد تُسحب مكافأته، بما فيها الرصيد الذي منحه.",
      })}
      footer={
        <SectionButtons
          dirty={s.dirty}
          busy={s.busy}
          invalid={invalid}
          onSave={() => s.save()}
          onReset={s.resetToDefault}
        />
      }
    >
      <ToggleRow
        testId="toggle-loyalty"
        label={tx({ fr: "Programme de fidélité", en: "Loyalty programme", ar: "برنامج الوفاء" })}
        hint={tx({
          fr: "Désactivé : plus aucune récompense n'est gagnée ; ce que les joueurs ont déjà gagné est conservé.",
          en: "Off: no more reward is earned; what players already earned is kept.",
          ar: "عند التعطيل: لا مكافآت جديدة؛ ما كسبه اللاعبون يبقى محفوظًا.",
        })}
        checked={!!d.loyaltyEnabled}
        onChange={(v) => s.set("loyaltyEnabled", v)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="set-loyalty-spend"
          label={tx({ fr: "Tokens dépensés", en: "Tokens spent", ar: "الرصيد المُنفق" })}
          hint={tx({
            fr: "Pour combien de tokens dépensés en réservation la récompense est donnée. Ex : 1.",
            en: "For how many tokens spent on a booking the reward is given. e.g. 1.",
            ar: "مقابل كم رصيد مُنفق في الحجز تُمنح المكافأة. مثال: 1.",
          })}
          suffix={tokenWord(2)}
          value={String(d.loyaltySpendTokens ?? "")}
          onChange={(v) => s.set("loyaltySpendTokens", v)}
          error={err("loyaltySpendTokens")}
        />
        <NumberField
          id="set-loyalty-reward"
          label={tx({ fr: "Récompense", en: "Reward", ar: "المكافأة" })}
          hint={tx({
            fr: "Tokens offerts à chaque fois. Ex : 0.1 (un token offert tous les 10 tokens dépensés).",
            en: "Tokens given each time. e.g. 0.1 (one free token every 10 tokens spent).",
            ar: "الرصيد الممنوح في كل مرة. مثال: 0.1 (رصيد مجاني لكل 10 مُنفقة).",
          })}
          suffix={tokenWord(2)}
          step="0.01"
          value={String(d.loyaltyRewardTokens ?? "")}
          onChange={(v) => s.set("loyaltyRewardTokens", v)}
          error={err("loyaltyRewardTokens")}
        />
      </div>
      {!invalid && spend > 0 && reward > 0 && (
        <p
          data-testid="loyalty-example"
          className="m-0 rounded-2xl bg-ball/50 px-4 py-3 text-sm font-semibold text-night"
        >
          {tx({
            fr: `Avec cette règle : une place (${tokensLabel(settings.tokenCostPlayer)}) rapporte ${earns(settings.tokenCostPlayer)} token, un terrain complet (${tokensLabel(settings.tokenCostFullCourt)}) rapporte ${earns(settings.tokenCostFullCourt)} token.`,
            en: `With this rule: one spot (${tokensLabel(settings.tokenCostPlayer)}) earns ${earns(settings.tokenCostPlayer)} token, a full court (${tokensLabel(settings.tokenCostFullCourt)}) earns ${earns(settings.tokenCostFullCourt)} token.`,
            ar: `بهذه القاعدة: المكان (${tokensLabel(settings.tokenCostPlayer)}) يمنح ${earns(settings.tokenCostPlayer)} رصيد، والملعب الكامل (${tokensLabel(settings.tokenCostFullCourt)}) يمنح ${earns(settings.tokenCostFullCourt)} رصيد.`,
          })}
        </p>
      )}
    </Section>
  );
}

function HoursSection({ settings }: { settings: AdminSettings }) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const saveHours = useSaveOpeningHours();
  const reset = useResetSettings();
  const [days, setDays] = useState<OpeningHoursDay[]>(settings.openingHours);
  const hoursBase = useRef(JSON.stringify(settings.openingHours));
  useEffect(() => {
    // Keep unsaved hour edits when another section saves
    setDays((current) =>
      JSON.stringify(current) === hoursBase.current ? settings.openingHours : current,
    );
    hoursBase.current = JSON.stringify(settings.openingHours);
  }, [settings.openingHours]);
  const dirty = JSON.stringify(days) !== JSON.stringify(settings.openingHours);
  const dayError = (d: OpeningHoursDay) =>
    !d.isClosed && d.openTime >= d.closeTime
      ? tx({
          fr: "La fermeture doit suivre l'ouverture",
          en: "Closing must be after opening",
          ar: "يجب أن يكون الإغلاق بعد الفتح",
        })
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
      dirty={dirty}
      icon={<ClockIcon className="size-5" />}
      title={tx({ fr: "Horaires d'ouverture", en: "Opening hours", ar: "ساعات العمل" })}
      description={tx({
        fr: "Horaires de chaque jour de la semaine, puis les exceptions : jours fériés, fermetures, horaires spéciaux ou maintenance d'un terrain.",
        en: "Hours for each weekday, then exceptions: holidays, closures, special hours or a court's maintenance day.",
        ar: "ساعات كل يوم من الأسبوع، ثم الاستثناءات: العطل، الإغلاقات، ساعات خاصة أو صيانة ملعب.",
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
              onError: (e) => toast({ title: apiErrorText(e, tx), variant: "destructive" }),
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
                    ar: "تمت استعادة الساعات الافتراضية (08:00–23:00)",
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
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-mist p-3 sm:grid-cols-[140px_150px_1fr]"
            >
              <span className="font-bold">{tx(DAY_NAMES[w])}</span>
              <label className="flex items-center gap-2 text-sm font-bold">
                <Switch
                  checked={!d.isClosed}
                  onCheckedChange={(v) => setDay(w, { isClosed: !v })}
                />
                {d.isClosed
                  ? tx({ fr: "Fermé", en: "Closed", ar: "مغلق" })
                  : tx({ fr: "Ouvert", en: "Open", ar: "مفتوح" })}
              </label>
              {!d.isClosed && (
                <span className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                  <Input
                    type="time"
                    className="min-w-0 flex-1 sm:w-[120px] sm:flex-none"
                    aria-label={tx({
                      fr: `Ouverture ${tx(DAY_NAMES[w])}`,
                      en: `Opens ${tx(DAY_NAMES[w])}`,
                      ar: `فتح ${tx(DAY_NAMES[w])}`,
                    })}
                    value={d.openTime}
                    onChange={(e) => setDay(w, { openTime: e.target.value })}
                  />
                  <span aria-hidden="true">–</span>
                  <Input
                    type="time"
                    className="min-w-0 flex-1 sm:w-[120px] sm:flex-none"
                    aria-label={tx({
                      fr: `Fermeture ${tx(DAY_NAMES[w])}`,
                      en: `Closes ${tx(DAY_NAMES[w])}`,
                      ar: `إغلاق ${tx(DAY_NAMES[w])}`,
                    })}
                    value={d.closeTime === "24:00" ? "00:00" : d.closeTime}
                    onChange={(e) =>
                      setDay(w, {
                        closeTime: e.target.value === "00:00" ? "24:00" : e.target.value,
                      })
                    }
                  />
                  {error && (
                    <span role="alert" className="w-full text-sm font-semibold text-destructive">
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
          ar: "ملاحظة: الإغلاق عند 00:00 = منتصف الليل.",
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
          ar: "الاستثناءات (عطل، إغلاقات، صيانة)",
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
                  {e.isClosed
                    ? tx({ fr: "Fermé", en: "Closed", ar: "مغلق" })
                    : `${e.openTime}–${e.closeTime}`}
                </Pill>
                <span className="text-sm text-muted-foreground">
                  {e.terrainId
                    ? (courtName.get(e.terrainId) ?? `#${e.terrainId}`)
                    : tx({ fr: "Tout le club", en: "Whole club", ar: "كل النادي" })}
                  {e.reason ? ` · ${e.reason}` : ""}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                aria-label={tx({
                  fr: "Supprimer l'exception",
                  en: "Delete exception",
                  ar: "حذف الاستثناء",
                })}
                onClick={() => remove.mutate(e.id, { onSuccess: refresh })}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          {tx({
            fr: "Aucune exception à venir.",
            en: "No upcoming exception.",
            ar: "لا استثناءات قادمة.",
          })}
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
                toast({
                  title: tx({
                    fr: "Exception ajoutée",
                    en: "Exception added",
                    ar: "تمت إضافة الاستثناء",
                  }),
                });
              },
              onError: (e) => toast({ title: apiErrorText(e, tx), variant: "destructive" }),
            },
          );
        }}
      >
        <Input
          type="date"
          aria-label={tx({ fr: "Date", en: "Date", ar: "التاريخ" })}
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <select
          aria-label={tx({ fr: "Terrain concerné", en: "Court", ar: "الملعب المعني" })}
          className="h-12 rounded-2xl border-2 border-[#E4E8F7] bg-card px-3 text-sm font-semibold"
          value={form.terrainId}
          onChange={(e) => setForm({ ...form, terrainId: e.target.value })}
        >
          <option value="">{tx({ fr: "Tout le club", en: "Whole club", ar: "كل النادي" })}</option>
          {(terrains ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Segmented
          label={tx({ fr: "Type d'exception", en: "Exception type", ar: "نوع الاستثناء" })}
          value={form.isClosed ? "closed" : "hours"}
          onChange={(v) => setForm({ ...form, isClosed: v === "closed" })}
          options={[
            { value: "closed", label: tx({ fr: "Fermé", en: "Closed", ar: "مغلق" }) },
            {
              value: "hours",
              label: tx({ fr: "Horaires spéciaux", en: "Special hours", ar: "ساعات خاصة" }),
            },
          ]}
        />
        {!form.isClosed && (
          <span className="flex items-center gap-2">
            <Input
              type="time"
              aria-label={tx({ fr: "Ouverture", en: "Opens", ar: "الفتح" })}
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            />
            <span aria-hidden="true">–</span>
            <Input
              type="time"
              aria-label={tx({ fr: "Fermeture", en: "Closes", ar: "الإغلاق" })}
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            />
          </span>
        )}
        <Input
          aria-label={tx({ fr: "Motif", en: "Reason", ar: "السبب" })}
          maxLength={120}
          placeholder={tx({
            fr: "Motif (ex : Aïd, tournoi, nouveau gazon)",
            en: "Reason (e.g. holiday, tournament)",
            ar: "السبب (مثال: العيد، بطولة، عشب جديد)",
          })}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={invalid || create.isPending}
          loading={create.isPending}
        >
          <PlusIcon />
          {tx({ fr: "Ajouter l'exception", en: "Add exception", ar: "إضافة الاستثناء" })}
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
    "shopEnabled",
    "onlinePaymentEnabled",
  ]);
  const d = s.draft;
  // The gateway is set up with the installation (its keys are the club's own account)
  const gateway = settings.paymentProvider
    ? (({ konnect: "Konnect", flouci: "Flouci" } as Record<string, string>)[
        settings.paymentProvider
      ] ?? settings.paymentProvider)
    : null;
  return (
    <Section
      id="features"
      dirty={s.dirty}
      icon={<ToggleRightIcon className="size-5" />}
      title={tx({ fr: "Fonctionnalités", en: "Features", ar: "الميزات" })}
      description={tx({
        fr: "Activez seulement ce que votre club utilise. Une fonction désactivée disparaît de l'app et est refusée par le serveur.",
        en: "Turn on only what your club uses. A disabled feature disappears from the app and is refused by the server.",
        ar: "فعّل فقط ما يستخدمه ناديك. الخاصية المعطّلة تختفي من التطبيق ويرفضها الخادم.",
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
        label={tx({ fr: "Open matches", en: "Open matches", ar: "مباريات مفتوحة" })}
        hint={tx({
          fr: "Les joueurs peuvent rejoindre la place libre d'un match publié par un autre membre.",
          en: "Players can join a free spot in a match published by another member.",
          ar: "يمكن للاعبين أخذ مكان شاغر في مباراة نشرها عضو آخر.",
        })}
        checked={!!d.openMatchesEnabled}
        onChange={(v) => s.set("openMatchesEnabled", v)}
      />
      <ToggleRow
        label={tx({ fr: "Invitations", en: "Invitations", ar: "الدعوات" })}
        hint={tx({
          fr: "Lien, QR code et invitation d'un membre dans l'app (accepter / refuser).",
          en: "Link, QR code and in-app member invitation (accept / decline).",
          ar: "رابط، رمز QR ودعوة عضو داخل التطبيق (قبول / رفض).",
        })}
        checked={!!d.invitationsEnabled}
        onChange={(v) => s.set("invitationsEnabled", v)}
      />
      <ToggleRow
        label={tx({
          fr: "Paiement au club (partiel)",
          en: "Pay at the club (partial payments)",
          ar: "الدفع في النادي (جزئي)",
        })}
        hint={tx({
          fr: "Un joueur peut réserver sa place et la payer en espèces à l'accueil. Désactivé : tokens uniquement.",
          en: "A player may hold a spot and pay cash at the desk. Off: tokens only.",
          ar: "يمكن للاعب حجز مكانه ودفعه نقدًا في الاستقبال. عند التعطيل: الرصيد فقط.",
        })}
        checked={!!d.cashPaymentEnabled}
        onChange={(v) => s.set("cashPaymentEnabled", v)}
      />
      <ToggleRow
        testId="toggle-shop"
        label={tx({ fr: "Boutique", en: "Shop", ar: "المتجر" })}
        hint={tx({
          fr: "Les membres commandent des articles sur le site ; vous les appelez pour confirmer, puis vous livrez ou remettez la commande au club.",
          en: "Members order articles on the site; you call them to confirm, then deliver the order or hand it over at the club.",
          ar: "يطلب الأعضاء المنتجات من الموقع؛ تتصل بهم للتأكيد ثم توصل الطلب أو تسلّمه في النادي.",
        })}
        checked={!!d.shopEnabled}
        onChange={(v) => s.set("shopEnabled", v)}
      />
      <ToggleRow
        testId="toggle-online-payment"
        label={tx({ fr: "Paiement en ligne", en: "Online payment", ar: "الدفع عبر الإنترنت" })}
        hint={
          gateway
            ? tx({
                fr: `Les membres achètent leurs tokens et paient leurs commandes par carte ou e-Dinar via ${gateway}. L'argent arrive sur le compte ${gateway} du club. Désactivé : paiement à l'accueil uniquement.`,
                en: `Members buy tokens and pay their orders by card or e-Dinar through ${gateway}. The money goes to the club's ${gateway} account. Off: payment at the desk only.`,
                ar: `يشتري الأعضاء الرصيد ويدفعون طلباتهم بالبطاقة أو e-Dinar عبر ${gateway}. يصل المال إلى حساب النادي. عند التعطيل: الدفع في الاستقبال فقط.`,
              })
            : tx({
                fr: "Aucune passerelle de paiement n'est configurée sur cette installation : ce réglage n'a pas d'effet. Contactez AmiVio pour brancher le compte Konnect ou Flouci du club.",
                en: "No payment gateway is set up on this installation: this switch has no effect. Contact AmiVio to connect the club's Konnect or Flouci account.",
                ar: "لا توجد بوابة دفع مهيأة: هذا الإعداد بلا أثر. تواصل مع AmiVio لربط حساب Konnect أو Flouci.",
              })
        }
        checked={!!d.onlinePaymentEnabled}
        onChange={(v) => s.set("onlinePaymentEnabled", v)}
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
      { fr: "Confirmation de réservation", en: "Booking confirmation", ar: "تأكيد الحجز" },
      {
        fr: "Après chaque réservation ou place prise.",
        en: "After each booking or joined spot.",
        ar: "بعد كل حجز أو مكان محجوز.",
      },
    ],
    [
      "cancellationNotificationsEnabled",
      { fr: "Annulation", en: "Cancellation", ar: "الإلغاء" },
      {
        fr: "À tous les joueurs du match, avec le remboursement.",
        en: "To every player of the match, with the refund.",
        ar: "لكل لاعبي المباراة، مع الاسترجاع.",
      },
    ],
    [
      "invitationNotificationsEnabled",
      { fr: "Invitation à un match", en: "Match invitation", ar: "دعوة إلى مباراة" },
      {
        fr: "Quand un membre est invité dans l'app.",
        en: "When a member is invited in the app.",
        ar: "عند دعوة عضو داخل التطبيق.",
      },
    ],
    [
      "tokenNotificationsEnabled",
      { fr: "Tokens crédités", en: "Tokens credited", ar: "إضافة رصيد" },
      {
        fr: "Quand l'accueil crédite des tokens.",
        en: "When the desk credits tokens.",
        ar: "عندما يضيف الاستقبال رصيدًا.",
      },
    ],
    [
      "matchFinishedNotificationsEnabled",
      { fr: "Après le match", en: "After the match", ar: "بعد المباراة" },
      {
        fr: "Remerciement et invitation à réserver le suivant.",
        en: "Thank-you and invitation to book the next one.",
        ar: "شكر ودعوة لحجز المباراة التالية.",
      },
    ],
    [
      "remindersEnabled",
      { fr: "Rappel avant le match", en: "Reminder before the match", ar: "تذكير قبل المباراة" },
      {
        fr: "Envoyé à chaque joueur avant le début.",
        en: "Sent to every player before the start.",
        ar: "يُرسل لكل لاعب قبل البداية.",
      },
    ],
  ];
  return (
    <Section
      id="notifications"
      dirty={s.dirty}
      icon={<BellIcon className="size-5" />}
      title={tx({ fr: "Notifications", en: "Notifications", ar: "الإشعارات" })}
      description={tx({
        fr: "Messages envoyés par le club (dans l'app, par e-mail et en push selon les préférences de chaque membre).",
        en: "Messages sent by the club (in-app, e-mail and push, per each member's preferences).",
        ar: "الرسائل التي يرسلها النادي (داخل التطبيق، بالبريد الإلكتروني والإشعارات حسب تفضيلات كل عضو).",
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
          label={tx({ fr: "Envoyer le rappel", en: "Send the reminder", ar: "إرسال التذكير" })}
          hint={tx({
            fr: "Minutes avant le match. Ex : 120 = 2 h avant.",
            en: "Minutes before the match. e.g. 120 = 2 h before.",
            ar: "دقائق قبل المباراة. مثال: 120 = ساعتان قبلها.",
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
