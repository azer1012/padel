import { useState } from "react";
import {
  useListNews,
  useCreateNews,
  useUpdateNews,
  useDeleteNews,
  getListNewsQueryKey,
} from "@workspace/api-client-react";
import type { NewsArticle } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { EyeIcon, NewspaperIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm } from "@/components/smash/admin";
import { PhotoInput } from "@/components/smash/photo-input";
import { useToast } from "@/hooks/use-toast";
import { useTx, useI18n } from "@/lib/i18n";
import { clubDate } from "@/lib/club-time";
import { apiErrorText } from "@/lib/api-errors";
import { mediaSrc } from "@/services/api";

type Form = {
  title: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  category: string;
  isPublished: boolean;
};
const blank: Form = {
  title: "",
  excerpt: "",
  content: "",
  imageUrl: "",
  category: "",
  isPublished: false,
};
const params = { page: 1, limit: 50 };

export default function AdminNews() {
  const tx = useTx();
  const { lang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading } = useListNews(params, {
    query: { queryKey: getListNewsQueryKey(params) },
  });
  const createMutation = useCreateNews();
  const updateMutation = useUpdateNews();
  const deleteMutation = useDeleteNews();
  const [editing, setEditing] = useState<NewsArticle | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  /** A photo is on its way to the storage: saving waits for its address. */
  const [photoBusy, setPhotoBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: getListNewsQueryKey() });
  const saving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setForm(blank);
    setEditing("new");
  };
  const openEdit = (a: NewsArticle) => {
    setForm({
      title: a.title,
      excerpt: a.excerpt ?? "",
      content: a.content,
      imageUrl: a.imageUrl ?? "",
      category: a.category ?? "",
      isPublished: a.isPublished,
    });
    setEditing(a);
  };

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast({
        title: tx({
          fr: "Titre et contenu requis",
          en: "Title and content are required",
          ar: "العنوان والمحتوى مطلوبان",
        }),
        variant: "destructive",
      });
      return;
    }
    const payload = {
      title: form.title.trim(),
      excerpt: form.excerpt || undefined,
      content: form.content,
      // Sent even when empty: a removed photo is removed
      imageUrl: form.imageUrl,
      category: form.category || undefined,
      isPublished: form.isPublished,
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
            tx({ fr: "Article mis à jour", en: "Article updated", ar: "تم تحديث المقال" }),
          ),
          onError: fail,
        },
      );
    else
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: done(
            form.isPublished
              ? tx({ fr: "Article publié", en: "Article published", ar: "تم نشر المقال" })
              : tx({ fr: "Brouillon enregistré", en: "Draft saved", ar: "تم حفظ المسودة" }),
          ),
          onError: fail,
        },
      );
  }

  function togglePublish(a: NewsArticle) {
    updateMutation.mutate(
      { id: a.id, data: { isPublished: !a.isPublished } },
      {
        onSuccess: () => {
          refresh();
          toast({
            title: a.isPublished
              ? tx({ fr: "Article dépublié", en: "Article unpublished", ar: "تم إلغاء النشر" })
              : tx({ fr: "Article publié", en: "Article published", ar: "تم النشر" }),
          });
        },
      },
    );
  }

  async function handleDelete(a: NewsArticle) {
    const ok = await confirm({
      title: tx({
        fr: "Supprimer cet article ?",
        en: "Delete this article?",
        ar: "حذف هذا المقال؟",
      }),
      description: `« ${a.title} ». ${tx({ fr: "Cette action est définitive.", en: "This can't be undone.", ar: "لا يمكن التراجع." })}`,
      confirmLabel: tx({ fr: "Supprimer", en: "Delete", ar: "حذف" }),
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate(
      { id: a.id },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Article supprimé", en: "Article deleted", ar: "تم حذف المقال" }),
          });
          refresh();
        },
      },
    );
  }

  const all = data?.data ?? [];
  const list = all.filter(
    (a) => filter === "all" || (filter === "published" ? a.isPublished : !a.isPublished),
  );
  const drafts = all.filter((a) => !a.isPublished).length;

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Actualités", en: "News", ar: "الأخبار" })}
        subtitle={tx({
          fr: "Annonces, événements et résultats affichés sur le site.",
          en: "Announcements, events and results shown on the site.",
          ar: "الإعلانات والفعاليات المعروضة على الموقع.",
        })}
        actions={
          <Button data-testid="btn-create-article" onClick={openCreate}>
            <PlusIcon />
            {tx({ fr: "Nouvel article", en: "New article", ar: "مقال جديد" })}
          </Button>
        }
      />
      <div className="enter self-start">
        <Segmented
          label={tx({ fr: "Filtre", en: "Filter", ar: "تصفية" })}
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: "all", label: `${tx({ fr: "Tous", en: "All", ar: "الكل" })} · ${all.length}` },
            { value: "published", label: tx({ fr: "Publiés", en: "Published", ar: "منشور" }) },
            {
              value: "draft",
              label: `${tx({ fr: "Brouillons", en: "Drafts", ar: "مسودات" })}${drafts ? ` · ${drafts}` : ""}`,
            },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[120px] !rounded-[26px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<NewspaperIcon className="size-7" />}
          title={tx({ fr: "Aucun article", en: "No articles", ar: "لا مقالات" })}
          action={
            <Button onClick={openCreate}>
              <PlusIcon />
              {tx({ fr: "Écrire un article", en: "Write an article", ar: "اكتب مقالًا" })}
            </Button>
          }
        />
      ) : (
        <ul className="stagger m-0 flex list-none flex-col gap-3 p-0">
          {list.map((a) => (
            <li
              key={a.id}
              data-testid={`card-article-${a.id}`}
              className="lift enter flex flex-col gap-4 rounded-[26px] bg-card p-4 shadow-sm sm:flex-row sm:items-center"
            >
              <span className="flex h-[88px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-mist sm:w-[132px]">
                {a.imageUrl ? (
                  <img
                    src={mediaSrc(a.imageUrl)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <NewspaperIcon className="size-6 text-muted-foreground" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Pill tone={a.isPublished ? "success" : "warning"}>
                    {a.isPublished
                      ? tx({ fr: "Publié", en: "Published", ar: "منشور" })
                      : tx({ fr: "Brouillon", en: "Draft", ar: "مسودة" })}
                  </Pill>
                  {a.category && <Pill tone="info">{a.category}</Pill>}
                  <span className="text-xs text-muted-foreground">
                    {clubDate(a.publishedAt ?? a.createdAt, lang, "date")}
                  </span>
                </span>
                <span className="truncate text-lg font-extrabold">{a.title}</span>
                <span className="line-clamp-1 text-sm text-muted-foreground">
                  {a.excerpt || a.content}
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 sm:justify-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <Switch
                    checked={a.isPublished}
                    onCheckedChange={() => togglePublish(a)}
                    data-testid={`switch-publish-${a.id}`}
                  />
                  {tx({ fr: "En ligne", en: "Live", ar: "منشور" })}
                </label>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(a)}
                    data-testid={`btn-edit-article-${a.id}`}
                    aria-label={tx({ fr: "Modifier", en: "Edit", ar: "تعديل" })}
                  >
                    <PencilSimpleIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => handleDelete(a)}
                    data-testid={`btn-delete-article-${a.id}`}
                    aria-label={tx({ fr: "Supprimer", en: "Delete", ar: "حذف" })}
                  >
                    <TrashIcon />
                  </Button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({ fr: "Nouvel article", en: "New article", ar: "مقال جديد" })
                : tx({ fr: "Modifier l'article", en: "Edit article", ar: "تعديل المقال" })}
            </DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <Field
              label={tx({ fr: "Titre", en: "Title", ar: "العنوان" })}
              htmlFor="n-title"
              required
            >
              <Input
                id="n-title"
                data-testid="input-article-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <Field
                label={tx({ fr: "Résumé", en: "Summary", ar: "الملخص" })}
                htmlFor="n-excerpt"
                hint={tx({
                  fr: "Une phrase affichée sur les cartes.",
                  en: "One line shown on cards.",
                  ar: "سطر يظهر على البطاقات.",
                })}
              >
                <Input
                  id="n-excerpt"
                  value={form.excerpt}
                  onChange={(e) => set("excerpt", e.target.value)}
                />
              </Field>
              <Field label={tx({ fr: "Catégorie", en: "Category", ar: "الفئة" })} htmlFor="n-cat">
                <Input
                  id="n-cat"
                  list="news-categories"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  placeholder="Club"
                />
                <datalist id="news-categories">
                  {["Club", "Tournoi", "Événement", "Nouveauté", "Résultats"].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field
              label={tx({ fr: "Contenu", en: "Content", ar: "المحتوى" })}
              htmlFor="n-content"
              required
            >
              <Textarea
                id="n-content"
                rows={7}
                value={form.content}
                onChange={(e) => set("content", e.target.value)}
                data-testid="input-article-content"
              />
            </Field>
            <Field label={tx({ fr: "Photo", en: "Photo", ar: "الصورة" })} htmlFor="n-img">
              <PhotoInput
                id="n-img"
                testId="news-photo"
                value={form.imageUrl ? [form.imageUrl] : []}
                onChange={(v) => set("imageUrl", v[0] ?? "")}
                onBusyChange={setPhotoBusy}
              />
            </Field>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[20px] bg-secondary p-4">
              <span className="flex items-center gap-3">
                <EyeIcon className="size-5 text-court" />
                <span className="flex flex-col">
                  <span className="font-bold">
                    {tx({
                      fr: "Publier sur le site",
                      en: "Publish on the site",
                      ar: "النشر على الموقع",
                    })}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {tx({
                      fr: "Sinon, l'article reste en brouillon.",
                      en: "Otherwise it stays a draft.",
                      ar: "وإلا يبقى مسودة.",
                    })}
                  </span>
                </span>
              </span>
              <Switch checked={form.isPublished} onCheckedChange={(v) => set("isPublished", v)} />
            </label>
            <Button
              data-testid="btn-save-article"
              type="submit"
              size="lg"
              disabled={saving || photoBusy}
              loading={saving}
            >
              {saving
                ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" })
                : form.isPublished
                  ? tx({ fr: "Publier", en: "Publish", ar: "نشر" })
                  : tx({ fr: "Enregistrer le brouillon", en: "Save draft", ar: "حفظ المسودة" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
