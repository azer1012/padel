import { useEffect, useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const fullName = (u: User) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;

/** Admin: find a member by name, email or phone. */
export function MemberPicker({
  value,
  onChange,
  excludeIds = [],
  autoFocus,
}: {
  value: User | null;
  onChange: (u: User | null) => void;
  excludeIds?: number[];
  autoFocus?: boolean;
}) {
  const tx = useTx();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const { data, isFetching } = useListUsers({ search: debounced || undefined, limit: 8 } as any, {
    query: { enabled: !value } as any,
  });
  const users = (data?.data ?? []).filter((u) => !excludeIds.includes(u.id));

  if (value)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{fullName(value)}</span>
          <span className="truncate text-xs text-muted-foreground">
            {value.email} · {value.tokenBalance} tokens
          </span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white"
          aria-label={tx({ fr: "Changer de membre", en: "Change member", ar: "تغيير العضو" })}
        >
          <X className="size-4" />
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={tx({
            fr: "Nom, email ou téléphone",
            en: "Name, email or phone",
            ar: "الاسم أو البريد أو الهاتف",
          })}
          className="ps-11"
          autoFocus={autoFocus}
          aria-label={tx({ fr: "Rechercher un membre", en: "Search a member", ar: "ابحث عن عضو" })}
        />
      </div>
      <ul
        className={cn(
          "m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-y-auto p-0",
          isFetching && "opacity-60",
        )}
      >
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onChange(u)}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start hover:bg-secondary"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{fullName(u)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-court">{u.tokenBalance} tk</span>
            </button>
          </li>
        ))}
        {!isFetching && users.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {tx({ fr: "Aucun membre trouvé", en: "No member found", ar: "لا يوجد عضو" })}
          </li>
        )}
      </ul>
    </div>
  );
}
