import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { SignOutButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, CalendarDays, Wallet, User, Shield, Users, Coins, Newspaper, Trophy, Home, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const playerLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reservations", label: "Book Court", icon: CalendarDays },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/profile", label: "Profile", icon: User },
];

const publicLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/terrains", label: "Courts", icon: LayoutDashboard },
  { href: "/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/news", label: "News", icon: Newspaper },
];

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/reservations", label: "Reservations", icon: CalendarDays },
  { href: "/admin/terrains", label: "Terrains", icon: Shield },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/tokens", label: "Tokens", icon: Coins },
  { href: "/admin/news", label: "News", icon: Newspaper },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
];

export function NavLayout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetMe();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const isAdminRoute = location.startsWith("/admin");
  const isAuthRoute = location.startsWith("/sign-in") || location.startsWith("/sign-up");
  const isPublicRoute = !user && !isAuthRoute;

  if (isAuthRoute) return <>{children}</>;

  const links = isAdmin && isAdminRoute ? adminLinks : user ? playerLinks : publicLinks;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-border bg-card/80 backdrop-blur transition-transform lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <img src="/logo.svg" alt="Padel Club" className="h-8 w-auto" onError={e => (e.currentTarget.style.display = "none")} />
          <span className="font-black uppercase text-sm tracking-wider text-primary">Padel Club</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                <div data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`} className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </div>
              </Link>
            );
          })}

          {user && isAdmin && !isAdminRoute && (
            <Link href="/admin" onClick={() => setMobileOpen(false)}>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors mt-4 border-t border-border pt-4">
                <Shield className="h-4 w-4 shrink-0" />
                Admin Panel
              </div>
            </Link>
          )}
          {user && isAdmin && isAdminRoute && (
            <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors mt-4 border-t border-border pt-4">
                <User className="h-4 w-4 shrink-0" />
                Player View
              </div>
            </Link>
          )}
        </nav>

        <div className="border-t border-border p-3">
          {user ? (
            <div className="space-y-2">
              <div className="px-3 py-1">
                <p className="text-xs font-medium text-foreground truncate">{user.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user.email}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <SignOutButton>
                <Button variant="ghost" size="sm" data-testid="btn-sign-out" className="w-full justify-start text-muted-foreground hover:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </SignOutButton>
            </div>
          ) : (
            <Link href="/sign-in">
              <Button variant="outline" size="sm" className="w-full border-primary/30 text-primary hover:bg-primary/10">Sign In</Button>
            </Link>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center border-b border-border bg-card/50 px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} data-testid="btn-mobile-menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-3 font-bold text-sm text-primary uppercase tracking-wider">Padel Club</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
