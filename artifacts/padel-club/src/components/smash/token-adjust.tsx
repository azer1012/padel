import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdjustUserTokens, useListUsers, getListUsersQueryKey, getGetUserQueryKey, getListAllTokenTransactionsQueryKey, getGetTokenBalanceQueryKey,
} from "@workspace/api-client-react";
import { ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Segmented, displayName } from "@/components/smash/admin";
import { Avatar } from "@/components/smash/primitives";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Kind = "credit" | "debit" | "adjustment";

/** Credit / debit a member's tokens. Pass `userId` to lock the member, or leave it empty to pick one. */
export function TokenAdjustDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (o: boolean) => void; userId?: number | null }) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const adjust = useAdjustUserTokens();
  const { data: users } = useListUsers({ limit: 200 } as any, { query: { enabled: open, queryKey: getListUsersQueryKey({ limit: 200 } as any) } });
  const [memberId, setMemberId] = useState("");
  const [kind, setKind] = useState<Kind>("credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (open) { setMemberId(userId ? String(userId) : ""); setKind("credit"); setAmount(""); setDescription(""); setNotes(""); setExpiresAt(""); }
  }, [open, userId]);

  const member = users?.data?.find((u) => String(u.id) === memberId);
  const n = parseInt(amount) || 0;
  const current = member?.tokenBalance ?? 0;
  const next = kind === "credit" ? current + n : kind === "debit" ? current - n : n;
  const presets = kind === "debit" ? [1, 4] : [4, 8, 12, 20];
  const reasons = kind === "credit"
    ? [tx({ fr: "Recharge à l'accueil", en: "Front desk top-up", ar: "شحن في الاستقبال" }), tx({ fr: "Geste commercial", en: "Goodwill gesture", ar: "لفتة تجارية" }), tx({ fr: "Gain de tournoi", en: "Tournament prize", ar: "جائزة بطولة" })]
    : kind === "debit" ? [tx({ fr: "Match payé à l'accueil", en: "Match paid at the desk", ar: "مباراة مدفوعة في الاستقبال" }), tx({ fr: "Correction", en: "Correction", ar: "تصحيح" })]
    : [tx({ fr: "Correction du solde", en: "Balance correction", ar: "تصحيح الرصيد" })];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId || n <= 0 || !description.trim()) {
      toast({ title: tx({ fr: "Membre, montant et motif sont requis", en: "Member, amount and reason are required", ar: "العضو والمبلغ والسبب مطلوبة" }), variant: "destructive" });
      return;
    }
    if (kind === "debit" && next < 0) {
      toast({ title: tx({ fr: "Le solde ne peut pas devenir négatif", en: "Balance can't go below zero", ar: "لا يمكن أن يصبح الرصيد سالبًا" }), variant: "destructive" });
      return;
    }
    adjust.mutate({ data: { userId: parseInt(memberId), amount: n, type: kind, description: description.trim(), notes: notes || undefined, expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : undefined } }, {
      onSuccess: () => {
        toast({ title: kind === "credit" ? tx({ fr: `${n} token(s) crédité(s)`, en: `${n} token(s) credited`, ar: `تمت إضافة ${n}` }) : kind === "debit" ? tx({ fr: `${n} token(s) débité(s)`, en: `${n} token(s) debited`, ar: `تم خصم ${n}` }) : tx({ fr: "Solde corrigé", en: "Balance corrected", ar: "تم تصحيح الرصيد" }),
          description: member ? displayName(member) : undefined });
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        qc.invalidateQueries({ queryKey: getGetUserQueryKey(parseInt(memberId)) });
        qc.invalidateQueries({ queryKey: getListAllTokenTransactionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
        onOpenChange(false);
      },
      onError: (err: any) => toast({ title: tx({ fr: "Opération impossible", en: "Couldn't update tokens", ar: "تعذرت العملية" }), description: err?.data?.error, variant: "destructive" }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader className="text-start">
          <DialogTitle>{tx({ fr: "Gérer les tokens", en: "Manage tokens", ar: "إدارة الرصيد" })}</DialogTitle>
          <DialogDescription>{tx({ fr: "1 token = 1 place de joueur pour un match.", en: "1 token = 1 player spot for one match.", ar: "رصيد واحد = مكان لاعب لمباراة." })}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {userId && member ? (
            <div className="flex items-center gap-3 rounded-[20px] bg-mist p-3">
              <Avatar name={displayName(member)} index={member.id} size={44} />
              <span className="flex flex-col"><span className="font-bold">{displayName(member)}</span><span className="text-sm text-muted-foreground">{member.email}</span></span>
            </div>
          ) : (
            <Field label={tx({ fr: "Membre", en: "Member", ar: "العضو" })} required>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger data-testid="select-token-user"><SelectValue placeholder={tx({ fr: "Choisir un membre", en: "Choose a member", ar: "اختر عضوًا" })} /></SelectTrigger>
                <SelectContent>{users?.data?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{displayName(u)} · {u.tokenBalance ?? 0} tokens</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Segmented label={tx({ fr: "Opération", en: "Operation", ar: "العملية" })} value={kind} onChange={(v) => { setKind(v as Kind); setDescription(""); }} options={[
            { value: "credit", label: tx({ fr: "Créditer", en: "Credit", ar: "إضافة" }) },
            { value: "debit", label: tx({ fr: "Débiter", en: "Debit", ar: "خصم" }) },
            { value: "adjustment", label: tx({ fr: "Fixer le solde", en: "Set balance", ar: "تحديد الرصيد" }) },
          ]} />
          <Field label={kind === "adjustment" ? tx({ fr: "Nouveau solde", en: "New balance", ar: "الرصيد الجديد" }) : tx({ fr: "Nombre de tokens", en: "Number of tokens", ar: "عدد الرصيد" })} htmlFor="tk-amount" required>
            <div className="flex flex-wrap gap-2">
              <Input id="tk-amount" data-testid="input-token-amount" type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" placeholder="0" />
              {kind !== "adjustment" && presets.map((p) => (
                <button key={p} type="button" onClick={() => setAmount(String(p))} className={cn("h-12 min-w-12 rounded-full border-2 px-4 font-bold transition-colors", amount === String(p) ? "border-ink bg-ink text-white" : "border-[#E4E8F7] hover:border-[#C6CEF6]")}>
                  {kind === "debit" ? "−" : "+"}{p}
                </button>
              ))}
            </div>
          </Field>
          <Field label={tx({ fr: "Motif", en: "Reason", ar: "السبب" })} htmlFor="tk-desc" required hint={tx({ fr: "Visible par le joueur dans son portefeuille.", en: "Shown to the player in their wallet.", ar: "يظهر للاعب في محفظته." })}>
            <Input id="tk-desc" data-testid="input-token-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasons.map((r) => <button key={r} type="button" onClick={() => setDescription(r)} className="h-8 rounded-full bg-secondary px-3 text-xs font-bold text-body hover:bg-[#DCE2F8]">{r}</button>)}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === "credit" && (
              <Field label={tx({ fr: "Expire le", en: "Expires on", ar: "ينتهي في" })} htmlFor="tk-exp" hint={tx({ fr: "Optionnel", en: "Optional", ar: "اختياري" })}>
                <Input id="tk-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            )}
            <Field label={tx({ fr: "Note interne", en: "Internal note", ar: "ملاحظة داخلية" })} htmlFor="tk-notes" hint={tx({ fr: "Visible par les admins uniquement.", en: "Admins only.", ar: "للمسؤولين فقط." })} className={kind === "credit" ? "" : "sm:col-span-2"}>
              <Input id="tk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tx({ fr: "Ex : payé en espèces", en: "e.g. paid cash", ar: "مثال: دفع نقدًا" })} />
            </Field>
          </div>
          {member && n > 0 && (
            <div className={cn("flex items-center justify-between rounded-[20px] px-5 py-4", next < 0 ? "bg-[#FDE4E4] text-[#A3262B]" : "bg-ball text-night")} aria-live="polite">
              <span className="flex items-center gap-2 font-bold"><Coins className="size-4" />{tx({ fr: "Solde", en: "Balance", ar: "الرصيد" })}</span>
              <span className="flex items-center gap-3 font-extrabold"><span className="opacity-70">{current}</span><ArrowRight className="size-4 rtl:scale-x-[-1]" /><span className="disp text-2xl">{next}</span></span>
            </div>
          )}
          <Button data-testid="btn-confirm-tokens" type="submit" size="lg" disabled={adjust.isPending}>
            {adjust.isPending ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" }) : tx({ fr: "Valider", en: "Confirm", ar: "تأكيد" })}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
