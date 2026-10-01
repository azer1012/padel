import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetTokenBalance,
  useListNotifications,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import {
  LayoutDashboard,
  CalendarDays,
  Wallet,
  User,
  Shield,
  Users,
  Coins,
  Newspaper,
  Trophy,
  LogOut,
  Menu,
  X,
  CalendarPlus,
  Swords,
  Bell,
  ArrowRight,
  Instagram,
  Facebook,
  MessageCircle,
  MapPin,
  Phone,
  Mail,
  Clock,
  Repeat,
  Tags,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Logo } from "@/components/smash/brand";
import { LiveDot } from "@/components/smash/primitives";
import { cn } from "@/lib/utils";
import { useI18n, useTx, useDateLocale, type Lang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useRevealFallback } from "@/hooks/use-reveal";
import { CLUB } from "@/config/club";

const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: "fr", label: "Français", short: "FR" },
  { value: "ar", label: "العربية", short: "ع" },
  { value: "en", label: "English", short: "EN" },
];

function LangSwitch({ dark = true, className }: { dark?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn(
        "flex items-center gap-1 rounded-full p-1",
        dark ? "bg-white/8" : "bg-secondary",
        className,
      )}
    >
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => setLang(l.value)}
          title={l.label}
          aria-pressed={lang === l.value}
          className={cn(
            "h-8 min-w-9 rounded-full px-2 text-xs font-extrabold transition-colors",
            lang === l.value
              ? dark
                ? "bg-white text-night"
                : "bg-ink text-white"
              : dark
                ? "text-white/70 hover:text-white"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Public (visitor) shell ───────────────────────── */

function PublicShell({ children }: { children: ReactNode }) {
  const tx = useTx();
  const { t } = useI18n();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const overHero = location === "/";

  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "/terrains", label: tx({ fr: "Réserver", en: "Book a court", ar: "احجز ملعبًا" }) },
    {
      href: "/open-matches",
      label: tx({ fr: "Open matches", en: "Open matches", ar: "مباريات مفتوحة" }),
    },
    { href: "/tournaments", label: t("tournaments") },
    { href: "/news", label: t("news") },
    { href: "/contact", label: t("contact") },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <a
        href="#main"
        className="sr-only z-[60] rounded-full bg-ball px-5 py-3 font-bold text-night focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {tx({ fr: "Aller au contenu", en: "Skip to content", ar: "انتقل إلى المحتوى" })}
      </a>
      <header
        className={cn(
          "on-dark sticky top-0 z-50 flex h-16 items-center justify-between border-b border-white/8 bg-night/90 px-4 text-white backdrop-blur-md lg:h-[76px] lg:px-12",
          overHero && !open && "nav-solid",
        )}
      >
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={location.startsWith(l.href) ? "page" : undefined}
              className="ulink text-[15px] font-semibold text-white/80 transition-colors hover:text-white aria-[current=page]:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LangSwitch className="hidden md:flex" />
          <Button asChild variant="outline-dark" size="sm" className="hidden lg:inline-flex">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
          <Button asChild variant="lime" size="sm" className="hidden sm:inline-flex">
            <Link href="/terrains">{t("bookCourt")}</Link>
          </Button>
          <button
            ref={menuBtn}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="public-menu"
            aria-label={
              open
                ? tx({ fr: "Fermer le menu", en: "Close menu", ar: "إغلاق القائمة" })
                : tx({ fr: "Ouvrir le menu", en: "Open menu", ar: "فتح القائمة" })
            }
            className="flex size-11 items-center justify-center rounded-full bg-white/10 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav
            id="public-menu"
            aria-label="Mobile"
            className="enter fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-y-auto bg-night px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 lg:hidden"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="disp border-b border-white/10 py-4 text-[36px] leading-none text-white"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-auto flex flex-col gap-3 pt-8">
              <LangSwitch className="self-start" />
              <Button asChild variant="lime" size="lg">
                <Link href="/terrains">{t("bookCourt")}</Link>
              </Button>
              <Button asChild variant="outline-dark" size="lg">
                <Link href="/sign-in">{t("signIn")}</Link>
              </Button>
            </div>
          </nav>
        )}
      </header>
      <main id="main" className={cn("flex-1", overHero && "-mt-16 lg:-mt-[76px]")}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  const tx = useTx();
  const { t } = useI18n();
  return (
    <footer className="on-dark relative overflow-clip bg-night text-white">
      <div className="flex flex-col gap-16 px-5 pb-10 pt-20 lg:px-16 lg:pt-28">
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 data-reveal="" className="disp m-0 text-[clamp(52px,8vw,120px)] leading-[0.9]">
            {tx({ fr: "Prêt à jouer ?", en: "Ready to play?", ar: "مستعد للعب؟" })}
          </h2>
          <Button asChild variant="lime" size="xl" data-reveal="late" className="w-full sm:w-auto">
            <Link href="/terrains">
              {tx({ fr: "Réserver mon terrain", en: "Book your court", ar: "احجز ملعبك" })}
              <ArrowRight className="btn-ic" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-10 border-t border-white/12 pt-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Logo />
            <p className="m-0 max-w-[340px] text-base leading-relaxed text-muted-d">
              {tx({
                fr: "Terrains indoor et outdoor, open matches et tournois. Réservez en quelques secondes.",
                en: "Indoor and outdoor courts, open matches and tournaments. Book in seconds.",
                ar: "ملاعب داخلية وخارجية، مباريات مفتوحة وبطولات. احجز في ثوانٍ.",
              })}
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-col gap-3 text-[15px] lg:col-span-2">
            <span className="label text-[#8A93C4]">
              {tx({ fr: "Club", en: "Club", ar: "النادي" })}
            </span>
            <Link href="/terrains" className="ulink self-start">
              {t("bookCourt")}
            </Link>
            <Link href="/open-matches" className="ulink self-start">
              Open matches
            </Link>
            <Link href="/tournaments" className="ulink self-start">
              {t("tournaments")}
            </Link>
            <Link href="/news" className="ulink self-start">
              {t("news")}
            </Link>
            <Link href="/contact" className="ulink self-start">
              {t("contact")}
            </Link>
          </nav>
          <div className="flex flex-col gap-3 text-[15px] text-soft-d lg:col-span-3">
            <span className="label text-[#8A93C4]">
              {tx({ fr: "Horaires", en: "Opening hours", ar: "ساعات العمل" })}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-ball" />
              {tx({ fr: "Tous les jours", en: "Every day", ar: "كل يوم" })}, {CLUB.hours}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-ball" />
              {CLUB.address}, {CLUB.postal}
            </span>
          </div>
          <div className="flex flex-col gap-3 text-[15px] text-soft-d lg:col-span-3">
            <span className="label text-[#8A93C4]">{t("contact")}</span>
            {CLUB.phone && (
              <a href={CLUB.phoneHref} className="ulink flex items-center gap-2 self-start">
                <Phone className="size-4 text-ball" />
                <span dir="ltr">{CLUB.phone}</span>
              </a>
            )}
            {CLUB.email && (
              <a href={`mailto:${CLUB.email}`} className="ulink flex items-center gap-2 self-start">
                <Mail className="size-4 text-ball" />
                {CLUB.email}
              </a>
            )}
            <div className="mt-1 flex gap-2.5">
              {CLUB.social.instagram && (
                <Button asChild variant="outline-dark" size="icon">
                  <a
                    href={CLUB.social.instagram}
                    aria-label="Instagram"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Instagram />
                  </a>
                </Button>
              )}
              {CLUB.whatsappHref && (
                <Button asChild variant="outline-dark" size="icon">
                  <a
                    href={CLUB.whatsappHref}
                    aria-label="WhatsApp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                  </a>
                </Button>
              )}
              {CLUB.social.facebook && (
                <Button asChild variant="outline-dark" size="icon">
                  <a
                    href={CLUB.social.facebook}
                    aria-label="Facebook"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Facebook />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 text-sm text-[#8A93C4] sm:flex-row">
          <span>
            © {new Date().getFullYear()} {CLUB.name}
          </span>
          <LangSwitch className="self-start" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="disp -mb-[3vw] hidden select-none whitespace-nowrap px-10 text-[17vw] leading-[0.8] tracking-[-0.06em] text-night-2 lg:block"
      >
        {CLUB.name}
      </div>
    </footer>
  );
}

/* ───────────────────────── Signed-in app shell ───────────────────────── */

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

function NotificationsBell({ dark = true }: { dark?: boolean }) {
  const tx = useTx();
  const locale = useDateLocale();
  const qc = useQueryClient();
  const { data } = useListNotifications(undefined, {
    query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 60_000 } as any,
  });
  const markAll = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    },
  });
  const list = Array.isArray(data) ? data : [];
  const unread = list.filter((n) => !n.isRead).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tx({
            fr: `Notifications, ${unread} non lues`,
            en: `Notifications, ${unread} unread`,
            ar: `الإشعارات، ${unread} غير مقروءة`,
          })}
          className={cn(
            "relative flex size-11 items-center justify-center rounded-full transition-colors",
            dark
              ? "bg-white/8 text-white hover:bg-white/14"
              : "bg-card text-ink shadow-sm hover:bg-secondary",
          )}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-extrabold text-night">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] rounded-[24px] p-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <span className="disp text-lg tracking-[-0.02em]">
            {tx({ fr: "Notifications", en: "Notifications", ar: "الإشعارات" })}
          </span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="text-sm font-bold text-court hover:underline"
            >
              {tx({ fr: "Tout marquer lu", en: "Mark all read", ar: "تعليم الكل كمقروء" })}
            </button>
          )}
        </div>
        <ul className="m-0 max-h-[420px] list-none overflow-y-auto p-2">
          {list.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              {tx({
                fr: "Rien de nouveau pour l'instant.",
                en: "Nothing new yet.",
                ar: "لا جديد حاليًا.",
              })}
            </li>
          )}
          {list.slice(0, 20).map((n) => (
            <li
              key={n.id}
              className={cn("flex gap-3 rounded-2xl px-3 py-3", !n.isRead && "bg-accent")}
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  n.isRead ? "bg-transparent" : "bg-court",
                )}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold">{n.title}</span>
                <span className="text-sm text-muted-foreground">{n.message}</span>
                <span className="text-xs text-muted-foreground/80">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function TokenChip({ compact = false }: { compact?: boolean }) {
  const tx = useTx();
  const { data } = useGetTokenBalance();
  const balance = data?.balance ?? 0;
  return (
    <Link
      href="/wallet"
      aria-label={tx({
        fr: `${balance} tokens, voir le portefeuille`,
        en: `${balance} tokens, open wallet`,
        ar: `${balance} رصيد، المحفظة`,
      })}
      className={cn(
        "flex items-center gap-2 rounded-full bg-ball font-extrabold text-night transition-transform hover:-translate-y-0.5",
        compact ? "h-9 px-3 text-sm" : "h-11 px-4 text-[15px]",
      )}
    >
      <Coins className="size-4" />
      {balance}
      <span className="font-semibold opacity-70">{compact ? "" : " tokens"}</span>
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useGetMe();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const tx = useTx();
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [location]);

  const isAdmin = user?.role === "admin";
  const isAdminRoute = location.startsWith("/admin");

  const player: NavItem[] = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    {
      href: "/terrains",
      label: tx({ fr: "Réserver", en: "Book", ar: "احجز" }),
      icon: CalendarPlus,
    },
    {
      href: "/open-matches",
      label: tx({ fr: "Open matches", en: "Open matches", ar: "مباريات مفتوحة" }),
      icon: Swords,
    },
    { href: "/reservations", label: t("reservations"), icon: CalendarDays },
    { href: "/wallet", label: t("wallet"), icon: Wallet },
    { href: "/tournaments", label: t("tournaments"), icon: Trophy },
    { href: "/news", label: t("news"), icon: Newspaper },
    { href: "/profile", label: t("profile"), icon: User },
  ];
  const admin: NavItem[] = [
    { href: "/admin", label: t("dashboard"), icon: LayoutDashboard, exact: true },
    { href: "/admin/reservations", label: t("reservations"), icon: CalendarDays },
    { href: "/admin/terrains", label: t("courts"), icon: Shield },
    {
      href: "/admin/users",
      label: tx({ fr: "Membres", en: "Members", ar: "الأعضاء" }),
      icon: Users,
    },
    { href: "/admin/tokens", label: "Tokens", icon: Coins },
    {
      href: "/admin/pricing",
      label: tx({ fr: "Tarifs", en: "Pricing", ar: "الأسعار" }),
      icon: Tags,
    },
    {
      href: "/admin/equipment",
      label: tx({ fr: "Matériel", en: "Equipment", ar: "المعدات" }),
      icon: Package,
    },
    { href: "/admin/news", label: t("news"), icon: Newspaper },
    { href: "/admin/tournaments", label: t("tournaments"), icon: Trophy },
  ];
  const items = isAdmin && isAdminRoute ? admin : player;
  const isActive = (i: NavItem) =>
    (i.exact ? location === i.href : location === i.href || location.startsWith(i.href + "/")) ||
    (i.href === "/dashboard" && location === "/");
  const tabs = items.slice(0, 4);
  const name = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.email ?? "");

  const switchLink = isAdmin && (
    <Link
      href={isAdminRoute ? "/dashboard" : "/admin"}
      className="flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold text-muted-d transition-colors hover:bg-white/6 hover:text-white"
    >
      <Repeat className="size-[18px]" />
      {isAdminRoute ? tx({ fr: "Vue joueur", en: "Player view", ar: "عرض اللاعب" }) : t("admin")}
    </Link>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <a
        href="#main"
        className="sr-only z-[60] rounded-full bg-ball px-5 py-3 font-bold text-night focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {tx({ fr: "Aller au contenu", en: "Skip to content", ar: "انتقل إلى المحتوى" })}
      </a>

      {/* Desktop sidebar */}
      <aside className="on-dark sticky top-0 hidden h-[100dvh] w-[272px] shrink-0 flex-col gap-6 overflow-y-auto bg-night px-4 py-6 text-white lg:flex">
        <div className="flex items-center justify-between px-2">
          <Logo href={isAdminRoute ? "/admin" : "/dashboard"} />
          <NotificationsBell />
        </div>
        {isAdminRoute ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white/6 px-3.5 py-3 text-sm font-bold text-ball">
            <Shield className="size-4" />
            {t("admin")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild variant="lime" size="lg" className="w-full">
              <Link href="/terrains">
                <CalendarPlus />
                {t("bookCourt")}
              </Link>
            </Button>
            <div className="flex justify-center">
              <TokenChip />
            </div>
          </div>
        )}
        <nav aria-label={t("dashboard")} className="flex flex-col gap-1">
          {items.map((i) => {
            const active = isActive(i);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition-colors",
                  active ? "bg-white text-night" : "text-soft-d hover:bg-white/6 hover:text-white",
                )}
              >
                <i.icon className={cn("size-[18px]", active && "text-court")} />
                {i.label}
              </Link>
            );
          })}
          {switchLink && <div className="mt-2 border-t border-white/10 pt-2">{switchLink}</div>}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <LangSwitch className="self-start" />
          <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-court text-sm font-extrabold">
              {(name || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{name}</span>
              <span className="truncate text-xs text-muted-d">{user?.email}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              aria-label={t("signOut")}
              data-testid="btn-sign-out"
              className="flex size-9 items-center justify-center rounded-full text-muted-d transition-colors hover:bg-white/10 hover:text-coral"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="on-dark sticky top-0 z-40 flex h-16 items-center justify-between bg-night/95 px-4 text-white backdrop-blur-md lg:hidden">
          <Logo href={isAdminRoute ? "/admin" : "/dashboard"} compact />
          <div className="flex items-center gap-2">
            {!isAdminRoute && <TokenChip compact />}
            <NotificationsBell />
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-5">
          {tabs.map((i) => {
            const active = isActive(i);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors",
                  active ? "text-court" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-court/10",
                  )}
                >
                  <i.icon className="size-5" />
                </span>
                <span className="max-w-full truncate px-1">{i.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-controls="more-menu"
            className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold text-muted-foreground"
          >
            <span className="flex h-8 w-12 items-center justify-center rounded-full">
              <Menu className="size-5" />
            </span>
            {tx({ fr: "Plus", en: "More", ar: "المزيد" })}
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={tx({ fr: "Menu", en: "Menu", ar: "القائمة" })}
        >
          <button
            type="button"
            aria-label={tx({ fr: "Fermer", en: "Close", ar: "إغلاق" })}
            className="absolute inset-0 bg-night/60"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="more-menu"
            className="on-dark enter absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-[32px] bg-night px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-white"
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20" />
            <div className="grid grid-cols-2 gap-2">
              {items.slice(4).map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-2xl px-4 font-bold",
                    isActive(i) ? "bg-white text-night" : "bg-white/6",
                  )}
                >
                  <i.icon className="size-5" />
                  {i.label}
                </Link>
              ))}
            </div>
            {switchLink}
            <LangSwitch className="self-start" />
            <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold">{name}</span>
                <span className="truncate text-xs text-muted-d">{user?.email}</span>
              </span>
              <Button variant="outline-dark" size="sm" onClick={signOut}>
                <LogOut />
                {t("signOut")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NavLayout({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [location] = useLocation();
  useRevealFallback();

  const isAuthRoute =
    location.startsWith("/sign-in") ||
    location.startsWith("/sign-up") ||
    location.startsWith("/reset-password") ||
    location.startsWith("/join/");
  if (isAuthRoute) return <>{children}</>;
  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-night" aria-busy="true">
        <span className="live-dot" style={{ width: 14, height: 14 }} />
      </div>
    );
  }
  return isSignedIn ? <AppShell>{children}</AppShell> : <PublicShell>{children}</PublicShell>;
}

export { LiveDot };
