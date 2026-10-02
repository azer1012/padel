import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  BellIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  ClockIcon,
  CoinsIcon,
  CourtIcon,
  EnvelopeSimpleIcon,
  FacebookLogoIcon,
  GearSixIcon,
  InstagramLogoIcon,
  MapPinIcon,
  MenuIcon,
  NewspaperIcon,
  PackageIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SquaresFourIcon,
  TagIcon,
  TennisBallIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  WhatsappLogoIcon,
  XIcon,
} from "@/components/icons";
import type { AppIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Logo } from "@/components/smash/brand";
import { AmivioCredit } from "@/components/smash/amivio-credit";
import { CountUp, LiveDot } from "@/components/smash/primitives";
import { cn } from "@/lib/utils";
import { useI18n, useTx, useDateLocale, type Lang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useRevealFallback } from "@/hooks/use-reveal";
import { CLUB } from "@/config/club";
import { useClubRules } from "@/hooks/use-club-rules";
import { tokenWord } from "@/lib/labels";
import { cancelSectionScroll, scrollToSection } from "@/lib/scroll";

/** The "how booking works" section of the home page. */
const HOW_HREF = "/#how";
/** Nav links that are sections of the home page: href → id of the section. */
const HOME_SECTIONS: Record<string, string> = { [HOW_HREF]: "how" };

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
            "h-8 min-w-9 rounded-full px-2 text-xs font-extrabold transition-[color,background-color,transform] duration-300 active:scale-90",
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
  const [location, navigate] = useLocation();
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

  const { openMatchesEnabled } = useClubRules();
  const links = [
    { href: "/", label: t("home") },
    { href: HOW_HREF, label: tx({ fr: "Comment ça marche", en: "How it works", ar: "كيف يعمل" }) },
    ...(openMatchesEnabled
      ? [
          {
            href: "/open-matches",
            label: tx({ fr: "Open matches", en: "Open matches", ar: "مباريات مفتوحة" }),
          },
        ]
      : []),
    { href: "/tournaments", label: t("tournaments") },
    { href: "/news", label: t("news") },
    { href: "/contact", label: t("contact") },
  ];

  /**
   * Some links stay on the home page: "Comment ça marche" scrolls to its section
   * (going home first if needed) and "Accueil", already at home, goes back to the top.
   */
  const onNavClick = (href: string) => (event: React.MouseEvent) => {
    // A scroll still settling must not pull the page back after another choice
    cancelSectionScroll();
    const section = HOME_SECTIONS[href];
    if (section) {
      event.preventDefault();
      setOpen(false);
      if (location !== "/") navigate("/");
      window.history.replaceState(null, "", `${import.meta.env.BASE_URL}#${section}`);
      scrollToSection(section);
    } else if (href === "/" && location === "/") {
      event.preventDefault();
      setOpen(false);
      window.history.replaceState(null, "", import.meta.env.BASE_URL);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const isCurrent = (href: string) =>
    href === "/" ? location === "/" : !HOME_SECTIONS[href] && location.startsWith(href);

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
        {/* The full menu needs 1320px with a club name of about 15 letters: narrower laptops and tablets get the menu button */}
        <nav aria-label="Main" className="hidden items-center gap-7 min-[1320px]:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavClick(l.href)}
              aria-current={isCurrent(l.href) ? "page" : undefined}
              className="ulink whitespace-nowrap text-[15px] font-semibold text-white/80 transition-colors hover:text-white aria-[current=page]:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LangSwitch className="hidden md:flex" />
          <Button
            asChild
            variant="outline-dark"
            size="sm"
            className="hidden min-[1320px]:inline-flex"
          >
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
            className="flex size-11 items-center justify-center rounded-full bg-white/10 min-[1320px]:hidden"
          >
            {open ? (
              <XIcon key="x" className="icon-pop size-5" />
            ) : (
              <MenuIcon key="menu" className="icon-pop size-5" />
            )}
          </button>
        </div>
        {open && (
          <nav
            id="public-menu"
            aria-label="Mobile"
            className="fade-in fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-y-auto bg-night px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 lg:top-[76px] lg:px-12 min-[1320px]:hidden"
          >
            <div className="stagger flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onNavClick(l.href)}
                  className="disp group flex items-center justify-between border-b border-white/10 py-4 text-[36px] leading-none text-white"
                >
                  {l.label}
                  <ArrowRightIcon className="btn-ic size-6 text-ball opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
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
        <div key={location} className="page-in">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  const rules = useClubRules();
  const tx = useTx();
  const { t } = useI18n();
  return (
    <footer className="on-dark relative overflow-clip bg-night text-white">
      <div className="flex flex-col gap-16 px-5 pb-10 pt-20 lg:px-16 lg:pt-28">
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="disp m-0 text-[clamp(52px,8vw,120px)] leading-[0.9]">
            {tx({ fr: "Prêt à jouer ?", en: "Ready to play?", ar: "مستعد للعب؟" })}
          </h2>
          <Button asChild variant="lime" size="xl" className="shine w-full sm:w-auto">
            <Link href="/terrains">
              {tx({ fr: "Réserver mon terrain", en: "Book your court", ar: "احجز ملعبك" })}
              <ArrowRightIcon className="btn-ic" />
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
            {rules.openMatchesEnabled && (
              <Link href="/open-matches" className="ulink self-start">
                Open matches
              </Link>
            )}
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
              <ClockIcon className="size-4 text-ball" />
              {rules.openEveryDay
                ? tx({ fr: "Tous les jours", en: "Every day", ar: "كل يوم" })
                : tx({ fr: "Horaires", en: "Hours", ar: "الساعات" })}
              , {rules.hoursLabel}
            </span>
            {CLUB.fullAddress && (
              <span className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-ball" />
                {CLUB.fullAddress}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 text-[15px] text-soft-d lg:col-span-3">
            <span className="label text-[#8A93C4]">{t("contact")}</span>
            {CLUB.phone && (
              <a href={CLUB.phoneHref} className="ulink flex items-center gap-2 self-start">
                <PhoneIcon className="size-4 text-ball" />
                <span dir="ltr">{CLUB.phone}</span>
              </a>
            )}
            {CLUB.email && (
              <a href={`mailto:${CLUB.email}`} className="ulink flex items-center gap-2 self-start">
                <EnvelopeSimpleIcon className="size-4 text-ball" />
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
                    <InstagramLogoIcon />
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
                    <WhatsappLogoIcon />
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
                    <FacebookLogoIcon />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 text-sm text-[#8A93C4] sm:flex-row">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              © {new Date().getFullYear()} {CLUB.name}
            </span>
            <AmivioCredit />
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

type NavItem = {
  href: string;
  label: string;
  /** Shorter wording for the phone tab bar, where a label has ~70 px. */
  short?: string;
  icon: AppIcon;
  exact?: boolean;
};

/** Where a notification leads, and the icon that says what it is about. */
const NOTIFICATION: Record<string, { href: string; icon: AppIcon }> = {
  booking_confirmed: { href: "/reservations", icon: CalendarCheckIcon },
  booking_cancelled: { href: "/reservations", icon: CalendarXIcon },
  reservation_reminder: { href: "/reservations", icon: ClockIcon },
  tokens_added: { href: "/wallet", icon: CoinsIcon },
  announcement: { href: "/news", icon: NewspaperIcon },
};

function NotificationsBell({ dark = true }: { dark?: boolean }) {
  const tx = useTx();
  const locale = useDateLocale();
  const qc = useQueryClient();
  const { data } = useListNotifications(undefined, { query: { refetchInterval: 60_000 } });
  const markAll = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    },
  });
  const [open, setOpen] = useState(false);
  const list = Array.isArray(data) ? data : [];
  const unread = list.filter((n) => !n.isRead).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tx({
            fr: `Notifications, ${unread} non lues`,
            en: `Notifications, ${unread} unread`,
            ar: `الإشعارات، ${unread} غير مقروءة`,
          })}
          className={cn(
            "bell relative flex size-11 items-center justify-center rounded-full transition-[background-color,transform] active:scale-90",
            dark
              ? "bg-white/8 text-white hover:bg-white/14"
              : "bg-card text-ink shadow-sm hover:bg-secondary",
          )}
        >
          <BellIcon
            className={cn("size-5", unread > 0 && "ring-once")}
            weight={unread > 0 ? "fill" : undefined}
          />
          {unread > 0 && (
            <span
              key={unread}
              className="pop-in absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-extrabold text-night shadow-[0_0_0_2px_var(--color-night)]"
            >
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
        <ul className="stagger m-0 max-h-[420px] list-none overflow-y-auto p-2">
          {list.length === 0 && (
            <li className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground">
              <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-court">
                <BellIcon className="size-6" weight="duotone" />
              </span>
              {tx({
                fr: "Vous êtes à jour.",
                en: "You're all caught up.",
                ar: "لا جديد لديك.",
              })}
            </li>
          )}
          {list.slice(0, 20).map((n) => {
            const kind = NOTIFICATION[n.type] ?? { href: "/dashboard", icon: BellIcon };
            return (
              <li key={n.id}>
                <Link
                  href={kind.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-secondary",
                    !n.isRead && "bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      n.isRead ? "bg-secondary text-muted-foreground" : "bg-court text-white",
                    )}
                  >
                    <kind.icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-bold">
                      {n.title}
                      {!n.isRead && (
                        <span className="sr-only">
                          {tx({ fr: " (non lue)", en: " (unread)", ar: " (غير مقروء)" })}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">{n.message}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
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
        "group flex items-center gap-2 rounded-full bg-ball font-extrabold text-night shadow-[0_10px_24px_-16px_rgb(120_140_0/.9)] transition-transform hover:-translate-y-0.5 active:scale-95",
        compact ? "h-9 px-3 text-sm" : "h-11 px-4 text-[15px]",
      )}
    >
      <CoinsIcon
        className="size-4 transition-transform duration-500 group-hover:rotate-[360deg]"
        weight="fill"
      />
      <CountUp value={balance} />
      <span className="font-semibold opacity-70">{compact ? "" : ` ${tokenWord(balance)}`}</span>
    </Link>
  );
}

/**
 * Wraps the sidebar links and slides one white pill to the active link
 * (measured from the DOM, so it follows any number of items and languages).
 */
function SlidingNav({ activeKey, children }: { activeKey?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ y: number; h: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current?.querySelector<HTMLElement>(`[data-nav-key="${activeKey}"]`);
      setPill((prev) =>
        el ? { y: el.offsetTop, h: el.offsetHeight, ready: prev !== null } : null,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeKey]);
  return (
    <div ref={box} className="relative flex flex-col gap-1">
      {pill && (
        <span
          aria-hidden="true"
          className="nav-indicator"
          style={{
            height: pill.h,
            transform: `translateY(${pill.y}px)`,
            // No slide on first paint: the pill simply appears under the current page.
            transition: pill.ready ? undefined : "none",
          }}
        />
      )}
      {children}
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useGetMe();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const tx = useTx();
  const rules = useClubRules();
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const moreSheet = useRef<HTMLDivElement>(null);
  useEffect(() => setMoreOpen(false), [location]);
  // The "more" sheet behaves like a dialog: focus moves in, Escape closes, the page stays put
  useEffect(() => {
    if (!moreOpen) return;
    const opener = moreBtn.current;
    moreSheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [moreOpen]);

  const isAdmin = user?.role === "admin";
  const isAdminRoute = location.startsWith("/admin");

  const player: NavItem[] = [
    {
      href: "/dashboard",
      label: tx({ fr: "Accueil", en: "Home", ar: "الرئيسية" }),
      icon: SquaresFourIcon,
    },
    {
      href: "/terrains",
      label: tx({ fr: "Réserver", en: "Book", ar: "احجز" }),
      icon: CalendarPlusIcon,
    },
    ...(rules.openMatchesEnabled
      ? [
          {
            href: "/open-matches",
            label: tx({ fr: "Open matches", en: "Open matches", ar: "مباريات مفتوحة" }),
            short: tx({ fr: "Matchs", en: "Matches", ar: "مباريات" }),
            icon: TennisBallIcon,
          },
        ]
      : []),
    {
      href: "/reservations",
      label: tx({ fr: "Mes réservations", en: "My bookings", ar: "حجوزاتي" }),
      short: tx({ fr: "Mes résas", en: "Bookings", ar: "حجوزاتي" }),
      icon: CalendarDotsIcon,
    },
    {
      href: "/wallet",
      label: tx({ fr: "Mes tokens", en: "My tokens", ar: "رصيدي" }),
      icon: WalletIcon,
    },
    { href: "/tournaments", label: t("tournaments"), icon: TrophyIcon },
    { href: "/news", label: t("news"), icon: NewspaperIcon },
    { href: "/profile", label: t("profile"), icon: UserIcon },
  ];
  const admin: NavItem[] = [
    {
      href: "/admin",
      label: t("dashboard"),
      short: tx({ fr: "Aujourd'hui", en: "Today", ar: "اليوم" }),
      icon: SquaresFourIcon,
      exact: true,
    },
    {
      href: "/admin/reservations",
      label: t("reservations"),
      short: tx({ fr: "Planning", en: "Schedule", ar: "الجدول" }),
      icon: CalendarDotsIcon,
    },
    { href: "/admin/terrains", label: t("courts"), icon: CourtIcon },
    {
      href: "/admin/users",
      label: tx({ fr: "Membres", en: "Members", ar: "الأعضاء" }),
      icon: UsersIcon,
    },
    {
      href: "/admin/tokens",
      label: tx({ fr: "Tokens", en: "Tokens", ar: "الرصيد" }),
      icon: CoinsIcon,
    },
    {
      href: "/admin/pricing",
      label: tx({ fr: "Tarifs", en: "Pricing", ar: "الأسعار" }),
      icon: TagIcon,
    },
    {
      href: "/admin/equipment",
      label: tx({ fr: "Matériel", en: "Equipment", ar: "المعدات" }),
      icon: PackageIcon,
    },
    { href: "/admin/news", label: t("news"), icon: NewspaperIcon },
    { href: "/admin/tournaments", label: t("tournaments"), icon: TrophyIcon },
    {
      href: "/admin/settings",
      label: tx({ fr: "Réglages", en: "Settings", ar: "الإعدادات" }),
      icon: GearSixIcon,
    },
  ];
  const items = isAdmin && isAdminRoute ? admin : player;
  const isActive = (i: NavItem) =>
    (i.exact ? location === i.href : location === i.href || location.startsWith(i.href + "/")) ||
    (i.href === "/dashboard" && location === "/");
  const tabs = items.slice(0, 4);
  const inMore = items.slice(4).some(isActive);
  const name = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.email ?? "");

  const switchLink = isAdmin && (
    <Link
      href={isAdminRoute ? "/dashboard" : "/admin"}
      className="flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold text-muted-d transition-colors hover:bg-white/6 hover:text-white"
    >
      <ArrowsLeftRightIcon className="size-[18px]" />
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
      <aside className="on-dark sticky top-0 hidden h-[100dvh] w-[264px] shrink-0 flex-col gap-6 overflow-y-auto bg-night px-4 py-6 text-white lg:flex">
        <div className="flex items-center justify-between px-2">
          <Logo href={isAdminRoute ? "/admin" : "/dashboard"} />
          <NotificationsBell />
        </div>
        {isAdminRoute ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white/6 px-3.5 py-3 text-sm font-bold text-ball">
            <ShieldCheckIcon className="size-4" />
            {t("admin")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild variant="lime" size="lg" className="w-full">
              <Link href="/terrains">
                <CalendarPlusIcon />
                {t("bookCourt")}
              </Link>
            </Button>
            <div className="flex justify-center">
              <TokenChip />
            </div>
          </div>
        )}
        <nav aria-label={t("dashboard")} className="flex flex-col gap-1">
          <SlidingNav activeKey={items.find(isActive)?.href}>
            {items.map((i) => {
              const active = isActive(i);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  data-nav-key={i.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition-colors duration-300",
                    active ? "text-night" : "text-soft-d hover:bg-white/6 hover:text-white",
                  )}
                >
                  <i.icon
                    key={active ? "on" : "off"}
                    weight={active ? "fill" : undefined}
                    className={cn(
                      "size-[18px] transition-transform duration-300 group-hover:scale-110",
                      active && "icon-pop text-court",
                    )}
                  />
                  <span className="truncate">{i.label}</span>
                </Link>
              );
            })}
          </SlidingNav>
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
              title={t("signOut")}
              data-testid="btn-sign-out"
              className="flex size-9 items-center justify-center rounded-full text-muted-d transition-[color,background-color,transform] hover:bg-white/10 hover:text-coral active:scale-90"
            >
              <SignOutIcon className="size-4" />
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
          <div key={location} className="page-in">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label={tx({
          fr: "Navigation principale",
          en: "Main navigation",
          ar: "التنقل الرئيسي",
        })}
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
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors duration-300 active:scale-95",
                  active ? "text-court" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]",
                    active ? "scale-100 bg-court/12" : "scale-90",
                  )}
                >
                  <i.icon
                    key={active ? "on" : "off"}
                    weight={active ? "fill" : undefined}
                    className={cn("size-[22px]", active && "icon-pop")}
                  />
                </span>
                <span className="max-w-full truncate px-1">{i.short ?? i.label}</span>
              </Link>
            );
          })}
          <button
            ref={moreBtn}
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls="more-menu"
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-transform active:scale-95",
              inMore ? "text-court" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-12 items-center justify-center rounded-full",
                inMore && "bg-court/12",
              )}
            >
              <MenuIcon className="size-[22px]" />
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
            className="fade-in absolute inset-0 bg-night/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="more-menu"
            ref={moreSheet}
            className="on-dark sheet-up absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-[32px] bg-night px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-white"
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20" />
            <div className="stagger grid grid-cols-2 gap-2">
              {items.slice(4).map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-2xl px-4 font-bold transition-[background-color,transform] active:scale-95",
                    isActive(i) ? "bg-white text-night" : "bg-white/6 hover:bg-white/10",
                  )}
                >
                  <i.icon className="size-5" weight={isActive(i) ? "fill" : "duotone"} />
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
                <SignOutIcon />
                {t("signOut")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A new page starts at its top. Without this the browser keeps the scroll position of
 * the page left behind, so a short page opened from far down a long one shows its end.
 * Not when going back or forward (the browser restores the position there), nor when
 * the address points to a section of the page (#…), which is scrolled to instead.
 */
function useStartAtTop(location: string) {
  const viaHistory = useRef(false);
  const firstPage = useRef(true);
  useEffect(() => {
    const onPop = () => {
      viaHistory.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useLayoutEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    if (viaHistory.current) {
      viaHistory.current = false;
      return;
    }
    if (window.location.hash) return;
    cancelSectionScroll();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
}

export function NavLayout({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [location] = useLocation();
  useRevealFallback();
  useStartAtTop(location);

  const isAuthRoute =
    location.startsWith("/sign-in") ||
    location.startsWith("/sign-up") ||
    location.startsWith("/reset-password") ||
    location.startsWith("/auth/") ||
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
