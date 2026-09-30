import { useState } from "react";
import {
  useListTerrains,
  useCreateTerrain,
  useUpdateTerrain,
  useDeleteTerrain,
  getListTerrainsQueryKey,
} from "@workspace/api-client-react";
import type { Terrain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Clock, Users, Sun, Warehouse, LandPlot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CourtLines, EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm } from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import { CLUB } from "@/config/club";
import { cn } from "@/lib/utils";

type Form = {
  name: string;
  description: string;
  type: "indoor" | "outdoor";
  pricePerPerson: string;
  capacity: string;
  openingTime: string;
  closingTime: string;
};
const blank: Form = {
  name: "",
  description: "",
  type: "indoor",
  pricePerPerson: "25",
  capacity: "4",
  openingTime: "08:00",
  closingTime: "23:00",
};

export default function AdminTerrains() {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: terrains, isLoading } = useListTerrains();
  const createMutation = useCreateTerrain();
  const updateMutation = useUpdateTerrain();
  const deleteMutation = useDeleteTerrain();
  const [editing, setEditing] = useState<Terrain | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: getListTerrainsQueryKey() });
  const saving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setForm(blank);
    setEditing("new");
  };
  const openEdit = (t: Terrain) => {
    setForm({
      name: t.name,
      description: t.description ?? "",
      type: t.type as Form["type"],
      pricePerPerson: String(t.pricePerPerson),
      capacity: String(t.capacity),
      openingTime: t.openingTime ?? "08:00",
      closingTime: t.closingTime ?? "23:00",
    });
    setEditing(t);
  };

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: tx({
          fr: "Donnez un nom au terrain",
          en: "Give the court a name",
          ar: "أدخل اسم الملعب",
        }),
        variant: "destructive",
      });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description,
      type: form.type,
      pricePerPerson: parseFloat(form.pricePerPerson),
      capacity: parseInt(form.capacity),
      openingTime: form.openingTime,
      closingTime: form.closingTime,
    };
    const done = (msg: string) => () => {
      toast({ title: msg });
      setEditing(null);
      refresh();
    };
    const fail = (e: any) =>
      toast({
        title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
        description: e?.data?.error,
        variant: "destructive",
      });
    if (editing && editing !== "new")
      updateMutation.mutate(
        { id: editing.id, data: payload as any },
        {
          onSuccess: done(
            tx({ fr: "Terrain mis à jour", en: "Court updated", ar: "تم تحديث الملعب" }),
          ),
          onError: fail,
        },
      );
    else
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: done(tx({ fr: "Terrain ajouté", en: "Court added", ar: "تمت إضافة الملعب" })),
          onError: fail,
        },
      );
  }

  function handleToggle(t: Terrain) {
    updateMutation.mutate(
      { id: t.id, data: { isActive: !t.isActive } },
      {
        onSuccess: () => {
          refresh();
          toast({
            title: t.isActive
              ? tx({
                  fr: `${t.name} fermé à la réservation`,
                  en: `${t.name} closed to bookings`,
                  ar: `${t.name} مغلق للحجز`,
                })
              : tx({
                  fr: `${t.name} ouvert à la réservation`,
                  en: `${t.name} open for bookings`,
                  ar: `${t.name} مفتوح للحجز`,
                }),
          });
        },
      },
    );
  }

  async function handleDelete(t: Terrain) {
    const ok = await confirm({
      title: tx({ fr: `Supprimer ${t.name} ?`, en: `Delete ${t.name}?`, ar: `حذف ${t.name}؟` }),
      description: tx({
        fr: "Pour une fermeture temporaire, désactivez plutôt le terrain : l'historique est conservé.",
        en: "For a temporary closure, switch the court off instead: history is kept.",
        ar: "للإغلاق المؤقت، عطّل الملعب بدلًا من ذلك.",
      }),
      confirmLabel: tx({ fr: "Supprimer", en: "Delete", ar: "حذف" }),
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate(
      { id: t.id },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Terrain supprimé", en: "Court deleted", ar: "تم حذف الملعب" }),
          });
          refresh();
        },
        onError: (e: any) =>
          toast({
            title: tx({ fr: "Suppression impossible", en: "Couldn't delete", ar: "تعذر الحذف" }),
            description: e?.data?.error,
            variant: "destructive",
          }),
      },
    );
  }

  const active = (terrains ?? []).filter((t) => t.isActive).length;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
        subtitle={
          terrains
            ? tx({
                fr: `${active} terrain(s) ouverts sur ${terrains.length}. Prix, horaires et disponibilité.`,
                en: `${active} of ${terrains.length} courts open. Prices, hours and availability.`,
                ar: `${active} من ${terrains.length} ملاعب مفتوحة.`,
              })
            : undefined
        }
        actions={
          <Button data-testid="btn-create-terrain" onClick={openCreate}>
            <Plus />
            {tx({ fr: "Ajouter un terrain", en: "Add a court", ar: "إضافة ملعب" })}
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[300px] !rounded-[30px]" />
          ))}
        </div>
      ) : !terrains?.length ? (
        <EmptyState
          icon={<LandPlot className="size-7" />}
          title={tx({ fr: "Aucun terrain", en: "No courts yet", ar: "لا ملاعب بعد" })}
          text={tx({
            fr: "Ajoutez votre premier terrain pour ouvrir les réservations.",
            en: "Add your first court to open bookings.",
            ar: "أضف ملعبك الأول لفتح الحجوزات.",
          })}
          action={
            <Button onClick={openCreate}>
              <Plus />
              {tx({ fr: "Ajouter un terrain", en: "Add a court", ar: "إضافة ملعب" })}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {terrains.map((t) => (
            <article
              key={t.id}
              data-testid={`card-terrain-${t.id}`}
              className={cn(
                "lift enter flex flex-col gap-5 rounded-[30px] bg-card p-5 shadow-sm",
                !t.isActive && "opacity-70",
              )}
            >
              <div
                className="relative h-[130px] overflow-hidden rounded-[18px] border-[3px] border-white shadow-[0_0_0_1px_#E4E8F7]"
                style={{
                  background: t.isActive
                    ? t.type === "outdoor"
                      ? "#2B8A5E"
                      : "var(--color-court)"
                    : "var(--color-night-3)",
                }}
              >
                <CourtLines />
                <span className="absolute start-3 top-3">
                  <Pill tone={t.isActive ? "lime" : "muted"}>
                    {t.isActive
                      ? tx({ fr: "Ouvert", en: "Open", ar: "مفتوح" })
                      : tx({ fr: "Fermé", en: "Closed", ar: "مغلق" })}
                  </Pill>
                </span>
                <span className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-full bg-night/70 px-3 py-1 text-xs font-bold text-white">
                  {t.type === "outdoor" ? (
                    <Sun className="size-3.5" />
                  ) : (
                    <Warehouse className="size-3.5" />
                  )}
                  {t.type === "outdoor" ? "Outdoor" : "Indoor"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="disp m-0 text-[26px] leading-tight">{t.name}</h2>
                {t.description && (
                  <p className="m-0 text-sm text-muted-foreground">{t.description}</p>
                )}
              </div>
              <dl className="m-0 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-2xl bg-mist p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {tx({ fr: "Horaires", en: "Hours", ar: "الساعات" })}
                  </dt>
                  <dd className="m-0 mt-1 font-bold" dir="ltr">
                    {t.openingTime}–{t.closingTime}
                  </dd>
                </div>
                <div className="rounded-2xl bg-mist p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {tx({ fr: "Joueurs", en: "Players", ar: "لاعبون" })}
                  </dt>
                  <dd className="m-0 mt-1 font-bold">{t.capacity}</dd>
                </div>
                <div className="rounded-2xl bg-mist p-3">
                  <dt className="text-xs text-muted-foreground">
                    {tx({ fr: "Prix / joueur", en: "Per player", ar: "للاعب" })}
                  </dt>
                  <dd className="m-0 mt-1 font-bold">
                    {t.pricePerPerson} {CLUB.currency}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#E4E8F7] pt-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                  <Switch
                    checked={t.isActive}
                    onCheckedChange={() => handleToggle(t)}
                    data-testid={`switch-terrain-${t.id}`}
                  />
                  {tx({ fr: "Réservable", en: "Bookable", ar: "قابل للحجز" })}
                </label>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-testid={`btn-edit-terrain-${t.id}`}
                    onClick={() => openEdit(t)}
                    aria-label={tx({
                      fr: `Modifier ${t.name}`,
                      en: `Edit ${t.name}`,
                      ar: `تعديل ${t.name}`,
                    })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    data-testid={`btn-delete-terrain-${t.id}`}
                    onClick={() => handleDelete(t)}
                    aria-label={tx({
                      fr: `Supprimer ${t.name}`,
                      en: `Delete ${t.name}`,
                      ar: `حذف ${t.name}`,
                    })}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({ fr: "Nouveau terrain", en: "New court", ar: "ملعب جديد" })
                : tx({ fr: "Modifier le terrain", en: "Edit court", ar: "تعديل الملعب" })}
            </DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="t-name" required>
              <Input
                id="t-name"
                data-testid="input-terrain-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Court Central"
              />
            </Field>
            <Field
              label={tx({ fr: "Description", en: "Description", ar: "الوصف" })}
              htmlFor="t-desc"
            >
              <Textarea
                id="t-desc"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder={tx({
                  fr: "Ex : panoramique, vue sur le lac",
                  en: "e.g. panoramic, lake view",
                  ar: "مثال: بانورامي",
                })}
              />
            </Field>
            <Field label="Type">
              <Segmented
                label="Type"
                value={form.type}
                onChange={(v) => set("type", v as Form["type"])}
                options={[
                  { value: "indoor", label: "Indoor" },
                  { value: "outdoor", label: "Outdoor" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={tx({ fr: "Ouverture", en: "Opens", ar: "يفتح" })} htmlFor="t-open">
                <Input
                  id="t-open"
                  type="time"
                  value={form.openingTime}
                  onChange={(e) => set("openingTime", e.target.value)}
                />
              </Field>
              <Field label={tx({ fr: "Fermeture", en: "Closes", ar: "يغلق" })} htmlFor="t-close">
                <Input
                  id="t-close"
                  type="time"
                  value={form.closingTime}
                  onChange={(e) => set("closingTime", e.target.value)}
                />
              </Field>
              <Field
                label={tx({
                  fr: `Prix par joueur (${CLUB.currency})`,
                  en: `Price per player (${CLUB.currency})`,
                  ar: `السعر للاعب (${CLUB.currency})`,
                })}
                htmlFor="t-price"
              >
                <Input
                  id="t-price"
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={form.pricePerPerson}
                  onChange={(e) => set("pricePerPerson", e.target.value)}
                />
              </Field>
              <Field label={tx({ fr: "Joueurs", en: "Players", ar: "اللاعبون" })} htmlFor="t-cap">
                <Input
                  id="t-cap"
                  type="number"
                  min={2}
                  max={4}
                  inputMode="numeric"
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                />
              </Field>
            </div>
            <Button data-testid="btn-save-terrain" type="submit" size="lg" disabled={saving}>
              {saving
                ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" })
                : tx({ fr: "Enregistrer", en: "Save court", ar: "حفظ" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
