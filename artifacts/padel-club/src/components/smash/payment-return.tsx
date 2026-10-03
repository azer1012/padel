import type { ReactNode } from "react";
import { CheckIcon, ClockIcon, WarningCircleIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { usePaymentReturn } from "@/hooks/use-payment-return";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * What became of the online payment the member just came back from: received, still
 * being confirmed, or not gone through. `paid` is the sentence for the first case
 * (tokens added, order paid).
 */
export function PaymentReturn({
  state,
  paid,
}: {
  state: ReturnType<typeof usePaymentReturn>;
  paid: ReactNode;
}) {
  const tx = useTx();
  if (!state.returning) return null;
  const status = state.payment?.status;
  const waiting = state.checking || (!state.failed && !status);
  const tone =
    status === "paid"
      ? "bg-ball text-night"
      : waiting || status === "pending" || state.failed
        ? "bg-[#FFEBD9] text-[#7A3A0E]"
        : "bg-[#FDE4E4] text-[#7A1C20]";
  return (
    <div
      role="status"
      data-testid="payment-return"
      data-status={waiting ? "checking" : (status ?? "unknown")}
      className={cn("enter flex flex-wrap items-center gap-3 rounded-[24px] px-5 py-4", tone)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/60">
        {status === "paid" ? (
          <CheckIcon className="size-5" />
        ) : waiting || status === "pending" || state.failed ? (
          <ClockIcon className="size-5" />
        ) : (
          <WarningCircleIcon className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-bold">
        {waiting
          ? tx({
              fr: "Vérification de votre paiement…",
              en: "Checking your payment…",
              ar: "جارٍ التحقق من الدفع…",
            })
          : status === "paid"
            ? paid
            : status === "refund_due" || status === "refunded"
              ? tx({
                  fr: "Paiement reçu, mais la commande a été annulée : le club vous rembourse.",
                  en: "Payment received, but the order was cancelled: the club refunds you.",
                  ar: "تم استلام الدفع لكن الطلب أُلغي: سيعيد النادي المبلغ.",
                })
              : status === "pending" || state.failed
                ? tx({
                    fr: "Votre paiement n'est pas encore confirmé. S'il a été validé, il apparaîtra dans quelques minutes.",
                    en: "Your payment is not confirmed yet. If it went through, it will show within a few minutes.",
                    ar: "لم يتم تأكيد الدفع بعد. إن تم، سيظهر خلال دقائق.",
                  })
                : tx({
                    fr: "Le paiement n'a pas abouti : rien n'a été débité.",
                    en: "The payment did not go through: nothing was charged.",
                    ar: "لم يكتمل الدفع: لم يُخصم شيء.",
                  })}
      </span>
      {!waiting && (status === "pending" || state.failed) && (
        <Button size="sm" variant="dark" onClick={() => state.recheck()}>
          {tx({ fr: "Vérifier à nouveau", en: "Check again", ar: "تحقق مجددًا" })}
        </Button>
      )}
      {!waiting && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={state.dismiss}
          aria-label={tx({ fr: "Fermer", en: "Close", ar: "إغلاق" })}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
