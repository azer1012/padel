import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  GiftIcon,
  MoneyIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { useTx } from "@/lib/i18n";

type Props = {
  type: "token" | "cash_club" | "invited_free" | string | null | undefined;
  status: "paid" | "pending" | "refunded" | string | null | undefined;
  className?: string;
};

/** One player's payment state: token · cash at the club (paid / to pay) · invited · refunded. */
export function PaymentBadge({ type, status, className }: Props) {
  const tx = useTx();
  if (!type || !status) return null;
  if (status === "refunded")
    return (
      <Badge variant="muted" className={`gap-1 ${className ?? ""}`}>
        <ArrowCounterClockwiseIcon className="size-3" />
        {tx({ fr: "Remboursé", en: "Refunded", ar: "مسترجع" })}
      </Badge>
    );
  if (type === "invited_free")
    return (
      <Badge variant="lime" className={`gap-1 ${className ?? ""}`}>
        <GiftIcon className="size-3" />
        {tx({ fr: "Invité", en: "Invited", ar: "مدعو" })}
      </Badge>
    );
  if (type === "cash_club")
    return status === "paid" ? (
      <Badge variant="success" className={`gap-1 ${className ?? ""}`}>
        <MoneyIcon className="size-3" />
        {tx({ fr: "Espèces · payé", en: "Cash · paid", ar: "نقدًا · مدفوع" })}
      </Badge>
    ) : (
      <Badge variant="warning" className={`gap-1 ${className ?? ""}`}>
        <ClockIcon className="size-3" />
        {tx({ fr: "À payer au club", en: "Pay at the club", ar: "الدفع في النادي" })}
      </Badge>
    );
  return (
    <Badge variant="success" className={`gap-1 ${className ?? ""}`}>
      <CheckCircleIcon className="size-3" />
      {tx({ fr: "Payé · token", en: "Paid · token", ar: "مدفوع · رصيد" })}
    </Badge>
  );
}
