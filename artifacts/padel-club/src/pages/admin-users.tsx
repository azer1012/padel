import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { Coins, Users as UsersIcon, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Page, PageHeader } from "@/components/smash/primitives";
import {
  DataTable,
  Pagination,
  Pill,
  SearchInput,
  Toolbar,
  displayName,
  type Column,
} from "@/components/smash/admin";
import { TokenAdjustDialog } from "@/components/smash/token-adjust";
import { useTx, useDateLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PAGE = 20;

export default function AdminUsers() {
  const tx = useTx();
  const locale = useDateLocale();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tokenUser, setTokenUser] = useState<number | null>(null);

  // Debounce so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params: Record<string, any> = { page, limit: PAGE };
  if (query) params.search = query;
  const { data, isLoading } = useListUsers(params, {
    query: { queryKey: getListUsersQueryKey(params) },
  });

  const columns: Column<User>[] = [
    {
      key: "member",
      header: tx({ fr: "Membre", en: "Member", ar: "العضو" }),
      cell: (u) => (
        <span className="flex items-center gap-3">
          <Avatar name={displayName(u)} index={u.id} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 truncate font-bold">
              {displayName(u)}
              {u.role === "admin" && (
                <Pill tone="court" className="h-6">
                  Admin
                </Pill>
              )}
            </span>
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Mail className="size-3" />
              {u.email}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "phone",
      header: tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" }),
      hideBelow: "lg",
      cell: (u) =>
        u.phone ? (
          <a href={`tel:${u.phone}`} className="ulink flex items-center gap-1.5 text-sm" dir="ltr">
            <Phone className="size-3.5" />
            {u.phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "joined",
      header: tx({ fr: "Membre depuis", en: "Joined", ar: "انضم" }),
      hideBelow: "md",
      cell: (u) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(u.createdAt), "d MMM yyyy", { locale })}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Tokens",
      cell: (u) => {
        const b = u.tokenBalance ?? 0;
        return (
          <span
            className={cn(
              "inline-flex h-8 min-w-12 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-extrabold",
              b === 0
                ? "bg-[#FDE4E4] text-[#A3262B]"
                : b < 4
                  ? "bg-[#FFEBD9] text-[#9A4A12]"
                  : "bg-ball text-night",
            )}
          >
            <Coins className="size-3.5" />
            {b}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "end",
      cell: (u) => (
        <Button
          data-testid={`btn-manage-tokens-${u.id}`}
          variant="outline"
          size="sm"
          onClick={() => setTokenUser(u.id)}
        >
          <Coins />
          {tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" })}
        </Button>
      ),
    },
  ];

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Membres", en: "Members", ar: "الأعضاء" })}
        subtitle={
          data
            ? tx({
                fr: `${data.total} joueur(s) inscrit(s). Recherchez un membre pour gérer ses tokens.`,
                en: `${data.total} registered player(s). Find a member to manage their tokens.`,
                ar: `${data.total} لاعب مسجل.`,
              })
            : undefined
        }
      />
      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tx({ fr: "Nom ou email…", en: "Name or email…", ar: "الاسم أو البريد…" })}
        />
      </Toolbar>
      <DataTable
        caption={tx({ fr: "Membres", en: "Members", ar: "الأعضاء" })}
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        rowKey={(u) => u.id}
        rowTestId={(u) => `row-user-${u.id}`}
        empty={
          <span className="flex flex-col items-center gap-2 text-muted-foreground">
            <UsersIcon className="size-8" />
            {query
              ? tx({
                  fr: `Aucun membre pour « ${query} ».`,
                  en: `No member matches “${query}”.`,
                  ar: `لا عضو يطابق «${query}».`,
                })
              : tx({
                  fr: "Aucun membre pour l'instant.",
                  en: "No members yet.",
                  ar: "لا أعضاء بعد.",
                })}
          </span>
        }
        footer={
          data && <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} />
        }
      />
      <TokenAdjustDialog
        open={tokenUser !== null}
        onOpenChange={(o) => !o && setTokenUser(null)}
        userId={tokenUser}
      />
    </Page>
  );
}
