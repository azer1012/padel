import { useState } from "react";
import {
  useListUsers,
  getListUsersQueryKey,
  useGetMe,
  useAdminUpdateUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
import {
  CoinsIcon,
  EnvelopeSimpleIcon,
  LockOpenIcon,
  PhoneIcon,
  ProhibitIcon,
  ShieldCheckIcon,
  ShieldSlashIcon,
  UsersIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Avatar, Page, PageHeader } from "@/components/smash/primitives";
import {
  DataTable,
  Pagination,
  Pill,
  SearchInput,
  Toolbar,
  type Column,
  useConfirm,
} from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { TokenAdjustDialog } from "@/components/smash/token-adjust";
import { useTx, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clubDate } from "@/lib/club-time";
import { memberName, plural, tokensLabel } from "@/lib/labels";
import { useDebounced } from "@/hooks/use-debounced";
import { apiErrorText } from "@/lib/api-errors";
import { useDemo } from "@/components/smash/demo";

const PAGE = 20;

export default function AdminUsers() {
  const tx = useTx();
  const { lang } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tokenUser, setTokenUser] = useState<number | null>(null);
  const { data: me } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateUser = useAdminUpdateUser();
  const { confirm, dialog } = useConfirm();
  const demo = useDemo();

  async function toggleAdmin(u: User) {
    const promote = u.role !== "admin";
    const ok = await confirm({
      title: promote
        ? tx({
            fr: `Donner l'accès admin à ${memberName(u)} ?`,
            en: `Give ${memberName(u)} admin access?`,
            ar: "منح صلاحية المسؤول؟",
          })
        : tx({
            fr: `Retirer l'accès admin de ${memberName(u)} ?`,
            en: `Remove ${memberName(u)}'s admin access?`,
            ar: "سحب صلاحية المسؤول؟",
          }),
      description: promote
        ? tx({
            fr: "Un admin gère les réservations, les tokens, les membres et les réglages du club.",
            en: "Admins manage bookings, tokens, members and club settings.",
            ar: "المسؤول يدير الحجوزات والرصيد والأعضاء والإعدادات.",
          })
        : undefined,
      confirmLabel: promote
        ? tx({ fr: "Donner l'accès", en: "Grant access", ar: "منح" })
        : tx({ fr: "Retirer", en: "Remove", ar: "سحب" }),
      destructive: !promote,
    });
    if (!ok) return;
    updateUser.mutate(
      { id: u.id, data: { role: promote ? "admin" : "player" } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: tx({ fr: "Rôle mis à jour", en: "Role updated", ar: "تم تحديث الدور" }) });
        },
        onError: (e) =>
          toast({
            title: tx({
              fr: "Action impossible",
              en: "Couldn't do that",
              ar: "تعذر تنفيذ الإجراء",
            }),
            description: apiErrorText(e, tx),
            variant: "destructive",
          }),
      },
    );
  }

  /** Blocks a member (they can no longer use the app) or lets them back in. */
  async function toggleBlocked(u: User) {
    const block = !u.blockedAt;
    const ok = await confirm({
      title: block
        ? tx({
            fr: `Bloquer ${memberName(u)} ?`,
            en: `Block ${memberName(u)}?`,
            ar: `حظر ${memberName(u)}؟`,
          })
        : tx({
            fr: `Débloquer ${memberName(u)} ?`,
            en: `Unblock ${memberName(u)}?`,
            ar: `إلغاء حظر ${memberName(u)}؟`,
          }),
      description: block
        ? tx({
            fr: "Ce membre ne pourra plus réserver, rejoindre un match ni commander. Ses réservations et ses tokens restent tels quels : annulez ses matchs depuis le planning si besoin.",
            en: "This member can no longer book, join a match or order. Their bookings and tokens stay as they are: cancel their matches from the planning if needed.",
            ar: "لن يتمكن هذا العضو من الحجز أو الانضمام أو الطلب. تبقى حجوزاته ورصيده كما هي.",
          })
        : tx({
            fr: "Ce membre pourra de nouveau utiliser l'application.",
            en: "This member can use the app again.",
            ar: "سيتمكن هذا العضو من استخدام التطبيق مجددًا.",
          }),
      confirmLabel: block
        ? tx({ fr: "Bloquer", en: "Block", ar: "حظر" })
        : tx({ fr: "Débloquer", en: "Unblock", ar: "إلغاء الحظر" }),
      destructive: block,
    });
    if (!ok) return;
    updateUser.mutate(
      { id: u.id, data: { blocked: block } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({
            title: block
              ? tx({ fr: "Membre bloqué", en: "Member blocked", ar: "تم حظر العضو" })
              : tx({ fr: "Membre débloqué", en: "Member unblocked", ar: "تم إلغاء الحظر" }),
          });
        },
        onError: (e) =>
          toast({
            title: tx({
              fr: "Action impossible",
              en: "Couldn't do that",
              ar: "تعذر تنفيذ الإجراء",
            }),
            description: apiErrorText(e, tx),
            variant: "destructive",
          }),
      },
    );
  }

  // Debounced so the API is not hit on every keystroke
  const query = useDebounced(search.trim(), 300);
  const { data, isLoading } = useListUsers({ page, limit: PAGE, search: query || undefined });

  const columns: Column<User>[] = [
    {
      key: "member",
      header: tx({ fr: "Membre", en: "Member", ar: "العضو" }),
      cell: (u) => (
        <span className="flex items-center gap-3">
          <Avatar name={memberName(u)} index={u.id} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 truncate font-bold">
              {memberName(u)}
              {u.role === "admin" && (
                <Pill tone="court" className="h-6">
                  Admin
                </Pill>
              )}
              {u.blockedAt && (
                <Pill tone="danger" className="h-6">
                  {tx({ fr: "Bloqué", en: "Blocked", ar: "محظور" })}
                </Pill>
              )}
            </span>
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <EnvelopeSimpleIcon className="size-3" />
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
            <PhoneIcon className="size-3.5" />
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
        <span className="text-sm text-muted-foreground">{clubDate(u.createdAt, lang, "date")}</span>
      ),
    },
    {
      key: "balance",
      header: tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" }),
      cell: (u) => {
        const b = u.tokenBalance ?? 0;
        return (
          <button
            type="button"
            onClick={() => setTokenUser(u.id)}
            aria-label={tx({
              fr: `${tokensLabel(b)}, gérer les tokens de ${memberName(u)}`,
              en: `${tokensLabel(b)}, manage ${memberName(u)}’s tokens`,
              ar: `${b} رصيد، إدارة رصيد ${memberName(u)}`,
            })}
            className={cn(
              "inline-flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-extrabold transition-transform hover:-translate-y-0.5 active:scale-95",
              b === 0
                ? "bg-[#FDE4E4] text-[#A3262B]"
                : b < 4
                  ? "bg-[#FFEBD9] text-[#9A4A12]"
                  : "bg-ball text-night",
            )}
          >
            <CoinsIcon className="size-3.5" />
            {b}
          </button>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "end",
      cell: (u) => (
        <span className="flex justify-end gap-2">
          <Button
            data-testid={`btn-manage-tokens-${u.id}`}
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => setTokenUser(u.id)}
          >
            <CoinsIcon />
            {tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" })}
          </Button>
          {/* The demo's roles are fixed: a visitor can't lock the next ones out */}
          {u.id !== me?.id && !demo && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleAdmin(u)}
              disabled={updateUser.isPending}
              aria-label={
                u.role === "admin"
                  ? tx({
                      fr: "Retirer l'accès admin",
                      en: "Remove admin access",
                      ar: "سحب صلاحية المسؤول",
                    })
                  : tx({ fr: "Donner l'accès admin", en: "Make admin", ar: "منح صلاحية المسؤول" })
              }
              title={
                u.role === "admin"
                  ? tx({
                      fr: "Retirer l'accès admin",
                      en: "Remove admin access",
                      ar: "سحب صلاحية المسؤول",
                    })
                  : tx({ fr: "Donner l'accès admin", en: "Make admin", ar: "منح صلاحية المسؤول" })
              }
            >
              {u.role === "admin" ? <ShieldSlashIcon /> : <ShieldCheckIcon />}
            </Button>
          )}
          {/* An admin is never blocked: their access is removed first */}
          {u.id !== me?.id && !demo && u.role !== "admin" && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={u.blockedAt ? undefined : "text-destructive"}
              onClick={() => toggleBlocked(u)}
              disabled={updateUser.isPending}
              data-testid={`btn-block-${u.id}`}
              aria-label={
                u.blockedAt
                  ? tx({
                      fr: `Débloquer ${memberName(u)}`,
                      en: `Unblock ${memberName(u)}`,
                      ar: `إلغاء حظر ${memberName(u)}`,
                    })
                  : tx({
                      fr: `Bloquer ${memberName(u)}`,
                      en: `Block ${memberName(u)}`,
                      ar: `حظر ${memberName(u)}`,
                    })
              }
              title={
                u.blockedAt
                  ? tx({ fr: "Débloquer", en: "Unblock", ar: "إلغاء الحظر" })
                  : tx({ fr: "Bloquer", en: "Block", ar: "حظر" })
              }
            >
              {u.blockedAt ? <LockOpenIcon /> : <ProhibitIcon />}
            </Button>
          )}
        </span>
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
                fr: `${data.total} ${plural(data.total, "joueur inscrit", "joueurs inscrits")}. Recherchez un membre pour gérer ses tokens.`,
                en: `${data.total} registered ${plural(data.total, "player", "players")}. Find a member to manage their tokens.`,
                ar: `${data.total} لاعب مسجل.`,
              })
            : undefined
        }
      />
      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={tx({
            fr: "Nom, email ou téléphone…",
            en: "Name, email or phone…",
            ar: "الاسم أو البريد أو الهاتف…",
          })}
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
      {dialog}
    </Page>
  );
}
