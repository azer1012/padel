import { useCallback, useRef, useState, type ReactNode } from "react";
import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ─────────── Status pills ─────────── */

export type Tone = "success" | "danger" | "warning" | "info" | "lime" | "court" | "muted" | "lilac";
const TONES: Record<Tone, string> = {
  success: "bg-[#DDF5E7] text-[#0F6B3C]",
  danger: "bg-[#FDE4E4] text-[#A3262B]",
  warning: "bg-[#FFEBD9] text-[#9A4A12]",
  info: "bg-[#EEF1FF] text-court",
  lime: "bg-ball text-night",
  court: "bg-court text-white",
  muted: "bg-secondary text-muted-foreground",
  lilac: "bg-lilac text-night",
};

export function Pill({
  tone = "muted",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-extrabold transition-colors duration-300 [&_svg]:size-3.5",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─────────── Toolbar (filters / search) ─────────── */

export function Toolbar({
  children,
  onClear,
  showClear,
}: {
  children: ReactNode;
  onClear?: () => void;
  showClear?: boolean;
}) {
  const tx = useTx();
  return (
    <div className="enter flex flex-wrap items-center gap-2.5 rounded-[24px] bg-card p-3 shadow-sm">
      {children}
      {showClear && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="ms-auto">
          <XIcon />
          {tx({ fr: "Effacer", en: "Clear", ar: "مسح" })}
        </Button>
      )}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("group relative min-w-[220px] flex-1", className)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-[color,scale] duration-300 group-focus-within:scale-110 group-focus-within:text-court" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="ps-11"
      />
    </div>
  );
}

/* ─────────── Data table ─────────── */

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** hide below this breakpoint */
  hideBelow?: "sm" | "md" | "lg";
  align?: "start" | "end";
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  footer,
  caption,
  rowTestId,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (r: T) => string | number;
  loading?: boolean;
  empty: ReactNode;
  footer?: ReactNode;
  caption: string;
  rowTestId?: (r: T) => string;
}) {
  return (
    <div className="enter overflow-hidden rounded-[28px] bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[15px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-[#E4E8F7]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-5 py-4 text-xs font-extrabold uppercase tracking-[.12em] text-muted-foreground rtl:tracking-normal",
                    c.align === "end" ? "text-end" : "text-start",
                    c.hideBelow && HIDE[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger">
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-[#EEF1FA] last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-5 py-4", c.hideBelow && HIDE[c.hideBelow])}>
                        <Skeleton className="h-5 w-full max-w-[160px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((r) => (
                  <tr
                    key={rowKey(r)}
                    data-testid={rowTestId?.(r)}
                    className="border-b border-[#EEF1FA] transition-colors last:border-0 hover:bg-mist/70"
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-5 py-3.5 align-middle",
                          c.align === "end" && "text-end",
                          c.hideBelow && HIDE[c.hideBelow],
                          c.className,
                        )}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && !rows?.length && <div className="px-6 py-14 text-center">{empty}</div>}
      {footer}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const tx = useTx();
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1,
    to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#E4E8F7] px-5 py-3.5">
      <span className="text-sm text-muted-foreground">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label={tx({ fr: "Page précédente", en: "Previous page", ar: "الصفحة السابقة" })}
        >
          <CaretLeftIcon className="rtl:scale-x-[-1]" />
        </Button>
        <span className="min-w-[56px] text-center text-sm font-bold">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label={tx({ fr: "Page suivante", en: "Next page", ar: "الصفحة التالية" })}
        >
          <CaretRightIcon className="rtl:scale-x-[-1]" />
        </Button>
      </div>
    </div>
  );
}

/* ─────────── Forms ─────────── */

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ms-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {hint && <p className="m-0 mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-full bg-secondary p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 flex-1 rounded-full px-4 text-sm font-bold transition-[color,background-color,box-shadow,transform] duration-300 active:scale-95",
            value === o.value
              ? "bg-card text-ink shadow-sm"
              : "text-muted-foreground hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────── Confirm dialog (replaces window.confirm) ─────────── */

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

export function useConfirm() {
  const tx = useTx();
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <AlertDialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent className="max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && (
            <AlertDialogDescription className="text-base">
              {opts.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-12 rounded-full" onClick={() => close(false)}>
            {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "h-12 rounded-full",
              opts?.destructive && "bg-destructive hover:bg-destructive/90",
            )}
            onClick={() => close(true)}
          >
            {opts?.confirmLabel ?? tx({ fr: "Confirmer", en: "Confirm", ar: "تأكيد" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { confirm, dialog };
}

/* ─────────── Small helpers ─────────── */

/** Value for <input type="datetime-local"> in the user's local time (not UTC). */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function displayName(
  u?: { firstName?: string | null; lastName?: string | null; email?: string } | null,
) {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "";
}
