import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTokenBalanceQueryKey,
  useBuyTokens,
  useGetMe,
  useGetTokenBalance,
  useTokenHistory,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { PaymentReturn } from "@/components/smash/payment-return";
import { usePaymentReturn } from "@/hooks/use-payment-return";
import { apiErrorText } from "@/lib/api-errors";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CoinsIcon,
  CreditCardIcon,
  GiftIcon,
  PhoneIcon,
  WhatsappLogoIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { useI18n, useTx } from "@/lib/i18n";
import { CLUB } from "@/config/club";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";
import { clubDateTime } from "@/lib/club-time";
import {
  ledgerLabel,
  money,
  packSaving,
  plural,
  tokenAmount,
  tokenWord,
  tokensLabel,
} from "@/lib/labels";

export default function Wallet() {
  const rules = useClubRules();
  const tx = useTx();
  const { t } = useI18n();
  const { lang } = useI18n();
  const {
    data: balance,
    isLoading: loadingBalance,
    isError: balanceError,
    refetch: refetchBalance,
  } = useGetTokenBalance();
  // The ledger, 30 movements at a time: "older movements" brings the next page
  const history = useTokenHistory(30);
  const { isLoading: loadingTx, isError: txError, refetch: refetchTx } = history;
  const pages = history.data?.pages ?? [];
  const list = pages.flatMap((p) => p.data);
  // Totals of the whole ledger, from the API: the list below holds the latest entries only
  const credits = pages[0]?.received ?? 0;
  const debits = pages[0]?.used ?? 0;
  const bal = balance?.balance ?? 0;
  const fullCourts = Math.floor(bal / Math.max(1, rules.tokenCostFullCourt));
  const spots = Math.floor(bal / Math.max(1, rules.tokenCostPlayer));
  const { data: me } = useGetMe();
  /**
   * Reward earned and not yet a whole token. A refunded booking takes its reward back,
   * token included; below zero only when the wallet no longer held that token.
   */
  const loyalty = me?.loyaltyBalance ?? 0;

  // Online payment: the API decides the amount and answers with the page to pay on
  const qc = useQueryClient();
  const online = rules.onlinePayment.enabled;
  const buy = useBuyTokens();
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const custom = Number(customText);
  const customValid =
    Number.isInteger(custom) && custom >= Math.max(1, rules.tokenMinPurchase) && custom <= 1000;
  const pay = (what: { packageId: number } | { tokens: number }, key: string) => {
    setPayError(null);
    setPaying(key);
    buy.mutate(what, {
      onSuccess: (payment) => {
        // Stays "loading" until the browser has left for the payment page
        if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl);
        else setPaying(null);
      },
      onError: (err) => {
        setPaying(null);
        setPayError(apiErrorText(err, tx));
      },
    });
  };
  const back = usePaymentReturn(() => {
    qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/tokens/transactions"] });
  });

  return (
    <Page>
      <PageHeader
        eyebrow={t("wallet")}
        title={t("myWallet")}
        subtitle={tx({
          fr: `${tokensLabel(rules.tokenCostPlayer)} = 1 place de joueur pour un match.`,
          en: `${tokensLabel(rules.tokenCostPlayer)} = 1 player spot for one match.`,
          ar: `${rules.tokenCostPlayer} رصيد = مكان لاعب لمباراة واحدة.`,
        })}
      />
      <PaymentReturn
        state={back}
        paid={tx({
          fr: `Paiement reçu : ${tokensLabel(back.payment?.tokens ?? 0)} ${plural(back.payment?.tokens ?? 0, "ajouté", "ajoutés")} à votre solde.`,
          en: `Payment received: ${tokensLabel(back.payment?.tokens ?? 0)} added to your balance.`,
          ar: `تم استلام الدفع: أُضيف ${tokensLabel(back.payment?.tokens ?? 0)} إلى رصيدك.`,
        })}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="on-dark enter relative flex min-h-[260px] flex-col justify-between gap-6 overflow-hidden rounded-[32px] bg-night p-7 text-white">
          <div
            aria-hidden="true"
            className="spin-slow absolute -end-16 -top-16 size-[260px] rounded-full border-[18px] border-dashed border-ball/15"
          />
          <span className="label relative text-ball">
            {tx({ fr: "Votre solde", en: "Your balance", ar: "رصيدك" })}
          </span>
          {loadingBalance ? (
            <Skeleton className="h-24 w-40 bg-white/10" />
          ) : balanceError ? (
            // Never "0 token" when the balance could not be read
            <div role="alert" className="relative flex flex-col items-start gap-3">
              <span className="text-[17px] font-bold">
                {tx({
                  fr: "Votre solde n'a pas chargé.",
                  en: "Your balance didn't load.",
                  ar: "لم يتم تحميل رصيدك.",
                })}
              </span>
              <Button variant="lime" size="sm" onClick={() => refetchBalance()}>
                {tx({ fr: "Réessayer", en: "Try again", ar: "إعادة المحاولة" })}
              </Button>
            </div>
          ) : (
            <p className="relative m-0 flex items-baseline gap-3">
              <CountUp value={bal} className="disp text-[120px] leading-[0.8] tracking-[-0.05em]" />
              <span className="disp text-3xl">{tokenWord(bal)}</span>
            </p>
          )}
          <div className={cn("relative flex flex-wrap gap-2", balanceError && "hidden")}>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
              {tx({
                fr: `${fullCourts} ${plural(fullCourts, "terrain complet", "terrains complets")}`,
                en: `${fullCourts} ${plural(fullCourts, "full court", "full courts")}`,
                ar: `${fullCourts} ملعب كامل`,
              })}
            </span>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
              {tx({
                fr: `ou ${spots} ${plural(spots, "place de joueur", "places de joueur")}`,
                en: `or ${spots} ${plural(spots, "player spot", "player spots")}`,
                ar: `أو ${spots} مكان`,
              })}
            </span>
          </div>
        </section>

        <section className="enter delay-1 flex flex-col gap-4 rounded-[32px] bg-ball p-7 text-night">
          <span className="label">{tx({ fr: "Recharger", en: "Top up", ar: "الشحن" })}</span>
          <span className="disp text-[30px] leading-tight">
            {online
              ? tx({
                  fr: "Rechargez en ligne, ou à l'accueil.",
                  en: "Top up online, or at the front desk.",
                  ar: "اشحن عبر الإنترنت أو في الاستقبال.",
                })
              : tx({
                  fr: "Rechargez à l'accueil ou par téléphone.",
                  en: "Top up at the front desk or by phone.",
                  ar: "اشحن في الاستقبال أو عبر الهاتف.",
                })}
          </span>
          <span className="text-[15px]">
            {online
              ? tx({
                  fr: "Payez par carte ou e-Dinar sur la page sécurisée de paiement : vos tokens arrivent dès le paiement confirmé. Vous pouvez aussi payer en espèces à l'accueil.",
                  en: "Pay by card or e-Dinar on the secure payment page: your tokens arrive as soon as the payment is confirmed. You can also pay cash at the front desk.",
                  ar: "ادفع بالبطاقة أو e-Dinar في صفحة الدفع الآمنة: يصل رصيدك فور تأكيد الدفع. يمكنك أيضًا الدفع نقدًا في الاستقبال.",
                })
              : tx({
                  fr: "Payez en espèces à l'accueil du club. Les tokens apparaissent ici tout de suite.",
                  en: "Pay cash at the club front desk. Tokens show up here immediately.",
                  ar: "ادفع نقدًا في استقبال النادي. يظهر الرصيد هنا فورًا.",
                })}
          </span>
          {rules.tokenPackages.length > 0 && (
            <ul data-testid="wallet-packs" className="m-0 flex list-none flex-col gap-1.5 p-0">
              {rules.tokenPackages.map((p) => {
                const saving = packSaving(p, rules.tokenUnitPrice);
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl bg-white/55 px-4 py-2.5"
                  >
                    <span className="min-w-0 font-bold">
                      {p.name} · {tokensLabel(p.tokens)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm">
                      {saving && saving.percent >= 1 && (
                        <span className="rounded-full bg-night px-2 py-0.5 text-xs font-extrabold text-ball">
                          −{saving.percent} %
                        </span>
                      )}
                      <span className="font-extrabold">
                        {money(p.price)} {rules.currency}
                      </span>
                      {online && (
                        <Button
                          size="sm"
                          variant="dark"
                          onClick={() => pay({ packageId: p.id }, `pack-${p.id}`)}
                          disabled={buy.isPending}
                          loading={paying === `pack-${p.id}`}
                          data-testid={`btn-buy-pack-${p.id}`}
                          aria-label={tx({
                            fr: `Payer ${p.name} en ligne, ${money(p.price)} ${rules.currency}`,
                            en: `Pay ${p.name} online, ${money(p.price)} ${rules.currency}`,
                            ar: `ادفع ${p.name} عبر الإنترنت، ${money(p.price)} ${rules.currency}`,
                          })}
                        >
                          <CreditCardIcon />
                          {tx({ fr: "Payer", en: "Pay", ar: "ادفع" })}
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {online && rules.tokenUnitPrice > 0 && (
            <form
              className="flex flex-wrap items-end gap-2 rounded-2xl bg-white/55 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (customValid) pay({ tokens: custom }, "custom");
              }}
            >
              <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-sm font-bold">
                {tx({ fr: "Autre quantité", en: "Another quantity", ar: "كمية أخرى" })}
                <Input
                  type="number"
                  inputMode="numeric"
                  min={rules.tokenMinPurchase}
                  max={1000}
                  step={1}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="h-10 bg-white"
                  data-testid="input-buy-tokens"
                />
              </label>
              <span className="pb-2 text-sm font-extrabold" dir="ltr">
                {customValid ? `${money(custom * rules.tokenUnitPrice)} ${rules.currency}` : "–"}
              </span>
              <Button
                type="submit"
                size="sm"
                variant="dark"
                disabled={!customValid || buy.isPending}
                loading={paying === "custom"}
                data-testid="btn-buy-tokens"
              >
                <CreditCardIcon />
                {tx({ fr: "Payer", en: "Pay", ar: "ادفع" })}
              </Button>
              {!customValid && customText !== "" && (
                <span className="w-full text-xs font-semibold text-[#7A1C20]">
                  {tx({
                    fr: `Entre ${rules.tokenMinPurchase} et 1000 tokens.`,
                    en: `Between ${rules.tokenMinPurchase} and 1000 tokens.`,
                    ar: `بين ${rules.tokenMinPurchase} و1000 رصيد.`,
                  })}
                </span>
              )}
            </form>
          )}
          {payError && (
            <p
              role="alert"
              className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
            >
              {payError}
            </p>
          )}
          <div className="mt-auto flex flex-wrap gap-2">
            {CLUB.phoneHref && (
              <Button asChild variant="dark" size="sm">
                <a href={CLUB.phoneHref}>
                  <PhoneIcon />
                  {tx({ fr: "Appeler", en: "Call", ar: "اتصل" })}
                </a>
              </Button>
            )}
            {CLUB.whatsappHref && (
              <Button asChild variant="outline" size="sm">
                <a href={CLUB.whatsappHref} target="_blank" rel="noreferrer">
                  <WhatsappLogoIcon />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </section>
      </div>

      {(rules.loyaltyEnabled || loyalty > 0) && (
        <section
          data-testid="loyalty-card"
          className="enter flex flex-col gap-4 rounded-[28px] bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:gap-6"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ball text-night">
            <GiftIcon className="size-7" weight="duotone" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="label text-court">
              {tx({ fr: "Fidélité", en: "Loyalty", ar: "الوفاء" })}
            </span>
            <span className="text-[17px] font-extrabold">
              {tx({
                fr: `${tokenAmount(Math.max(0, loyalty))} / 1 token de récompense`,
                en: `${tokenAmount(Math.max(0, loyalty))} / 1 reward token`,
                ar: `${tokenAmount(Math.max(0, loyalty))} / 1 رصيد مكافأة`,
              })}
            </span>
            <span
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, Math.max(0, loyalty)) * 100)}
              aria-label={tx({
                fr: "Progression vers le prochain token offert",
                en: "Progress to the next free token",
                ar: "التقدم نحو الرصيد المجاني القادم",
              })}
              className="h-2.5 overflow-hidden rounded-full bg-secondary"
            >
              <span
                className="block h-full rounded-full bg-court transition-[width] duration-700"
                style={{ width: `${Math.min(1, Math.max(0, loyalty)) * 100}%` }}
              />
            </span>
            <span className="text-sm text-muted-foreground">
              {rules.loyaltyEnabled
                ? tx({
                    fr: `Chaque réservation payée en tokens vous rapporte ${tokenAmount(rules.loyaltyRewardTokens)} token pour ${tokensLabel(rules.loyaltySpendTokens)} ${plural(rules.loyaltySpendTokens, "dépensé", "dépensés")}. À 1, un token est ajouté à votre solde.`,
                    en: `Every booking paid with tokens earns you ${tokenAmount(rules.loyaltyRewardTokens)} token per ${tokensLabel(rules.loyaltySpendTokens)} spent. At 1, a token is added to your balance.`,
                    ar: `كل حجز مدفوع بالرصيد يمنحك ${tokenAmount(rules.loyaltyRewardTokens)} رصيد مقابل كل ${tokensLabel(rules.loyaltySpendTokens)} مُنفق. عند بلوغ 1 يُضاف رصيد إلى حسابك.`,
                  })
                : tx({
                    fr: "Le programme de fidélité est en pause : votre progression est conservée.",
                    en: "The loyalty programme is paused: your progress is kept.",
                    ar: "برنامج الوفاء متوقف مؤقتًا: تقدمك محفوظ.",
                  })}
              {loyalty < 0 &&
                ` ${tx({
                  fr: `Une réservation remboursée avait déjà rapporté un token : il reste ${tokenAmount(-loyalty)} à regagner avant la prochaine récompense.`,
                  en: `A refunded booking had already earned a token: ${tokenAmount(-loyalty)} is left to earn back before the next reward.`,
                  ar: `حجز مُسترد كان قد منح رصيدًا: بقي ${tokenAmount(-loyalty)} لتعويضه قبل المكافأة القادمة.`,
                })}`}
            </span>
          </div>
        </section>
      )}

      <div className="stagger grid grid-cols-2 gap-3">
        <div className="rounded-[24px] bg-card p-5 shadow-sm">
          <span className="text-sm font-semibold text-muted-foreground">
            {tx({ fr: "Tokens reçus", en: "Tokens received", ar: "رصيد مُضاف" })}
          </span>
          <p className="disp m-0 mt-1 text-[40px] text-success">
            +<CountUp value={credits} />
          </p>
        </div>
        <div className="rounded-[24px] bg-card p-5 shadow-sm">
          <span className="text-sm font-semibold text-muted-foreground">
            {tx({ fr: "Tokens utilisés", en: "Tokens used", ar: "رصيد مُستخدم" })}
          </span>
          <p className="disp m-0 mt-1 text-[40px]">
            −<CountUp value={debits} />
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="disp m-0 text-3xl">{t("transactionHistory")}</h2>
        {txError ? (
          <ErrorState
            text={tx({
              fr: "L'historique n'a pas chargé.",
              en: "The history didn't load.",
              ar: "لم يتم تحميل السجل.",
            })}
            onRetry={() => refetchTx()}
          />
        ) : loadingTx ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] !rounded-[22px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<CoinsIcon className="size-7" />}
            title={t("noTransactions")}
            text={tx({
              fr: "Vos recharges et vos réservations apparaîtront ici.",
              en: "Your top-ups and bookings will show up here.",
              ar: "ستظهر هنا عمليات الشحن والحجوزات.",
            })}
          />
        ) : (
          <ul
            data-testid="wallet-history"
            className="stagger m-0 flex list-none flex-col gap-2 p-0"
          >
            {list.map((x) => {
              const credit = x.type === "credit";
              const adj = x.type === "adjustment";
              return (
                <li
                  key={x.id}
                  className="group flex items-center gap-4 rounded-[22px] bg-card p-3 pe-5 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] group-hover:scale-110",
                      credit
                        ? "bg-[#DDF5E7] text-success"
                        : adj
                          ? "bg-secondary text-muted-foreground"
                          : "bg-[#EEF1FF] text-court",
                    )}
                  >
                    {credit ? (
                      <ArrowDownLeftIcon className="size-5" />
                    ) : adj ? (
                      <ArrowsClockwiseIcon className="size-5" />
                    ) : (
                      <ArrowUpRightIcon className="size-5" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 font-bold leading-snug">
                      {ledgerLabel(tx, x.description)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {credit
                        ? tx({ fr: "Crédit", en: "Credit", ar: "إضافة" })
                        : adj
                          ? tx({ fr: "Correction", en: "Adjustment", ar: "تعديل" })
                          : tx({ fr: "Débit", en: "Debit", ar: "خصم" })}
                      {" · "}
                      {clubDateTime(x.createdAt, lang)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span
                      className={cn(
                        "whitespace-nowrap text-lg font-extrabold",
                        credit ? "text-[#0F6B3C]" : "text-ink",
                      )}
                    >
                      {credit ? "+" : x.type === "debit" ? "−" : "±"}
                      {tokensLabel(x.amount)}
                    </span>
                    {x.balanceAfter != null && (
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {tx({ fr: "solde", en: "balance", ar: "الرصيد" })} {x.balanceAfter}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {history.hasNextPage && (
          <Button
            variant="secondary"
            className="self-center"
            onClick={() => history.fetchNextPage()}
            disabled={history.isFetchingNextPage}
            loading={history.isFetchingNextPage}
            data-testid="btn-older-movements"
          >
            {tx({
              fr: "Voir les mouvements plus anciens",
              en: "Show older movements",
              ar: "عرض الحركات الأقدم",
            })}
          </Button>
        )}
      </section>
    </Page>
  );
}
