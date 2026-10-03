import { useState } from "react";
import {
  useListTerrains,
  useCreateTerrain,
  useUpdateTerrain,
  useDeleteTerrain,
  useArchiveTerrain,
  useReorderTerrains,
  useArchivedTerrains,
  getListTerrainsQueryKey,
  apiErrorCode,
} from "@workspace/api-client-react";
import type { Terrain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoxArrowUpIcon,
  ClockIcon,
  CourtIcon,
  PencilSimpleIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
  UsersIcon,
  WarehouseIcon,
  WrenchIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CourtLines, EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm } from "@/components/smash/admin";
import { PhotoInput } from "@/components/smash/photo-input";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";
import { apiErrorText } from "@/lib/api-errors";
import { mediaSrc } from "@/services/api";
import { plural } from "@/lib/labels";

type Form = {
  name: string;
  number: string;
  description: string;
  type: "indoor" | "outdoor";
  photo: string;
  isMaintenance: boolean;
  maintenanceNote: string;
  /** Empty = use the club price (Réglages → Tarifs) */
  pricePerPerson: string;
  /** Off = use the club opening hours (Réglages → Horaires) */
  customHours: boolean;
  openingTime: string;
  closingTime: string;
};
const blank: Form = {
  name: "",
  number: "",
  description: "",
  type: "indoor",
  photo: "",
  isMaintenance: false,
  maintenanceNote: "",
  pricePerPerson: "",
  customHours: false,
  openingTime: "08:00",
  closingTime: "23:00",
};

