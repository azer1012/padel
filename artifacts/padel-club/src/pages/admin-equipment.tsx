import { useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminEquipment,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  useRentals,
  useUpdateRental,
  extrasKeys,
  type EquipmentItem,
  type Rental,
  type RentalStatus,
} from "@workspace/api-client-react";
import {
  ArrowUUpLeftIcon,
  CheckIcon,
  ClipboardTextIcon,
  HandHeartIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm, type Tone } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx, useDateLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clubTime } from "@/lib/club-time";
import { useClubRules } from "@/hooks/use-club-rules";

type Form = {
  name: string;
  description: string;
  category: string;
  price: string;
  stock: string;
  isActive: boolean;
};
const blank: Form = {
  name: "",
  description: "",
  category: "racket",
  price: "10",
  stock: "4",
  isActive: true,
};

export default function AdminEquipment() {
  const rules = useClubRules();
  const tx = useTx();
  const locale = useDateLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: items, isLoading } = useAdminEquipment();
  const { data: rentals, isLoading: loadingRentals } = useRentals(day);
  const create = useCreateEquipment(),
    update = useUpdateEquipment(),
    del = useDeleteEquipment(),
    setRental = useUpdateRental();
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: extrasKeys.adminEquipment });
    qc.invalidateQueries({ queryKey: ["/api/equipment"] });
  };

  const categories: { value: string; label: string }[] = [
    { value: "racket", label: tx({ fr: "Raquette", en: "Racket", ar: "مضرب" }) },
    { value: "balls", label: tx({ fr: "Balles", en: "Balls", ar: "كرات" }) },
    { value: "other", label: tx({ fr: "Autre", en: "Other", ar: "أخرى" }) },
  ];
  const statusMeta: Record<RentalStatus, { tone: Tone; label: string }> = {
    reserved: { tone: "warning", label: tx({ fr: "À préparer", en: "To prepare", ar: "للتحضير" }) },
    handed_out: { tone: "info", label: tx({ fr: "Remis", en: "Handed out", ar: "تم التسليم" }) },
    returned: { tone: "success", label: tx({ fr: "Rendu", en: "Returned", ar: "تمت الإعادة" }) },
    cancelled: { tone: "muted", label: tx({ fr: "Annulé", en: "Cancelled", ar: "ملغى" }) },
  };

  const openNew = () => {
    setForm(blank);
    setEditing("new");
  };
  const openEdit = (i: EquipmentItem) => {
    setForm({
      name: i.name,
      description: i.description ?? "",
      category: i.category,
      price: String(i.price),
      stock: String(i.stock),
      isActive: i.isActive,
    });
    setEditing(i);
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name.trim(),
      description: form.description || null,
      category: form.category,
      price: Number(form.price) || 0,
      stock: Math.max(0, parseInt(form.stock) || 0),
      isActive: form.isActive,
    };
    const done = (m: string) => () => {
      toast({ title: m });
      setEditing(null);
      refresh();
    };
    const fail = (err: any) =>
      toast({
        title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
        description: err?.data?.error,
        variant: "destructive",
      });
    if (editing && editing !== "new")
      update.mutate(
        { id: editing.id, data },
        {
          onSuccess: done(tx({ fr: "Article mis à jour", en: "Item updated", ar: "تم التحديث" })),
          onError: fail,
        },
      );
    else
      create.mutate(data, {
        onSuccess: done(tx({ fr: "Article ajouté", en: "Item added", ar: "تمت الإضافة" })),
        onError: fail,
      });
  }

  async function remove(i: EquipmentItem) {
    if (
      !(await confirm({
        title: tx({ fr: `Retirer ${i.name} ?`, en: `Remove ${i.name}?`, ar: `إزالة ${i.name}؟` }),
        description: tx({
          fr: "S'il a déjà été loué, il est archivé pour garder l'historique.",
          en: "If it was ever rented, it's archived to keep history.",
          ar: "إذا تم استئجاره سابقًا، تتم أرشفته.",
        }),
        confirmLabel: tx({ fr: "Retirer", en: "Remove", ar: "إزالة" }),
        destructive: true,
      }))
    )
      return;
    del.mutate(i.id, {
      onSuccess: (r: any) => {
        toast({
          title: r?.archived
            ? tx({ fr: "Article archivé", en: "Item archived", ar: "تمت الأرشفة" })
            : tx({ fr: "Article supprimé", en: "Item deleted", ar: "تم الحذف" }),
        });
        refresh();
      },
    });
  }

  const move = (r: Rental, status: RentalStatus) =>
    setRental.mutate(
      { id: r.id, status },
      { onSuccess: () => qc.invalidateQueries({ queryKey: extrasKeys.rentals(day) }) },
    );

  // Group the day's rentals by match so staff prepare one bag per court/time
  const groups = useMemo(() => {
    const m = new Map<number, Rental[]>();
    for (const r of rentals ?? []) m.set(r.reservation.id, [...(m.get(r.reservation.id) ?? []), r]);
    return [...m.values()];
  }, [rentals]);
  const toPrepare = (rentals ?? [])
    .filter((r) => r.status === "reserved")
    .reduce((s, r) => s + r.quantity, 0);
  const days = [0, 1, 2].map((n) => format(addDays(new Date(), n), "yyyy-MM-dd"));

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Matériel", en: "Equipment", ar: "المعدات" })}
        subtitle={tx({
          fr: "Ce qu'il faut préparer à l'accueil, et votre stock de location.",
          en: "What to prepare at the front desk, and your rental stock.",
          ar: "ما يجب تحضيره في الاستقبال ومخزون الإيجار.",
        })}
        actions={
          <Button onClick={openNew} data-testid="btn-create-equipment">
            <PlusIcon />
            {tx({ fr: "Ajouter un article", en: "Add item", ar: "إضافة عنصر" })}
          </Button>
        }
      />

      {/* Prep list */}
      <section className="enter flex flex-col gap-4 rounded-[28px] bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="disp m-0 flex items-center gap-2 text-2xl">
            <ClipboardTextIcon className="size-6 text-court" />
            {tx({ fr: "À préparer", en: "Prep list", ar: "قائمة التحضير" })}
            {toPrepare > 0 && <Pill tone="warning">{toPrepare}</Pill>}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={tx({ fr: "Jour", en: "Day", ar: "اليوم" })}
              value={days.includes(day) ? day : ""}
              onChange={setDay}
              options={days.map((d, i) => ({
                value: d,
                label:
                  i === 0
                    ? tx({ fr: "Aujourd'hui", en: "Today", ar: "اليوم" })
                    : i === 1
                      ? tx({ fr: "Demain", en: "Tomorrow", ar: "غدًا" })
                      : format(new Date(d + "T12:00"), "EEE d", { locale }),
              }))}
            />
            <Input
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="w-[170px]"
              aria-label="Date"
            />
          </div>
        </div>
        {loadingRentals ? (
          <Skeleton className="h-24" />
        ) : groups.length === 0 ? (
          <p className="m-0 rounded-2xl bg-mist px-4 py-6 text-center text-muted-foreground">
            {tx({
              fr: "Aucune location ce jour-là.",
              en: "No rentals that day.",
              ar: "لا إيجارات في هذا اليوم.",
            })}
          </p>
        ) : (
          <ul className="stagger m-0 flex list-none flex-col gap-3 p-0">
            {groups.map((g) => {
              const res = g[0].reservation;
              return (
                <li
                  key={res.id}
                  className="flex flex-col gap-3 rounded-[22px] border border-[#E4E8F7] p-4 sm:flex-row sm:items-start"
                >
                  <span className="flex w-full shrink-0 items-center gap-3 sm:w-[180px] sm:flex-col sm:items-start sm:gap-1">
                    <span className="disp text-3xl leading-none" dir="ltr">
                      {clubTime(res.startTime)}
                    </span>
                    <span className="text-sm font-bold">{res.terrainName}</span>
                    <span className="text-xs text-muted-foreground">
                      {g[0].player ?? res.guestName ?? tx({ fr: "Invité", en: "Guest", ar: "ضيف" })}
                    </span>
                  </span>
                  <ul className="m-0 flex flex-1 list-none flex-col gap-2 p-0">
                    {g.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 rounded-2xl bg-mist/70 px-3 py-2"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2 font-bold">
                          <PackageIcon className="size-4 text-court" />
                          {r.quantity} × {r.item.name}
                          {r.player && g.length > 1 && (
                            <span className="truncate text-xs font-semibold text-muted-foreground">
                              · {r.player}
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {r.quantity * r.unitPrice} {rules.currency}
                        </span>
                        <Pill tone={statusMeta[r.status].tone}>{statusMeta[r.status].label}</Pill>
                        {r.status === "reserved" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => move(r, "handed_out")}
                            disabled={setRental.isPending}
                          >
                            <HandHeartIcon />
                            {tx({ fr: "Remis", en: "Handed out", ar: "سُلّم" })}
                          </Button>
                        )}
                        {r.status === "handed_out" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => move(r, "returned")}
                            disabled={setRental.isPending}
                          >
                            <CheckIcon />
                            {tx({ fr: "Rendu", en: "Returned", ar: "أُعيد" })}
                          </Button>
                        )}
                        {r.status === "returned" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => move(r, "handed_out")}
                            aria-label={tx({
                              fr: "Annuler le retour",
                              en: "Undo return",
                              ar: "تراجع",
                            })}
                          >
                            <ArrowUUpLeftIcon />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Catalogue */}
      <h2 className="disp m-0 text-2xl">
        {tx({ fr: "Catalogue", en: "Catalogue", ar: "الكتالوج" })}
      </h2>
      {isLoading ? (
        <Skeleton className="h-[140px] !rounded-[26px]" />
      ) : !items?.length ? (
        <EmptyState
          icon={<PackageIcon className="size-7" />}
          title={tx({
            fr: "Aucun article à louer",
            en: "Nothing to rent yet",
            ar: "لا شيء للإيجار",
          })}
          text={tx({
            fr: "Ajoutez vos raquettes et tubes de balles : les joueurs pourront les réserver avec leur terrain.",
            en: "Add your rackets and ball tubes: players can reserve them with their court.",
            ar: "أضف المضارب وعلب الكرات ليحجزها اللاعبون مع الملعب.",
          })}
          action={
            <Button onClick={openNew}>
              <PlusIcon />
              {tx({ fr: "Ajouter un article", en: "Add item", ar: "إضافة عنصر" })}
            </Button>
          }
        />
      ) : (
        <ul className="stagger m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <li
              key={i.id}
              className={cn(
                "lift enter flex items-center gap-4 rounded-[24px] bg-card p-4 shadow-sm",
                !i.isActive && "opacity-55",
              )}
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ball text-night">
                <PackageIcon className="size-6" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[17px] font-extrabold">{i.name}</span>
                <span className="text-sm text-muted-foreground">
                  {i.price} {rules.currency} ·{" "}
                  {tx({ fr: `stock ${i.stock}`, en: `stock ${i.stock}`, ar: `المخزون ${i.stock}` })}
                  {!i.isActive && ` · ${tx({ fr: "archivé", en: "archived", ar: "مؤرشف" })}`}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => openEdit(i)}
                aria-label={tx({
                  fr: `Modifier ${i.name}`,
                  en: `Edit ${i.name}`,
                  ar: `تعديل ${i.name}`,
                })}
              >
                <PencilSimpleIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                onClick={() => remove(i)}
                aria-label={tx({
                  fr: `Retirer ${i.name}`,
                  en: `Remove ${i.name}`,
                  ar: `إزالة ${i.name}`,
                })}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({ fr: "Nouvel article", en: "New item", ar: "عنصر جديد" })
                : tx({ fr: "Modifier l'article", en: "Edit item", ar: "تعديل العنصر" })}
            </DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={save}>
            <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="eq-name" required>
              <Input
                id="eq-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Raquette carbone"
                required
              />
            </Field>
            <Field label={tx({ fr: "Catégorie", en: "Category", ar: "الفئة" })}>
              <Segmented
                label="category"
                value={form.category}
                onChange={(v) => set("category", v)}
                options={categories}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={tx({
                  fr: `Prix (${rules.currency})`,
                  en: `Price (${rules.currency})`,
                  ar: `السعر (${rules.currency})`,
                })}
                htmlFor="eq-price"
              >
                <Input
                  id="eq-price"
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </Field>
              <Field
                label={tx({ fr: "Quantité en stock", en: "Units in stock", ar: "الكمية" })}
                htmlFor="eq-stock"
                hint={tx({
                  fr: `Par créneau de ${rules.bookingDurationMinutes} min`,
                  en: `Per ${rules.bookingDurationMinutes}-min slot`,
                  ar: `لكل موعد ${rules.bookingDurationMinutes} دقيقة`,
                })}
              >
                <Input
                  id="eq-stock"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.stock}
                  onChange={(e) => set("stock", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label={tx({ fr: "Description", en: "Description", ar: "الوصف" })}
              htmlFor="eq-desc"
            >
              <Textarea
                id="eq-desc"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[20px] bg-secondary p-4 font-bold">
              {tx({ fr: "Proposé aux joueurs", en: "Offered to players", ar: "معروض للاعبين" })}
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </label>
            <Button
              type="submit"
              size="lg"
              disabled={create.isPending || update.isPending}
              loading={create.isPending || update.isPending}
            >
              {tx({ fr: "Enregistrer", en: "Save", ar: "حفظ" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
