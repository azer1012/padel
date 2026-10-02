import type { ShopOrderStatus } from "@workspace/api-client-react";
import type { Tone } from "@/components/smash/admin";
import { useTx } from "@/lib/i18n";
import { money } from "@/lib/labels";

/** How a boutique order's state is worded and coloured, for the member and the desk. */
export function useOrderStatus() {
  const tx = useTx();
  return (status: ShopOrderStatus): { label: string; tone: Tone } => {
    switch (status) {
      case "pending":
        return {
          tone: "warning",
          label: tx({
            fr: "En attente d'appel",
            en: "Waiting for the call",
            ar: "بانتظار الاتصال",
          }),
        };
      case "confirmed":
        return { tone: "info", label: tx({ fr: "Confirmée", en: "Confirmed", ar: "مؤكد" }) };
      case "shipped":
        return { tone: "court", label: tx({ fr: "En route", en: "On its way", ar: "في الطريق" }) };
      case "delivered":
        return { tone: "success", label: tx({ fr: "Remise", en: "Delivered", ar: "تم التسليم" }) };
      case "cancelled":
        return { tone: "muted", label: tx({ fr: "Annulée", en: "Cancelled", ar: "ملغى" }) };
    }
  };
}

/** The categories an article can be filed under. */
export function useShopCategories() {
  const tx = useTx();
  const all = [
    { value: "racket", label: tx({ fr: "Raquettes", en: "Rackets", ar: "مضارب" }) },
    { value: "balls", label: tx({ fr: "Balles", en: "Balls", ar: "كرات" }) },
    { value: "bag", label: tx({ fr: "Sacs", en: "Bags", ar: "حقائب" }) },
    { value: "clothing", label: tx({ fr: "Textile", en: "Clothing", ar: "ملابس" }) },
    { value: "shoes", label: tx({ fr: "Chaussures", en: "Shoes", ar: "أحذية" }) },
    { value: "accessory", label: tx({ fr: "Accessoires", en: "Accessories", ar: "إكسسوارات" }) },
  ];
  return { all, label: (value: string) => all.find((c) => c.value === value)?.label ?? value };
}

/** "349.90" or "18": an amount without needless decimals. */
export const shopMoney = money;