export default function AdminTerrains() {
  const rules = useClubRules();
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: terrains, isLoading } = useListTerrains();
  const [showArchived, setShowArchived] = useState(false);
  const { data: archived } = useArchivedTerrains<Terrain>({ enabled: showArchived });
  const createMutation = useCreateTerrain();
  const updateMutation = useUpdateTerrain();
  const deleteMutation = useDeleteTerrain();
  const archiveMutation = useArchiveTerrain();
  const reorderMutation = useReorderTerrains();
  const [editing, setEditing] = useState<Terrain | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListTerrainsQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/terrains", "archived"] });
  };
  const saving = createMutation.isPending || updateMutation.isPending;
  /** A photo is on its way to the storage: saving waits for its address. */
  const [photoBusy, setPhotoBusy] = useState(false);
  const fail = (title: string) => (e: unknown) =>
    toast({ title, description: apiErrorText(e, tx), variant: "destructive" });

  const openCreate = () => {
    setForm({ ...blank, number: String((terrains?.length ?? 0) + 1) });
    setEditing("new");
  };
  const openEdit = (t: Terrain) => {
    setForm({
      name: t.name,
      number: t.number != null ? String(t.number) : "",
      description: t.description ?? "",
      type: t.type as Form["type"],
      photo: t.photos?.[0] ?? "",
      isMaintenance: !!t.isMaintenance,
      maintenanceNote: t.maintenanceNote ?? "",
      pricePerPerson: t.pricePerPerson != null ? String(t.pricePerPerson) : "",
      customHours: !!(t.openingTime && t.closingTime),
      openingTime: t.openingTime ?? "08:00",
      closingTime: t.closingTime ?? "23:00",
    });
    setEditing(t);
  };

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const problem = !form.name.trim()
      ? tx({ fr: "Donnez un nom au terrain", en: "Give the court a name", ar: "أدخل اسم الملعب" })
      : form.number && !/^\d{1,3}$/.test(form.number)
        ? tx({ fr: "Numéro entre 1 et 999", en: "Number between 1 and 999", ar: "رقم بين 1 و 999" })
        : form.pricePerPerson && !(Number(form.pricePerPerson) >= 0)
          ? tx({ fr: "Prix invalide", en: "Invalid price", ar: "سعر غير صالح" })
          : form.customHours && form.openingTime >= form.closingTime
            ? tx({
                fr: "La fermeture doit être après l'ouverture",
                en: "Closing must be after opening",
                ar: "يجب أن يكون الإغلاق بعد الفتح",
              })
            : form.photo && !/^(https:\/\/|\/)/.test(form.photo)
              ? tx({
                  fr: "La photo doit être une adresse https://",
                  en: "The photo must be an https:// address",
                  ar: "يجب أن يكون رابط الصورة https://",
                })
              : null;
    if (problem) {
      toast({ title: problem, variant: "destructive" });
      return;
    }
    const current = editing && editing !== "new" ? editing : null;
    const payload = {
      name: form.name.trim(),
      number: form.number ? Number(form.number) : null,
      description: form.description,
      type: form.type,
      isMaintenance: form.isMaintenance,
      maintenanceNote: form.isMaintenance ? form.maintenanceNote : null,
      pricePerPerson: form.pricePerPerson === "" ? null : Number(form.pricePerPerson),
      openingTime: form.customHours ? form.openingTime : null,
      closingTime: form.customHours ? form.closingTime : null,
      photos: form.photo
        ? [form.photo, ...(current?.photos ?? []).filter((p) => p !== form.photo)]
        : (current?.photos ?? []).slice(1),
    };
    const done = (msg: string) => (r: unknown) => {
      const upcoming = (r as { upcomingBookings?: number })?.upcomingBookings ?? 0;
      toast({
        title: msg,
        description:
          form.isMaintenance && upcoming
            ? tx({
                fr: `${upcoming} ${plural(upcoming, "réservation", "réservations")} à venir sur ce terrain : prévenez les joueurs ou annulez-les.`,
                en: `${upcoming} upcoming ${plural(upcoming, "booking", "bookings")} on this court: tell the players or cancel them.`,
                ar: `${upcoming} حجز قادم على هذا الملعب.`,
              })
            : undefined,
      });
      setEditing(null);
      refresh();
    };
    const onError = fail(
      tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
    );
    if (current)
      updateMutation.mutate(
        { id: current.id, data: payload },
        {
          onSuccess: done(
            tx({ fr: "Terrain mis à jour", en: "Court updated", ar: "تم تحديث الملعب" }),
          ),
          onError,
        },
      );
    else
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: done(tx({ fr: "Terrain ajouté", en: "Court added", ar: "تمت إضافة الملعب" })),
          onError,
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

  function move(t: Terrain, dir: -1 | 1) {
    const ids = (terrains ?? []).map((x) => x.id);
    const i = ids.indexOf(t.id),
      j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderMutation.mutate(ids, { onSuccess: refresh });
  }

  async function handleArchive(t: Terrain, archive: boolean) {
    if (archive) {
      const ok = await confirm({
        title: tx({ fr: `Archiver ${t.name} ?`, en: `Archive ${t.name}?`, ar: `أرشفة ${t.name}؟` }),
        description: tx({
          fr: "Le terrain disparaît du site et des plannings. Son historique est conservé et vous pourrez le restaurer.",
          en: "The court disappears from the site and schedules. Its history is kept and you can restore it.",
          ar: "يختفي الملعب من الموقع مع الاحتفاظ بسجله، ويمكنك استعادته.",
        }),
        confirmLabel: tx({ fr: "Archiver", en: "Archive", ar: "أرشفة" }),
      });
      if (!ok) return;
    }
    archiveMutation.mutate(
      { id: t.id, archived: archive },
      {
        onSuccess: () => {
          toast({
            title: archive
              ? tx({ fr: "Terrain archivé", en: "Court archived", ar: "تمت الأرشفة" })
              : tx({
                  fr: "Terrain restauré (fermé à la réservation)",
                  en: "Court restored (closed to bookings)",
                  ar: "تمت الاستعادة",
                }),
          });
          refresh();
        },
        onError: fail(
          tx({ fr: "Archivage impossible", en: "Couldn't archive", ar: "تعذرت الأرشفة" }),
        ),
      },
    );
  }

  async function handleDelete(t: Terrain) {
    const ok = await confirm({
      title: tx({ fr: `Supprimer ${t.name} ?`, en: `Delete ${t.name}?`, ar: `حذف ${t.name}؟` }),
      description: tx({
        fr: "Possible seulement pour un terrain jamais réservé. Sinon, archivez-le : l'historique est conservé.",
        en: "Only possible for a court that was never booked. Otherwise archive it: history is kept.",
        ar: "ممكن فقط لملعب لم يُحجز أبدًا. وإلا قم بأرشفته.",
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
        onError: (e) =>
          apiErrorCode(e) === "COURT_HAS_HISTORY"
            ? handleArchive(t, true)
            : fail(tx({ fr: "Suppression impossible", en: "Couldn't delete", ar: "تعذر الحذف" }))(
                e,
              ),
      },
    );
  }

  const active = (terrains ?? []).filter((t) => t.isActive && !t.isMaintenance).length;
  const clubHours = rules.hoursLabel || "—";

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
        subtitle={
          terrains
            ? tx({
                fr: `${active} ${plural(active, "terrain réservable", "terrains réservables")} sur ${terrains.length}. Prix et horaires par défaut : Réglages.`,
                en: `${active} of ${terrains.length} courts bookable. Default prices and hours: Settings.`,
                ar: `${active} من ${terrains.length} ملاعب قابلة للحجز.`,
              })
            : undefined
        }
        actions={
          <Button data-testid="btn-create-terrain" onClick={openCreate}>
            <PlusIcon />
            {tx({ fr: "Ajouter un terrain", en: "Add a court", ar: "إضافة ملعب" })}
          </Button>
        }
      />

      {isLoading ? (
        <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[300px] !rounded-[30px]" />
          ))}
        </div>
      ) : !terrains?.length ? (
        <EmptyState
          icon={<CourtIcon className="size-7" />}
          title={tx({ fr: "Aucun terrain", en: "No courts yet", ar: "لا ملاعب بعد" })}
          text={tx({
            fr: "Ajoutez votre premier terrain pour ouvrir les réservations.",
            en: "Add your first court to open bookings.",
            ar: "أضف ملعبك الأول لفتح الحجوزات.",
          })}
          action={
            <Button onClick={openCreate}>
              <PlusIcon />
              {tx({ fr: "Ajouter un terrain", en: "Add a court", ar: "إضافة ملعب" })}
            </Button>
          }
        />
      ) : (
        <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {terrains.map((t, index) => (
            <article
              key={t.id}
              data-testid={`card-terrain-${t.id}`}
              className={cn(
                "lift enter flex flex-col gap-5 rounded-[30px] bg-card p-5 shadow-sm",
                (!t.isActive || t.isMaintenance) && "opacity-75",
              )}
            >
              <div
                className="relative h-[130px] overflow-hidden rounded-[18px] border-[3px] border-white bg-cover bg-center shadow-[0_0_0_1px_#E4E8F7]"
                style={{
                  backgroundColor: t.isActive
                    ? t.type === "outdoor"
                      ? "#2B8A5E"
                      : "var(--color-court)"
                    : "var(--color-night-3)",
                  backgroundImage: t.photos?.[0] ? `url("${mediaSrc(t.photos[0])}")` : undefined,
                }}
              >
                {!t.photos?.[0] && <CourtLines />}
                <span className="absolute start-3 top-3 flex gap-1.5">
                  {t.isMaintenance ? (
                    <Pill tone="warning">
                      <WrenchIcon className="size-3" />
                      {tx({ fr: "Maintenance", en: "Maintenance", ar: "صيانة" })}
                    </Pill>
                  ) : (
                    <Pill tone={t.isActive ? "lime" : "muted"}>
                      {t.isActive
                        ? tx({ fr: "Ouvert", en: "Open", ar: "مفتوح" })
                        : tx({ fr: "Fermé", en: "Closed", ar: "مغلق" })}
                    </Pill>
                  )}
                </span>
                <span className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-full bg-night/70 px-3 py-1 text-xs font-bold text-white">
                  {t.type === "outdoor" ? (
                    <SunIcon className="size-3.5" />
                  ) : (
                    <WarehouseIcon className="size-3.5" />
                  )}
                  {t.type === "outdoor" ? "Outdoor" : "Indoor"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="disp m-0 text-[26px] leading-tight">
                  {t.number != null && <span className="text-muted-foreground">#{t.number} </span>}
                  {t.name}
                </h2>
                {t.isMaintenance && t.maintenanceNote && (
                  <p className="m-0 text-sm font-bold text-[#9A4A12]">{t.maintenanceNote}</p>
                )}
                {t.description && (
                  <p className="m-0 text-sm text-muted-foreground">{t.description}</p>
                )}
              </div>
              <dl className="m-0 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-2xl bg-mist p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ClockIcon className="size-3" />
                    {tx({ fr: "Horaires", en: "Hours", ar: "الساعات" })}
                  </dt>
                  <dd className="m-0 mt-1 font-bold" dir="ltr">
                    {t.openingTime && t.closingTime
                      ? `${t.openingTime}–${t.closingTime}`
                      : clubHours}
                  </dd>
                </div>
                <div className="rounded-2xl bg-mist p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UsersIcon className="size-3" />
                    {tx({ fr: "Joueurs", en: "Players", ar: "لاعبون" })}
                  </dt>
                  <dd className="m-0 mt-1 font-bold">{rules.maxPlayers}</dd>
                </div>
                <div className="rounded-2xl bg-mist p-3">
                  <dt className="text-xs text-muted-foreground">
                    {tx({ fr: "Prix / joueur", en: "Per player", ar: "للاعب" })}
                  </dt>
                  <dd className="m-0 mt-1 font-bold">
                    {t.pricePerPerson ?? rules.playerPrice} {rules.currency}
                    {t.pricePerPerson == null && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {tx({ fr: "prix du club", en: "club price", ar: "سعر النادي" })}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E8F7] pt-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                  <Switch
                    checked={t.isActive}
                    onCheckedChange={() => handleToggle(t)}
                    data-testid={`switch-terrain-${t.id}`}
                  />
                  {tx({ fr: "Réservable", en: "Bookable", ar: "قابل للحجز" })}
                </label>
                <span className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(t, -1)}
                    aria-label={tx({
                      fr: "Monter dans la liste",
                      en: "Move up in the list",
                      ar: "تحريك لأعلى",
                    })}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === terrains.length - 1 || reorderMutation.isPending}
                    onClick={() => move(t, 1)}
                    aria-label={tx({
                      fr: "Descendre dans la liste",
                      en: "Move down in the list",
                      ar: "تحريك لأسفل",
                    })}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9"
                    data-testid={`btn-edit-terrain-${t.id}`}
                    onClick={() => openEdit(t)}
                    aria-label={tx({
                      fr: `Modifier ${t.name}`,
                      en: `Edit ${t.name}`,
                      ar: `تعديل ${t.name}`,
                    })}
                  >
                    <PencilSimpleIcon />
                    {tx({ fr: "Modifier", en: "Edit", ar: "تعديل" })}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-testid={`btn-archive-terrain-${t.id}`}
                    onClick={() => handleArchive(t, true)}
                    aria-label={tx({
                      fr: `Archiver ${t.name}`,
                      en: `Archive ${t.name}`,
                      ar: `أرشفة ${t.name}`,
                    })}
                  >
                    <ArchiveIcon />
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
                    <TrashIcon />
                  </Button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          className="self-start text-sm font-bold text-court underline-offset-4 hover:underline"
          onClick={() => setShowArchived((v) => !v)}
          aria-expanded={showArchived}
        >
          {showArchived
            ? tx({
                fr: "Masquer les terrains archivés",
                en: "Hide archived courts",
                ar: "إخفاء الملاعب المؤرشفة",
              })
            : tx({
                fr: "Voir les terrains archivés",
                en: "Show archived courts",
                ar: "عرض الملاعب المؤرشفة",
              })}
        </button>
        {showArchived &&
          (archived?.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {archived.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-sm"
                >
                  <span className="font-bold">
                    {t.number != null && `#${t.number} `}
                    {t.name}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => handleArchive(t, false)}>
                    <BoxArrowUpIcon />
                    {tx({ fr: "Restaurer", en: "Restore", ar: "استعادة" })}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              {tx({
                fr: "Aucun terrain archivé.",
                en: "No archived court.",
                ar: "لا توجد ملاعب مؤرشفة.",
              })}
            </p>
          ))}
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({ fr: "Nouveau terrain", en: "New court", ar: "ملعب جديد" })
                : tx({ fr: "Modifier le terrain", en: "Edit court", ar: "تعديل الملعب" })}
            </DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <div className="grid grid-cols-[1fr_110px] gap-4">
              <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="t-name" required>
                <Input
                  id="t-name"
                  data-testid="input-terrain-name"
                  value={form.name}
                  maxLength={60}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Court Central"
                />
              </Field>
              <Field label={tx({ fr: "Numéro", en: "Number", ar: "الرقم" })} htmlFor="t-number">
                <Input
                  id="t-number"
                  type="number"
                  min={1}
                  max={999}
                  inputMode="numeric"
                  value={form.number}
                  onChange={(e) => set("number", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label={tx({ fr: "Description", en: "Description", ar: "الوصف" })}
              htmlFor="t-desc"
            >
              <Textarea
                id="t-desc"
                rows={2}
                maxLength={1000}
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
            <Field label={tx({ fr: "Photo", en: "Photo", ar: "الصورة" })} htmlFor="t-photo">
              <PhotoInput
                id="t-photo"
                testId="court-photo"
                value={form.photo ? [form.photo] : []}
                onChange={(v) => set("photo", v[0] ?? "")}
                onBusyChange={setPhotoBusy}
              />
            </Field>
            <Field
              label={tx({
                fr: `Prix par joueur (${rules.currency})`,
                en: `Price per player (${rules.currency})`,
                ar: `السعر للاعب (${rules.currency})`,
              })}
              htmlFor="t-price"
              hint={tx({
                fr: `Vide = prix du club (${rules.playerPrice} ${rules.currency}). Les règles heures pleines/creuses restent prioritaires.`,
                en: `Empty = club price (${rules.playerPrice} ${rules.currency}). Peak/off-peak rules still win.`,
                ar: `فارغ = سعر النادي (${rules.playerPrice} ${rules.currency})`,
              })}
            >
              <Input
                id="t-price"
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                placeholder={String(rules.playerPrice)}
                value={form.pricePerPerson}
                onChange={(e) => set("pricePerPerson", e.target.value)}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
              <Switch checked={form.customHours} onCheckedChange={(v) => set("customHours", v)} />
              {tx({
                fr: `Horaires propres à ce terrain (sinon : horaires du club ${clubHours})`,
                en: `Own hours for this court (otherwise club hours ${clubHours})`,
                ar: `ساعات خاصة بهذا الملعب`,
              })}
            </label>
            {form.customHours && (
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
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
              <Switch
                checked={form.isMaintenance}
                onCheckedChange={(v) => set("isMaintenance", v)}
                data-testid="switch-maintenance"
              />
              {tx({
                fr: "En maintenance (non réservable)",
                en: "Under maintenance (not bookable)",
                ar: "تحت الصيانة",
              })}
            </label>
            {form.isMaintenance && (
              <Field
                label={tx({
                  fr: "Message aux joueurs",
                  en: "Note for players",
                  ar: "رسالة للاعبين",
                })}
                htmlFor="t-mnote"
              >
                <Input
                  id="t-mnote"
                  maxLength={200}
                  value={form.maintenanceNote}
                  onChange={(e) => set("maintenanceNote", e.target.value)}
                  placeholder={tx({
                    fr: "Ex : nouveau gazon, retour lundi",
                    en: "e.g. new turf, back on Monday",
                    ar: "مثال: عشب جديد",
                  })}
                />
              </Field>
            )}
            <Button
              data-testid="btn-save-terrain"
              type="submit"
              size="lg"
              disabled={saving || photoBusy}
              loading={saving}
            >
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
