import { useState } from "react";
import { useCashReport, type CashReportLine } from "@workspace/api-client-react";
import {
  CashRegisterIcon,
  CoinsIcon,
  CreditCardIcon,
  DownloadSimpleIcon,
  ShoppingBagIcon,
  UsersIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { DataTable, Field, Pill, Toolbar, type Column, type Tone } from "@/components/smash/admin";
import { useI18n, useTx } from "@/lib/i18n";
import { addClubDays, clubDay, clubDateTime, clubTime, clubToday } from "@/lib/club-time";
import { ledgerLabel, money, tokensLabel } from "@/lib/labels";
import { CLUB } from "@/config/club";

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** One value of a CSV line: quoted when it holds the separator, a quote or a line break. */
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function AdminCash() {
  const tx = useTx();
  const { lang } = useI18n();
  const today = clubToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const valid = isDay(from) && isDay(to) && from <= to;
  const { data, isLoading, isError, refetch } = useCashReport(from, to, { enabled: valid });

  const KIND: Record<CashReportLine["kind"], { tone: Tone; label: string }> = {
    tokens: { tone: "lime", label: tx({ fr: "Tokens", en: "Tokens", ar: "رصيد" }) },
    spot: {
      tone: "info",
      label: tx({ fr: "Place au club", en: "Spot at the club", ar: "مكان في النادي" }),
    },
    order: { tone: "lilac", label: tx({ fr: "Boutique", en: "Shop", ar: "المتجر" }) },
    // Paid through the gateway: on the club's gateway account, never in the till
    online: {
      tone: "court",
      label: tx({ fr: "En ligne", en: "Online", ar: "عبر الإنترنت" }),
    },
  };
  /** The API files what was paid for in fixed wordings: shown in the reader's language. */
  const what = (l: CashReportLine) => {
    let m: RegExpMatchArray | null;
    if ((m = l.label.match(/^(\d+) token\(s\) · Online$/)))
      return `${tokensLabel(Number(m[1]))} · ${tx({ fr: "achat en ligne", en: "online purchase", ar: "شراء عبر الإنترنت" })}`;
    if ((m = l.label.match(/^(\d+) token\(s\) · (.*)$/s)))
      return `${tokensLabel(Number(m[1]))} · ${ledgerLabel(tx, m[2])}`;
    if ((m = l.label.match(/^Order #(\d+)$/)))
      return tx({ fr: `Commande n° ${m[1]}`, en: `Order #${m[1]}`, ar: `الطلب رقم ${m[1]}` });
    return l.label;
  };

  const ranges = [
    { label: tx({ fr: "Aujourd'hui", en: "Today", ar: "اليوم" }), from: today, to: today },
    {
      label: tx({ fr: "Hier", en: "Yesterday", ar: "أمس" }),
      from: addClubDays(today, -1),
      to: addClubDays(today, -1),
    },
    {
      label: tx({ fr: "7 jours", en: "7 days", ar: "7 أيام" }),
      from: addClubDays(today, -6),
      to: today,
    },
    {
      label: tx({ fr: "Ce mois", en: "This month", ar: "هذا الشهر" }),
      from: `${today.slice(0, 7)}-01`,
      to: today,
    },
  ];

  /** The lines as shown, in a file a spreadsheet opens (semicolons, UTF-8 with a mark). */
  function exportCsv() {
    if (!data) return;
    const head = [
      tx({ fr: "Date", en: "Date", ar: "التاريخ" }),
      tx({ fr: "Heure", en: "Time", ar: "الساعة" }),
      tx({ fr: "Type", en: "Type", ar: "النوع" }),
      tx({ fr: "Détail", en: "Detail", ar: "التفاصيل" }),
      tx({ fr: "Membre", en: "Member", ar: "العضو" }),
      tx({ fr: "Encaissé par", en: "Taken by", ar: "استلمه" }),
      tx({ fr: `Montant (${data.currency})`, en: `Amount (${data.currency})`, ar: "المبلغ" }),
    ];
    const rows = data.lines.map((l) => [
      clubDay(l.at),
      clubTime(l.at),
      KIND[l.kind].label,
      what(l),
      l.member,
      l.operator ?? "",
      l.amount.toFixed(2),
    ]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      tx({ fr: "Total espèces", en: "Total cash", ar: "مجموع النقد" }),
      data.totals.total.toFixed(2),
    ]);
    if (data.totals.online > 0)
      rows.push([
        "",
        "",
        "",
        "",
        "",
        tx({ fr: "Payé en ligne", en: "Paid online", ar: "مدفوع عبر الإنترنت" }),
        data.totals.online.toFixed(2),
      ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `caisse-${data.from}${data.to !== data.from ? `_${data.to}` : ""}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const columns: Column<CashReportLine>[] = [
    {
      key: "at",
      header: tx({ fr: "Quand", en: "When", ar: "متى" }),
      cell: (l) => <span className="text-sm">{clubDateTime(l.at, lang)}</span>,
    },
    {
      key: "kind",
      header: "Type",
      cell: (l) => <Pill tone={KIND[l.kind].tone}>{KIND[l.kind].label}</Pill>,
    },
    {
      key: "what",
      header: tx({ fr: "Détail", en: "Detail", ar: "التفاصيل" }),
      hideBelow: "md",
      cell: (l) => <span className="text-sm font-semibold">{what(l)}</span>,
    },
    {
      key: "member",
      header: tx({ fr: "Membre", en: "Member", ar: "العضو" }),
      cell: (l) => <span className="font-bold">{l.member}</span>,
    },
    {
      key: "operator",
      header: tx({ fr: "Encaissé par", en: "Taken by", ar: "استلمه" }),
      hideBelow: "lg",
      cell: (l) => <span className="text-sm text-muted-foreground">{l.operator ?? "—"}</span>,
    },
    {
      key: "amount",
      header: tx({ fr: "Montant", en: "Amount", ar: "المبلغ" }),
      align: "end",
      cell: (l) => (
        <span className="disp text-lg" dir="ltr">
          {money(l.amount)}
        </span>
      ),
    },
  ];

  const tiles = [
    {
      label: tx({ fr: "Tokens vendus", en: "Tokens sold", ar: "رصيد مُباع" }),
      value: data?.totals.tokens,
      icon: CoinsIcon,
      tone: "bg-card",
    },
    {
      label: tx({ fr: "Places payées au club", en: "Spots paid at the club", ar: "أماكن مدفوعة" }),
      value: data?.totals.spots,
      icon: UsersIcon,
      tone: "bg-card",
    },
    {
      label: tx({ fr: "Boutique", en: "Shop", ar: "المتجر" }),
      value: data?.totals.orders,
      icon: ShoppingBagIcon,
      tone: "bg-card",
    },
    {
      label: tx({ fr: "Total espèces", en: "Total cash", ar: "مجموع النقد" }),
      value: data?.totals.total,
      icon: CashRegisterIcon,
      tone: "bg-ball text-night",
    },
    // Only when something was paid online over the period: most clubs sell at the desk
    ...(data && data.totals.online > 0
      ? [
          {
            label: tx({
              fr: "Payé en ligne (hors caisse)",
              en: "Paid online (not in the till)",
              ar: "مدفوع عبر الإنترنت (خارج الصندوق)",
            }),
            value: data.totals.online,
            icon: CreditCardIcon,
            tone: "bg-night text-white",
          },
        ]
      : []),
  ];

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Caisse", en: "Cash report", ar: "الصندوق" })}
        subtitle={tx({
          fr: `Ce que l'accueil de ${CLUB.name} a encaissé en espèces : tokens vendus, places payées au club, commandes remises.`,
          en: `What the ${CLUB.name} front desk took in cash: tokens sold, spots paid at the club, orders handed over.`,
          ar: "ما استلمه الاستقبال نقدًا: الرصيد المُباع، الأماكن المدفوعة، الطلبات المسلَّمة.",
        })}
        actions={
          <Button
            onClick={exportCsv}
            disabled={!data?.lines.length}
            variant="secondary"
            data-testid="btn-export-cash"
          >
            <DownloadSimpleIcon />
            {tx({ fr: "Exporter (CSV)", en: "Export (CSV)", ar: "تصدير (CSV)" })}
          </Button>
        }
      />

      <Toolbar>
        <div
          role="group"
          aria-label={tx({ fr: "Période", en: "Period", ar: "الفترة" })}
          className="pill-group"
        >
          {ranges.map((r) => (
            <button
              key={r.label}
              type="button"
              className="pill-tab"
              aria-pressed={from === r.from && to === r.to}
              onClick={() => {
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Field label={tx({ fr: "Du", en: "From", ar: "من" })} htmlFor="cash-from">
          <Input
            id="cash-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={tx({ fr: "Au", en: "To", ar: "إلى" })} htmlFor="cash-to">
          <Input
            id="cash-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cash-totals">
        {tiles.map((k) => (
          <div
            key={k.label}
            className={`enter flex flex-col gap-2 rounded-[24px] p-5 shadow-sm ${k.tone}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold opacity-80">
              <k.icon className="size-4" />
              {k.label}
            </span>
            <span className="disp text-[32px] leading-none" dir="ltr">
              {k.value === undefined ? "–" : money(k.value)}{" "}
              <span className="text-base font-bold opacity-70">{data?.currency}</span>
            </span>
          </div>
        ))}
      </div>

      {isError ? (
        <ErrorState
          text={tx({
            fr: "La caisse n'a pas chargé.",
            en: "The cash report didn't load.",
            ar: "لم يتم تحميل الصندوق.",
          })}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          caption={tx({ fr: "Encaissements", en: "Cash taken", ar: "المقبوضات" })}
          columns={columns}
          rows={data?.lines}
          loading={isLoading}
          rowKey={(l) => `${l.kind}-${l.at}-${l.label}-${l.member}`}
          empty={
            <span className="flex flex-col items-center gap-2 text-muted-foreground">
              <CashRegisterIcon className="size-8" />
              {tx({
                fr: "Rien d'encaissé sur cette période.",
                en: "Nothing taken over this period.",
                ar: "لا مقبوضات في هذه الفترة.",
              })}
            </span>
          }
        />
      )}
    </Page>
  );
}
