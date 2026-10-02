import { useState } from "react";
import { useListAllTokenTransactions, useListUsers } from "@workspace/api-client-react";
import type { TokenTransaction, ListAllTokenTransactionsParams } from "@workspace/api-client-react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CoinsIcon,
  PlusIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, Page, PageHeader } from "@/components/smash/primitives";
import {
  DataTable,
  Pagination,
  Pill,
  Toolbar,
  type Column,
  type Tone,
} from "@/components/smash/admin";
import { TokenAdjustDialog } from "@/components/smash/token-adjust";
import { useTx, useI18n } from "@/lib/i18n";
import { clubDateTime } from "@/lib/club-time";
import { memberName } from "@/lib/labels";

const PAGE = 25;

export default function AdminTokens() {
  const tx = useTx();
  const { lang } = useI18n();
  const [page, setPage] = useState(1);
  const [userFilter, setUserFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useListAllTokenTransactions({
    page,
    limit: PAGE,
    userId: userFilter === "all" ? undefined : parseInt(userFilter),
    type: typeFilter === "all" ? undefined : (typeFilter as ListAllTokenTransactionsParams["type"]),
  });
  const { data: users } = useListUsers({ limit: 200 });

  const rows = data?.data ?? [];
  const credited = rows.filter((r) => r.type === "credit").reduce((s, r) => s + r.amount, 0);
  const debited = rows.filter((r) => r.type === "debit").reduce((s, r) => s + r.amount, 0);
  // Summed by the API over every member (the list below is only the filter's first page)
  const circulating = data?.circulating ?? 0;

  const meta: Record<string, { tone: Tone; icon: typeof CoinsIcon; label: string; sign: string }> =
    {
      credit: {
        tone: "success",
        icon: ArrowDownLeftIcon,
        label: tx({ fr: "Crédit", en: "Credit", ar: "إضافة" }),
        sign: "+",
      },
      debit: {
        tone: "info",
        icon: ArrowUpRightIcon,
        label: tx({ fr: "Débit", en: "Debit", ar: "خصم" }),
        sign: "−",
      },
      adjustment: {
        tone: "muted",
        icon: ArrowsClockwiseIcon,
        label: tx({ fr: "Ajustement", en: "Adjustment", ar: "تعديل" }),
        sign: "=",
      },
    };

  const columns: Column<TokenTransaction>[] = [
    {
      key: "member",
      header: tx({ fr: "Membre", en: "Member", ar: "العضو" }),
      cell: (t) => (
        <span className="flex items-center gap-3">
          <Avatar name={memberName(t.user)} index={t.userId} size={38} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-bold">{memberName(t.user) || `#${t.userId}`}</span>
            <span className="truncate text-xs text-muted-foreground">{t.user?.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (t) => {
        const m = meta[t.type] ?? meta.adjustment;
        return (
          <Pill tone={m.tone}>
            <m.icon className="size-3.5" />
            {m.label}
          </Pill>
        );
      },
    },
    {
      key: "desc",
      header: tx({ fr: "Motif", en: "Reason", ar: "السبب" }),
      hideBelow: "md",
      cell: (t) => (
        <span className="flex max-w-[320px] flex-col">
          <span className="truncate text-sm font-semibold">{t.description}</span>
          {t.notes && <span className="truncate text-xs text-muted-foreground">{t.notes}</span>}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      hideBelow: "lg",
      cell: (t) => (
        <span className="text-sm text-muted-foreground">{clubDateTime(t.createdAt, lang)}</span>
      ),
    },
    {
      key: "amount",
      header: tx({ fr: "Montant", en: "Amount", ar: "المبلغ" }),
      align: "end",
      cell: (t) => (
        <span className="flex flex-col items-end">
          <span className={`disp text-xl ${t.type === "credit" ? "text-success" : ""}`}>
            {(meta[t.type] ?? meta.adjustment).sign}
            {t.amount}
          </span>
          {t.balanceAfter != null && (
            <span className="text-xs text-muted-foreground">
              {tx({ fr: "solde", en: "balance", ar: "الرصيد" })} {t.balanceAfter}
            </span>
          )}
        </span>
      ),
    },
  ];

  const kpis = [
    {
      label: tx({ fr: "En circulation", en: "In circulation", ar: "المتداول" }),
      value: circulating,
      tone: "bg-ball text-night",
    },
    {
      label: tx({ fr: "Crédités (page)", en: "Credited (page)", ar: "المضاف (الصفحة)" }),
      value: `+${credited}`,
      tone: "bg-card",
    },
    {
      label: tx({ fr: "Utilisés (page)", en: "Used (page)", ar: "المستخدم (الصفحة)" }),
      value: `−${debited}`,
      tone: "bg-card",
    },
  ];

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" })}
        subtitle={tx({
          fr: "Chaque crédit, débit et correction de solde, avec son motif.",
          en: "Every credit, debit and balance correction, with its reason.",
          ar: "كل إضافة وخصم وتصحيح مع السبب.",
        })}
        actions={
          <Button data-testid="btn-adjust-tokens" onClick={() => setOpen(true)}>
            <PlusIcon />
            {tx({ fr: "Créditer / débiter", en: "Credit / debit", ar: "إضافة / خصم" })}
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`enter flex flex-col gap-1 rounded-[24px] p-5 shadow-sm ${k.tone}`}
          >
            <span className="text-sm font-semibold opacity-80">{k.label}</span>
            <span className="disp text-[36px] leading-none">{k.value}</span>
          </div>
        ))}
      </div>
      <Toolbar
        showClear={userFilter !== "all" || typeFilter !== "all"}
        onClear={() => {
          setUserFilter("all");
          setTypeFilter("all");
          setPage(1);
        }}
      >
        <Select
          value={userFilter}
          onValueChange={(v) => {
            setUserFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger
            className="w-full sm:w-[230px]"
            aria-label={tx({
              fr: "Filtrer par membre",
              en: "Filter by member",
              ar: "تصفية حسب العضو",
            })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {tx({ fr: "Tous les membres", en: "All members", ar: "كل الأعضاء" })}
            </SelectItem>
            {users?.data?.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {memberName(u)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger
            className="w-full sm:w-[180px]"
            aria-label={tx({ fr: "Filtrer par type", en: "Filter by type", ar: "تصفية حسب النوع" })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {tx({ fr: "Tous les types", en: "All types", ar: "كل الأنواع" })}
            </SelectItem>
            {Object.entries(meta).map(([k, m]) => (
              <SelectItem key={k} value={k}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>
      <DataTable
        caption={tx({ fr: "Transactions", en: "Transactions", ar: "المعاملات" })}
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(t) => t.id}
        empty={
          <span className="flex flex-col items-center gap-2 text-muted-foreground">
            <CoinsIcon className="size-8" />
            {tx({ fr: "Aucune transaction.", en: "No transactions.", ar: "لا معاملات." })}
          </span>
        }
        footer={
          data && <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} />
        }
      />
      <TokenAdjustDialog open={open} onOpenChange={setOpen} />
    </Page>
  );
}
