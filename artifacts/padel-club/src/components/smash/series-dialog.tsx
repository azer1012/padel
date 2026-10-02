import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTerrains,
  useListUsers,
  usePreviewSeries,
  useCreateSeries,
  extrasKeys,
  getListReservationsQueryKey,
  type SeriesPreview,
} from "@workspace/api-client-react";
import { CalendarBlankIcon, CheckIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field, Segmented } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clubDate, fromClubInput } from "@/lib/club-time";
import { memberName, plural } from "@/lib/labels";
import { apiErrorText } from "@/lib/api-errors";

const blank = {
  terrainId: "",
  userId: "",
  guestName: "",
  guestPhone: "",
  label: "",
  firstStart: "",
  occurrences: "10",
  intervalWeeks: "1",
};

export function SeriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const tx = useTx();
  const { lang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: terrains } = useListTerrains();
  const { data: users } = useListUsers({ limit: 200 });
  const preview = usePreviewSeries(),
    create = useCreateSeries();
  const [f, setF] = useState(blank);
  const [dates, setDates] = useState<SeriesPreview["dates"] | null>(null);
  const set = (k: keyof typeof blank, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setDates(null);
  };

  useEffect(() => {
    if (open) {
      setF(blank);
      setDates(null);
    }
  }, [open]);

  const payload = () => ({
    terrainId: Number(f.terrainId),
    firstStart: fromClubInput(f.firstStart),
    occurrences: Number(f.occurrences),
    intervalWeeks: Number(f.intervalWeeks),
    userId: f.userId ? Number(f.userId) : undefined,
    guestName: f.userId ? undefined : f.guestName,
    guestPhone: f.guestPhone || undefined,
    label: f.label || undefined,
  });
  const ready = !!f.terrainId && !!f.firstStart && (!!f.userId || !!f.guestName.trim());
  const err = (e: unknown) =>
    toast({
      title: tx({ fr: "Impossible", en: "Couldn't do that", ar: "تعذر ذلك" }),
      description: apiErrorText(e, tx),
      variant: "destructive",
    });

  const runPreview = (e: React.FormEvent) => {
    e.preventDefault();
    preview.mutate(payload(), { onSuccess: (r) => setDates(r.dates), onError: err });
  };
  const confirm = () =>
    create.mutate(
      { ...payload(), skipConflicts: true },
      {
        onSuccess: (r) => {
          toast({
            title: tx({
              fr: `${r.created.length} séances réservées`,
              en: `${r.created.length} sessions booked`,
              ar: `تم حجز ${r.created.length} حصة`,
            }),
            description: r.skipped.length
              ? tx({
                  fr: `${r.skipped.length} ${plural(r.skipped.length, "date déjà prise, ignorée", "dates déjà prises, ignorées")}.`,
                  en: `${r.skipped.length} ${plural(r.skipped.length, "date", "dates")} already taken, skipped.`,
                  ar: `تم تخطي ${r.skipped.length} موعد محجوز.`,
                })
              : undefined,
          });
          qc.invalidateQueries({ queryKey: extrasKeys.series });
          qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: ["/api/calendar"] });
          onOpenChange(false);
        },
        onError: err,
      },
    );
  const free = dates?.filter((d) => !d.conflict).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader className="text-start">
          <DialogTitle>
            {tx({ fr: "Réservation récurrente", en: "Recurring booking", ar: "حجز متكرر" })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              fr: "Cours, ligues, habitués : le même créneau chaque semaine. Payé à l'accueil à chaque séance.",
              en: "Lessons, leagues, regulars: the same slot every week. Paid at the desk each session.",
              ar: "دروس، دوريات، لاعبون دائمون: نفس الموعد كل أسبوع. الدفع في الاستقبال كل حصة.",
            })}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={runPreview}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx({ fr: "Terrain", en: "Court", ar: "الملعب" })} required>
              <Select value={f.terrainId} onValueChange={(v) => set("terrainId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder={tx({ fr: "Choisir", en: "Choose", ar: "اختر" })} />
                </SelectTrigger>
                <SelectContent>
                  {terrains
                    ?.filter((t) => t.isActive !== false)
                    .map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={tx({ fr: "Première séance", en: "First session", ar: "الحصة الأولى" })}
              htmlFor="se-start"
              required
            >
              <Input
                id="se-start"
                type="datetime-local"
                step={1800}
                value={f.firstStart}
                onChange={(e) => set("firstStart", e.target.value)}
              />
            </Field>
          </div>
          <Field label={tx({ fr: "Pour", en: "For", ar: "لـ" })}>
            <Select
              value={f.userId || "guest"}
              onValueChange={(v) => set("userId", v === "guest" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest">
                  {tx({
                    fr: "Groupe / personne sans compte",
                    en: "Group / no account",
                    ar: "مجموعة / بدون حساب",
                  })}
                </SelectItem>
                {users?.data?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {memberName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!f.userId && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="se-guest" required>
                <Input
                  id="se-guest"
                  value={f.guestName}
                  onChange={(e) => set("guestName", e.target.value)}
                  placeholder="École Les Berges"
                />
              </Field>
              <Field label={tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })} htmlFor="se-phone">
                <Input
                  id="se-phone"
                  type="tel"
                  dir="ltr"
                  value={f.guestPhone}
                  onChange={(e) => set("guestPhone", e.target.value)}
                  placeholder="+216 XX XXX XXX"
                />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field
              label={tx({ fr: "Nombre de séances", en: "Number of sessions", ar: "عدد الحصص" })}
              htmlFor="se-n"
            >
              <Input
                id="se-n"
                type="number"
                min={2}
                max={52}
                inputMode="numeric"
                value={f.occurrences}
                onChange={(e) => set("occurrences", e.target.value)}
              />
            </Field>
            <Field label={tx({ fr: "Fréquence", en: "Repeat", ar: "التكرار" })}>
              <Segmented
                label="interval"
                value={f.intervalWeeks}
                onChange={(v) => set("intervalWeeks", v)}
                options={[
                  { value: "1", label: tx({ fr: "Chaque semaine", en: "Weekly", ar: "أسبوعيًا" }) },
                  {
                    value: "2",
                    label: tx({ fr: "1 sem. sur 2", en: "Every 2 wks", ar: "كل أسبوعين" }),
                  },
                ]}
              />
            </Field>
          </div>
          <Field
            label={tx({ fr: "Libellé", en: "Label", ar: "التسمية" })}
            htmlFor="se-label"
            hint={tx({
              fr: "Visible dans le planning",
              en: "Shown on the schedule",
              ar: "يظهر في الجدول",
            })}
          >
            <Input
              id="se-label"
              value={f.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder={tx({
                fr: "Cours débutants",
                en: "Beginners class",
                ar: "درس المبتدئين",
              })}
            />
          </Field>

          {!dates ? (
            <Button
              type="submit"
              size="lg"
              variant="dark"
              disabled={!ready || preview.isPending}
              loading={preview.isPending}
            >
              <CalendarBlankIcon />
              {tx({ fr: "Voir les dates", en: "Preview dates", ar: "عرض المواعيد" })}
            </Button>
          ) : (
            <>
              <ul
                className="m-0 grid max-h-[220px] list-none grid-cols-2 gap-1.5 overflow-y-auto p-0 sm:grid-cols-3"
                aria-label={tx({ fr: "Dates", en: "Dates", ar: "المواعيد" })}
              >
                {dates.map((d) => (
                  <li
                    key={d.startTime}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold",
                      d.conflict
                        ? "bg-[#FDE4E4] text-[#A3262B] line-through decoration-2"
                        : "bg-[#DDF5E7] text-[#0F6B3C]",
                    )}
                    title={
                      d.conflict
                        ? tx({
                            fr: `Déjà pris : ${d.conflictWith}`,
                            en: `Taken: ${d.conflictWith}`,
                            ar: `محجوز: ${d.conflictWith}`,
                          })
                        : undefined
                    }
                  >
                    {d.conflict ? (
                      <WarningIcon className="size-3.5 shrink-0" />
                    ) : (
                      <CheckIcon className="size-3.5 shrink-0" />
                    )}
                    <span>{clubDate(d.startTime, lang, "short")}</span>
                  </li>
                ))}
              </ul>
              {dates.some((d) => d.conflict) && (
                <p className="m-0 text-sm text-muted-foreground">
                  {tx({
                    fr: "Les dates barrées sont déjà réservées et seront ignorées.",
                    en: "Crossed-out dates are already booked and will be skipped.",
                    ar: "المواعيد المشطوبة محجوزة وسيتم تخطيها.",
                  })}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDates(null)}
                >
                  {tx({ fr: "Modifier", en: "Edit", ar: "تعديل" })}
                </Button>
                <Button
                  type="button"
                  className="flex-[1.5]"
                  onClick={confirm}
                  disabled={!free || create.isPending}
                  loading={create.isPending}
                >
                  {tx({
                    fr: `Réserver ${free} ${plural(free, "séance", "séances")}`,
                    en: `Book ${free} ${plural(free, "session", "sessions")}`,
                    ar: `احجز ${free} حصة`,
                  })}
                </Button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
