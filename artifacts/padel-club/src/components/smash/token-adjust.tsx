import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdjustUserTokens,
  useGetUser,
  getListUsersQueryKey,
  getGetUserQueryKey,
  getListAllTokenTransactionsQueryKey,
  getGetTokenBalanceQueryKey,
} from "@workspace/api-client-react";
import { ArrowRightIcon, CoinsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Segmented } from "@/components/smash/admin";
import { Avatar } from "@/components/smash/primitives";
import { MemberPicker } from "@/components/smash/member-picker";
import type { User } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";
import { memberName, plural, tokensLabel } from "@/lib/labels";
import { apiErrorText } from "@/lib/api-errors";

type Kind = "credit" | "debit" | "adjustment";

/** Credit / debit a member's tokens. Pass `userId` to lock the member, or leave it empty to pick one. */
export function TokenAdjustDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: number | null;
}) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const adjust = useAdjustUserTokens();
  const { data: locked } = useGetUser(userId ?? 0, { query: { enabled: open && !!userId } });
  const [picked, setPicked] = useState<User | null>(null);
  // One key per dialog opening: a double click or a retry can't credit twice
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [kind, setKind] = useState<Kind>("credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  // Desk sale: a pack from Réglages → Tokens, and/or the cash received (accounting)
  const [packageId, setPackageId] = useState<number | null>(null);
  const [cash, setCash] = useState("");
  const rules = useClubRules();

  useEffect(() => {
    if (open) {
      setPicked(null);
      setKind("credit");
      setAmount("");
      setDescription("");
      setNotes("");
      setPackageId(null);
      setCash("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open, userId]);

  const member = userId ? locked : picked;
  const memberId = member ? String(member.id) : "";
  const n = parseInt(amount) || 0;
  const current = member?.tokenBalance ?? 0;
  const next = kind === "credit" ? current + n : kind === "debit" ? current - n : n;
  const presets =
    kind === "debit"
      ? [...new Set([rules.tokenCostPlayer, rules.tokenCostFullCourt])].filter((p) => p > 0)
      : [1, 2, 3, 5].map((k) => k * rules.tokenCostFullCourt).filter((p) => p > 0);
  const cashValue = cash.trim() === "" ? null : Number(cash);
  const reasons =
    kind === "credit"
      ? [
          tx({ fr: "Recharge à l'accueil", en: "Front desk top-up", ar: "شحن في الاستقبال" }),
          tx({ fr: "Geste commercial", en: "Goodwill gesture", ar: "لفتة تجارية" }),
          tx({ fr: "Gain de tournoi", en: "Tournament prize", ar: "جائزة بطولة" }),
        ]
      : kind === "debit"
        ? [
            tx({
              fr: "Match payé à l'accueil",
              en: "Match paid at the desk",
              ar: "مباراة مدفوعة في الاستقبال",
            }),
            tx({ fr: "Correction", en: "Correction", ar: "تصحيح" }),
          ]
        : [tx({ fr: "Correction du solde", en: "Balance correction", ar: "تصحيح الرصيد" })];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !memberId ||
      (kind === "adjustment" ? n < 0 || amount === "" : n <= 0) ||
      !description.trim()
    ) {
      toast({
        title: tx({
          fr: "Membre, montant et motif sont requis",
          en: "Member, amount and reason are required",
          ar: "العضو والمبلغ والسبب مطلوبة",
        }),
        variant: "destructive",
      });
      return;
    }
    if (cashValue !== null && (!Number.isFinite(cashValue) || cashValue < 0)) {
      toast({
        title: tx({
          fr: "Montant en espèces invalide",
          en: "Invalid cash amount",
          ar: "مبلغ غير صالح",
        }),
        variant: "destructive",
      });
      return;
    }
    if (kind === "debit" && next < 0) {
      toast({
        title: tx({
          fr: "Le solde ne peut pas devenir négatif",
          en: "Balance can't go below zero",
          ar: "لا يمكن أن يصبح الرصيد سالبًا",
        }),
        variant: "destructive",
      });
      return;
    }
    adjust.mutate(
      {
        data: {
          userId: parseInt(memberId),
          amount: n,
          type: kind,
          description: description.trim(),
          notes: notes || undefined,
          idempotencyKey,
          ...(kind === "credit" && packageId ? { packageId } : {}),
          ...(kind === "credit" && cashValue !== null ? { cashAmount: cashValue } : {}),
        },
      },
      {
        onSuccess: () => {
          toast({
            title:
              kind === "credit"
                ? tx({
                    fr: `${tokensLabel(n)} ${plural(n, "crédité", "crédités")}`,
                    en: `${tokensLabel(n)} credited`,
                    ar: `تمت إضافة ${n}`,
                  })
                : kind === "debit"
                  ? tx({
                      fr: `${tokensLabel(n)} ${plural(n, "débité", "débités")}`,
                      en: `${tokensLabel(n)} debited`,
                      ar: `تم خصم ${n}`,
                    })
                  : tx({ fr: "Solde corrigé", en: "Balance corrected", ar: "تم تصحيح الرصيد" }),
            description: member ? memberName(member) : undefined,
          });
          qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
          qc.invalidateQueries({ queryKey: getGetUserQueryKey(parseInt(memberId)) });
          qc.invalidateQueries({ queryKey: getListAllTokenTransactionsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
          onOpenChange(false);
        },
        onError: (err) =>
          toast({
            title: tx({
              fr: "Opération impossible",
              en: "Couldn't update tokens",
              ar: "تعذرت العملية",
            }),
            description: apiErrorText(err, tx),
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader className="text-start">
          <DialogTitle>
            {tx({ fr: "Gérer les tokens", en: "Manage tokens", ar: "إدارة الرصيد" })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              fr: `Une place = ${tokensLabel(rules.tokenCostPlayer)} · terrain complet = ${tokensLabel(rules.tokenCostFullCourt)}.`,
              en: `One spot = ${tokensLabel(rules.tokenCostPlayer)} · full court = ${tokensLabel(rules.tokenCostFullCourt)}.`,
              ar: `مكان = ${rules.tokenCostPlayer} · ملعب كامل = ${rules.tokenCostFullCourt}`,
            })}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {userId && member ? (
            <div className="flex items-center gap-3 rounded-[20px] bg-mist p-3">
              <Avatar name={memberName(member)} index={member.id} size={44} />
              <span className="flex flex-col">
                <span className="font-bold">{memberName(member)}</span>
                <span className="text-sm text-muted-foreground">{member.email}</span>
              </span>
            </div>
          ) : (
            <Field label={tx({ fr: "Membre", en: "Member", ar: "العضو" })} required>
              <MemberPicker value={picked} onChange={setPicked} />
            </Field>
          )}
          <Segmented
            label={tx({ fr: "Opération", en: "Operation", ar: "العملية" })}
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              setDescription("");
              setPackageId(null);
              setCash("");
            }}
            options={[
              { value: "credit", label: tx({ fr: "Créditer", en: "Credit", ar: "إضافة" }) },
              { value: "debit", label: tx({ fr: "Débiter", en: "Debit", ar: "خصم" }) },
              {
                value: "adjustment",
                label: tx({ fr: "Fixer le solde", en: "Set balance", ar: "تحديد الرصيد" }),
              },
            ]}
          />
          {kind === "credit" && rules.tokenPackages.length > 0 && (
            <Field label={tx({ fr: "Vendre un pack", en: "Sell a pack", ar: "بيع باقة" })}>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {rules.tokenPackages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={packageId === p.id}
                    onClick={() => {
                      setPackageId(p.id);
                      setAmount(String(p.tokens));
                      setCash(String(p.price));
                      setDescription(`${p.name} (${p.tokens} tokens)`);
                    }}
                    className={cn(
                      "h-12 rounded-full border-2 px-4 text-sm font-bold transition-colors",
                      packageId === p.id
                        ? "border-ink bg-ink text-white"
                        : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                    )}
                  >
                    {p.name} · {p.price} {rules.currency}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field
            label={
              kind === "adjustment"
                ? tx({ fr: "Nouveau solde", en: "New balance", ar: "الرصيد الجديد" })
                : tx({ fr: "Nombre de tokens", en: "Number of tokens", ar: "عدد الرصيد" })
            }
            htmlFor="tk-amount"
            required
          >
            <div className="flex flex-wrap gap-2">
              <Input
                id="tk-amount"
                data-testid="input-token-amount"
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setPackageId(null);
                }}
                className="w-28"
                placeholder="0"
              />
              {kind !== "adjustment" &&
                presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setAmount(String(p));
                      setPackageId(null);
                    }}
                    className={cn(
                      "h-12 min-w-12 rounded-full border-2 px-4 font-bold transition-colors",
                      amount === String(p)
                        ? "border-ink bg-ink text-white"
                        : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                    )}
                  >
                    {kind === "debit" ? "−" : "+"}
                    {p}
                  </button>
                ))}
            </div>
          </Field>
          <Field
            label={tx({ fr: "Motif", en: "Reason", ar: "السبب" })}
            htmlFor="tk-desc"
            required
            hint={tx({
              fr: "Visible par le joueur dans son portefeuille.",
              en: "Shown to the player in their wallet.",
              ar: "يظهر للاعب في محفظته.",
            })}
          >
            <Input
              id="tk-desc"
              data-testid="input-token-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDescription(r)}
                  className="h-8 rounded-full bg-secondary px-3 text-xs font-bold text-body hover:bg-[#DCE2F8]"
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>
          {kind === "credit" && (
            <Field
              label={tx({
                fr: `Espèces reçues (${rules.currency})`,
                en: `Cash received (${rules.currency})`,
                ar: `المبلغ المستلم (${rules.currency})`,
              })}
              htmlFor="tk-cash"
              hint={tx({
                fr: `Pour la caisse et l'historique. Vide = cadeau ou correction. Ex : ${n || 10} × ${rules.tokenUnitPrice} = ${(n || 10) * rules.tokenUnitPrice} ${rules.currency}.`,
                en: `For the till and history. Empty = gift or correction. e.g. ${n || 10} × ${rules.tokenUnitPrice} = ${(n || 10) * rules.tokenUnitPrice} ${rules.currency}.`,
                ar: "للصندوق والسجل. فارغ = هدية أو تصحيح.",
              })}
            >
              <Input
                id="tk-cash"
                data-testid="input-token-cash"
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="w-40"
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={tx({ fr: "Note interne", en: "Internal note", ar: "ملاحظة داخلية" })}
              htmlFor="tk-notes"
              hint={tx({
                fr: "Visible par les admins uniquement.",
                en: "Admins only.",
                ar: "للمسؤولين فقط.",
              })}
              className="sm:col-span-2"
            >
              <Input
                id="tk-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tx({
                  fr: "Ex : payé en espèces",
                  en: "e.g. paid cash",
                  ar: "مثال: دفع نقدًا",
                })}
              />
            </Field>
          </div>
          {member && n > 0 && (
            <div
              className={cn(
                "flex items-center justify-between rounded-[20px] px-5 py-4",
                next < 0 ? "bg-[#FDE4E4] text-[#A3262B]" : "bg-ball text-night",
              )}
              aria-live="polite"
            >
              <span className="flex items-center gap-2 font-bold">
                <CoinsIcon className="size-4" />
                {tx({ fr: "Solde", en: "Balance", ar: "الرصيد" })}
              </span>
              <span className="flex items-center gap-3 font-extrabold">
                <span className="opacity-70">{current}</span>
                <ArrowRightIcon className="size-4 rtl:scale-x-[-1]" />
                <span className="disp text-2xl">{next}</span>
              </span>
            </div>
          )}
          <Button
            data-testid="btn-confirm-tokens"
            type="submit"
            size="lg"
            disabled={adjust.isPending}
            loading={adjust.isPending}
          >
            {adjust.isPending
              ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" })
              : tx({ fr: "Valider", en: "Confirm", ar: "تأكيد" })}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
