import type { Dispatch, SetStateAction } from "react";
import { useEquipment, type EquipmentLine } from "@workspace/api-client-react";
import { MinusIcon, PackageIcon, PlusIcon } from "@/components/icons";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";

/** Rental add-ons for one slot. Stock shown is what's still free at that exact time. */
export function EquipmentPicker({
  startTime,
  value,
  onChange,
}: {
  startTime: string;
  value: EquipmentLine[];
  onChange: Dispatch<SetStateAction<EquipmentLine[]>>;
}) {
  const rules = useClubRules();
  const tx = useTx();
  const { data: items, isLoading } = useEquipment(startTime);
  if (isLoading || !items?.length) return null;

  const qty = (id: number) => value.find((l) => l.itemId === id)?.quantity ?? 0;
  // Functional updates: rapid taps must each build on the latest state, not the last render
  const step = (id: number, delta: number, max: number) =>
    onChange((prev) => {
      const q = Math.max(
        0,
        Math.min(max, (prev.find((l) => l.itemId === id)?.quantity ?? 0) + delta),
      );
      const rest = prev.filter((l) => l.itemId !== id);
      return q > 0 ? [...rest, { itemId: id, quantity: q }] : rest;
    });
  const total = value.reduce(
    (s, l) => s + l.quantity * (items.find((i) => i.id === l.itemId)?.price ?? 0),
    0,
  );

  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-[22px] border border-[#E4E8F7] p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-extrabold">
        <PackageIcon className="size-4 text-court" />
        {tx({ fr: "Louer du matériel", en: "Rent equipment", ar: "استئجار معدات" })}
        <span className="font-semibold text-muted-foreground">
          · {tx({ fr: "payé à l'accueil", en: "paid at the desk", ar: "يُدفع في الاستقبال" })}
        </span>
      </legend>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((i) => {
          const q = qty(i.id),
            max = Math.min(i.available, 8),
            out = i.available <= 0;
          return (
            <li
              key={i.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-2 py-1.5",
                q > 0 && "bg-[#EEF1FF]",
                out && "opacity-55",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  {i.price
                    ? `${i.price} ${rules.currency}`
                    : tx({ fr: "Gratuit", en: "Free", ar: "مجاني" })}{" "}
                  ·{" "}
                  {out
                    ? tx({
                        fr: "épuisé à cette heure",
                        en: "none left at this time",
                        ar: "نفد في هذا الوقت",
                      })
                    : tx({
                        fr: `${i.available} dispo`,
                        en: `${i.available} left`,
                        ar: `${i.available} متاح`,
                      })}
                </span>
              </span>
              <span className="flex items-center gap-1" role="group" aria-label={i.name}>
                <button
                  type="button"
                  onClick={() => step(i.id, -1, max)}
                  disabled={q <= 0}
                  aria-label={tx({
                    fr: `Retirer ${i.name}`,
                    en: `Remove ${i.name}`,
                    ar: `إزالة ${i.name}`,
                  })}
                  className="flex size-9 items-center justify-center rounded-full border-2 border-[#E4E8F7] transition-colors hover:border-ink disabled:opacity-40"
                >
                  <MinusIcon className="size-4" />
                </button>
                <span className="w-7 text-center font-extrabold tabular-nums" aria-live="polite">
                  {q}
                </span>
                <button
                  type="button"
                  onClick={() => step(i.id, 1, max)}
                  disabled={q >= max}
                  aria-label={tx({
                    fr: `Ajouter ${i.name}`,
                    en: `Add ${i.name}`,
                    ar: `إضافة ${i.name}`,
                  })}
                  className="flex size-9 items-center justify-center rounded-full border-2 border-[#E4E8F7] transition-colors hover:border-ink disabled:opacity-40"
                >
                  <PlusIcon className="size-4" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {total > 0 && (
        <p className="m-0 px-1 text-sm font-bold text-court">
          {tx({
            fr: `À régler à l'accueil : ${total} ${rules.currency}`,
            en: `Pay at the desk: ${total} ${rules.currency}`,
            ar: `يُدفع في الاستقبال: ${total} ${rules.currency}`,
          })}
        </p>
      )}
    </fieldset>
  );
}
