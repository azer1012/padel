import { format } from "date-fns";
import { useGetTokenBalance, useListTokenTransactions } from "@workspace/api-client-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Phone,
  MessageCircle,
  Coins,
  AlarmClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { useI18n, useTx, useDateLocale } from "@/lib/i18n";
import { CLUB } from "@/config/club";
import { cn } from "@/lib/utils";

export default function Wallet() {
  const tx = useTx();
  const { t } = useI18n();
  const locale = useDateLocale();
  const { data: balance, isLoading: loadingBalance } = useGetTokenBalance();
  const { data: transactions, isLoading: loadingTx } = useListTokenTransactions({ limit: 30 });
  const list = transactions?.data ?? [];
  const credits = list.filter((x) => x.type === "credit").reduce((s, x) => s + x.amount, 0);
  const debits = list.filter((x) => x.type === "debit").reduce((s, x) => s + x.amount, 0);
  const bal = balance?.balance ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow={t("wallet")}
        title={t("myWallet")}
        subtitle={tx({
          fr: "1 token = 1 place de joueur pour un match.",
          en: "1 token = 1 player spot for one match.",
          ar: "رصيد واحد = مكان لاعب لمباراة واحدة.",
        })}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="on-dark enter relative flex min-h-[260px] flex-col justify-between gap-6 overflow-hidden rounded-[32px] bg-night p-7 text-white">
          <div
            aria-hidden="true"
            className="absolute -end-16 -top-16 size-[260px] rounded-full border-[18px] border-ball/15"
          />
          <span className="label relative text-ball">{t("tokenBalance")}</span>
          {loadingBalance ? (
            <Skeleton className="h-24 w-40 bg-white/10" />
          ) : (
            <p className="relative m-0 flex items-baseline gap-3">
              <span className="disp text-[120px] leading-[0.8] tracking-[-0.05em]">{bal}</span>
              <span className="disp text-3xl">tokens</span>
            </p>
          )}
          <div className="relative flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
              {tx({
                fr: `${Math.floor(bal / CLUB.tokensFullCourt)} terrain(s) complet(s)`,
                en: `${Math.floor(bal / CLUB.tokensFullCourt)} full court(s)`,
                ar: `${Math.floor(bal / CLUB.tokensFullCourt)} ملعب كامل`,
              })}
            </span>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
              {tx({ fr: `ou ${bal} place(s)`, en: `or ${bal} spot(s)`, ar: `أو ${bal} مكان` })}
            </span>
          </div>
          {balance?.pendingExpiry ? (
            <span className="relative flex items-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-bold text-night">
              <AlarmClock className="size-4" />
              {tx({
                fr: `${balance.pendingExpiry} token(s) expirent`,
                en: `${balance.pendingExpiry} token(s) expire`,
                ar: `${balance.pendingExpiry} رصيد ينتهي`,
              })}
              {balance.nextExpiryDate
                ? ` · ${format(new Date(balance.nextExpiryDate), "d MMMM", { locale })}`
                : ""}
            </span>
          ) : null}
        </section>

        <section className="enter flex flex-col gap-4 rounded-[32px] bg-ball p-7 text-night">
          <span className="label">{tx({ fr: "Recharger", en: "Top up", ar: "الشحن" })}</span>
          <span className="disp text-[30px] leading-tight">
            {tx({
              fr: "Rechargez à l'accueil ou par téléphone.",
              en: "Top up at the front desk or by phone.",
              ar: "اشحن في الاستقبال أو عبر الهاتف.",
            })}
          </span>
          <span className="text-[15px]">
            {tx({
              fr: "Payez en espèces à l'accueil du club. Les tokens apparaissent ici tout de suite.",
              en: "Pay cash at the club front desk. Tokens show up here immediately.",
              ar: "ادفع نقدًا في استقبال النادي. يظهر الرصيد هنا فورًا.",
            })}
          </span>
          <div className="mt-auto flex flex-wrap gap-2">
            {CLUB.phoneHref && (
              <Button asChild variant="dark" size="sm">
                <a href={CLUB.phoneHref}>
                  <Phone />
                  {tx({ fr: "Appeler", en: "Call", ar: "اتصل" })}
                </a>
              </Button>
            )}
            {CLUB.whatsappHref && (
              <Button asChild variant="outline" size="sm">
                <a href={CLUB.whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[24px] bg-card p-5 shadow-sm">
          <span className="text-sm font-semibold text-muted-foreground">
            {tx({ fr: "Crédités", en: "Credited", ar: "مضاف" })}
          </span>
          <p className="disp m-0 mt-1 text-[40px] text-success">+{credits}</p>
        </div>
        <div className="rounded-[24px] bg-card p-5 shadow-sm">
          <span className="text-sm font-semibold text-muted-foreground">
            {tx({ fr: "Utilisés", en: "Used", ar: "مستخدم" })}
          </span>
          <p className="disp m-0 mt-1 text-[40px]">−{debits}</p>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="disp m-0 text-3xl">{t("transactionHistory")}</h2>
        {loadingTx ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] !rounded-[22px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Coins className="size-7" />} title={t("noTransactions")} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {list.map((x) => {
              const credit = x.type === "credit";
              const adj = x.type === "adjustment";
              return (
                <li
                  key={x.id}
                  className="flex items-center gap-4 rounded-[22px] bg-card p-3 pe-5 shadow-sm"
                >
                  <span
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                      credit
                        ? "bg-[#DDF5E7] text-success"
                        : adj
                          ? "bg-secondary text-muted-foreground"
                          : "bg-[#EEF1FF] text-court",
                    )}
                  >
                    {credit ? (
                      <ArrowDownLeft className="size-5" />
                    ) : adj ? (
                      <RefreshCw className="size-5" />
                    ) : (
                      <ArrowUpRight className="size-5" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{x.description}</span>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(x.createdAt), "d MMM yyyy · HH:mm", { locale })}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className={cn("disp text-2xl", credit ? "text-success" : "text-ink")}>
                      {credit ? "+" : x.type === "debit" ? "−" : "±"}
                      {x.amount}
                    </span>
                    {x.balanceAfter != null && (
                      <span className="text-xs text-muted-foreground">
                        {tx({ fr: "solde", en: "balance", ar: "الرصيد" })} {x.balanceAfter}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}
