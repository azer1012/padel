import { useState } from "react";
import { format } from "date-fns";
import { useListNews } from "@workspace/api-client-react";
import type { NewsArticle } from "@workspace/api-client-react";
import { Newspaper, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { useI18n, useTx, useDateLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function News() {
  const tx = useTx();
  const { t } = useI18n();
  const locale = useDateLocale();
  const { data: response, isLoading, isError, refetch } = useListNews({ limit: 30 });
  const [open, setOpen] = useState<NewsArticle | null>(null);
  const articles = response?.data ?? [];
  const [featured, ...rest] = articles;
  const date = (a: NewsArticle) =>
    format(new Date(a.publishedAt ?? a.createdAt), "d MMMM yyyy", { locale });

  const Card = ({ a, big }: { a: NewsArticle; big?: boolean }) => (
    <button
      type="button"
      onClick={() => setOpen(a)}
      className={cn(
        "lift group flex w-full overflow-hidden rounded-[32px] bg-card text-start shadow-sm",
        big ? "flex-col lg:flex-row" : "flex-col",
      )}
    >
      {a.imageUrl && (
        <span
          className={cn("photo block shrink-0", big ? "h-[240px] lg:h-auto lg:w-1/2" : "h-[190px]")}
        >
          <img
            src={a.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </span>
      )}
      <span className={cn("flex flex-1 flex-col gap-3", big ? "p-7 lg:p-10" : "p-6")}>
        <span className="flex items-center gap-3">
          <span className="label text-court">
            {a.category || tx({ fr: "Actu", en: "News", ar: "خبر" })}
          </span>
          <span className="text-sm text-muted-foreground">{date(a)}</span>
        </span>
        <span
          className={cn(
            "disp leading-tight tracking-[-0.02em]",
            big ? "text-[clamp(30px,3.4vw,44px)]" : "text-2xl",
          )}
        >
          {a.title}
        </span>
        <span
          className={cn(
            "text-[15px] leading-relaxed text-muted-foreground",
            big ? "line-clamp-4" : "line-clamp-3",
          )}
        >
          {a.excerpt || a.content}
        </span>
        <span className="mt-auto flex items-center gap-2 pt-2 font-bold text-court">
          {tx({ fr: "Lire", en: "Read", ar: "اقرأ" })}
          <ArrowRight className="btn-ic size-4 transition-transform group-hover:translate-x-1 rtl:scale-x-[-1]" />
        </span>
      </span>
    </button>
  );

  return (
    <Page wide>
      <PageHeader
        eyebrow={t("news")}
        title={tx({ fr: "La vie du club", en: "Life at the club", ar: "حياة النادي" })}
        subtitle={tx({
          fr: "Événements, annonces et résultats.",
          en: "Events, announcements and results.",
          ar: "فعاليات وإعلانات ونتائج.",
        })}
      />
      {isError ? (
        <ErrorState
          text={tx({
            fr: "Les actus n'ont pas chargé.",
            en: "News didn't load.",
            ar: "لم يتم تحميل الأخبار.",
          })}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[360px] !rounded-[32px]" />
          <div className="grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[340px] !rounded-[32px]" />
            ))}
          </div>
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="size-7" />}
          title={tx({ fr: "Pas encore d'actualités", en: "No news yet", ar: "لا أخبار بعد" })}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Card a={featured} big />
          {rest.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {rest.map((a) => (
                <Card key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[720px]">
          {open && (
            <>
              {open.imageUrl && (
                <img
                  src={open.imageUrl}
                  alt=""
                  className="-mx-6 -mt-6 h-[260px] w-[calc(100%+48px)] max-w-none rounded-t-[32px] object-cover sm:-mx-8 sm:-mt-8 sm:w-[calc(100%+64px)]"
                />
              )}
              <DialogHeader className="text-start">
                <span className="label text-court">
                  {open.category || tx({ fr: "Actu", en: "News", ar: "خبر" })} · {date(open)}
                </span>
                <DialogTitle className="text-[34px] leading-tight">{open.title}</DialogTitle>
                {open.excerpt && (
                  <DialogDescription className="text-lg">{open.excerpt}</DialogDescription>
                )}
              </DialogHeader>
              <div className="whitespace-pre-line text-[17px] leading-relaxed text-body">
                {open.content}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
