import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef } from "react";
import { setAuthTokenGetter, setBaseUrl, useGetMe } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLayout } from "@/components/nav-layout";
import { supabase } from "@/lib/supabase";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { syncUser } from "@/lib/user-sync";
import { API_BASE, getAccessToken } from "@/services/api";
import { I18nProvider } from "@/lib/i18n";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import ResetPassword from "@/pages/reset-password";
import AuthConfirm from "@/pages/auth-confirm";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
const AdminDashboard = lazy(() => import("@/pages/admin"));
const AdminReservations = lazy(() => import("@/pages/admin-reservations"));
const AdminTerrains = lazy(() => import("@/pages/admin-terrains"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const AdminTokens = lazy(() => import("@/pages/admin-tokens"));
const AdminNews = lazy(() => import("@/pages/admin-news"));
const AdminTournaments = lazy(() => import("@/pages/admin-tournaments"));
const AdminPricing = lazy(() => import("@/pages/admin-pricing"));
const AdminEquipment = lazy(() => import("@/pages/admin-equipment"));
const AdminSettings = lazy(() => import("@/pages/admin-settings"));
import Terrains from "@/pages/terrains";
import Tournaments from "@/pages/tournaments";
import News from "@/pages/news";
import Contact from "@/pages/contact";
import PlayerReservations from "@/pages/player-reservations";
import Wallet from "@/pages/wallet";
import Profile from "@/pages/profile";
import JoinInvite from "@/pages/join-invite";
import OpenMatches from "@/pages/open-matches";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1 } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

setAuthTokenGetter(getAccessToken);
// API on another origin (e.g. https://api.example.tn). Empty = same origin, /api proxied.
if (API_BASE) setBaseUrl(API_BASE);

/**
 * Cached data belongs to one account: drop it when the signed-in member changes
 * (sign-in, sign-out, another account). Supabase also emits SIGNED_IN each time the
 * tab regains focus and TOKEN_REFRESHED every hour: same member, nothing to drop.
 */
function QueryClientCacheInvalidator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let current: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id ?? null;
      if (current !== undefined && current !== next) queryClient.clear();
      current = next;
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return null;
}

function UserSyncer() {
  const { user, isSignedIn } = useAuth();
  const userId = user?.id;
  const synced = useRef<string | null>(null);

  // Once per signed-in member, not on every token refresh (the session object changes each time)
  useEffect(() => {
    if (!isSignedIn || !user || synced.current === userId) return;
    synced.current = userId ?? null;
    void syncUser(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId]);

  return null;
}

function HomeRedirect() {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <Dashboard /> : <Home />;
}

/**
 * Sign-in address that remembers the page asked for, and the error an e-mail link
 * came back with (an expired confirmation link lands on a private page first).
 */
function signInPath(location: string) {
  const came = new URLSearchParams(
    window.location.search || window.location.hash.replace(/^#/, ""),
  );
  const target = new URLSearchParams({ redirect: location });
  for (const key of ["error_code", "error_description"]) {
    const value = came.get(key);
    if (value) target.set(key, value);
  }
  return `/sign-in?${target}`;
}

const RouteLoader = () => (
  <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
    <span className="live-dot" />
  </div>
);

/**
 * Admin gate. The role lives on the API user (useGetMe), not on the Supabase
 * session user (whose role is always "authenticated").
 */
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [location] = useLocation();
  const { data: me, isLoading, isError } = useGetMe({ query: { enabled: isSignedIn } });

  if (!isLoaded) return <RouteLoader />;
  if (!isSignedIn) return <Redirect to={signInPath(location)} replace />;
  if (isLoading) return <RouteLoader />;
  if (isError || me?.role !== "admin") return <Redirect to="/dashboard" replace />;

  return (
    <Suspense fallback={<RouteLoader />}>
      <Component />
    </Suspense>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [location] = useLocation();

  if (!isLoaded) return <RouteLoader />;
  if (!isSignedIn) return <Redirect to={signInPath(location)} replace />;

  return <Component />;
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryClientCacheInvalidator />
      <UserSyncer />
      <TooltipProvider>
        <NavLayout>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={() => <AuthPage mode="sign-in" />} />
            <Route path="/sign-up/*?" component={() => <AuthPage mode="sign-up" />} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/auth/confirm" component={AuthConfirm} />

            {/* Protected Player Routes */}
            <Route path="/dashboard">
              <ProtectedRoute component={Dashboard} />
            </Route>
            <Route path="/reservations">
              <ProtectedRoute component={PlayerReservations} />
            </Route>
            <Route path="/wallet">
              <ProtectedRoute component={Wallet} />
            </Route>
            <Route path="/profile">
              <ProtectedRoute component={Profile} />
            </Route>

            {/* Protected Admin Routes */}
            <Route path="/admin">
              <AdminRoute component={AdminDashboard} />
            </Route>
            <Route path="/admin/reservations">
              <AdminRoute component={AdminReservations} />
            </Route>
            <Route path="/admin/terrains">
              <AdminRoute component={AdminTerrains} />
            </Route>
            <Route path="/admin/users">
              <AdminRoute component={AdminUsers} />
            </Route>
            <Route path="/admin/tokens">
              <AdminRoute component={AdminTokens} />
            </Route>
            <Route path="/admin/news">
              <AdminRoute component={AdminNews} />
            </Route>
            <Route path="/admin/tournaments">
              <AdminRoute component={AdminTournaments} />
            </Route>
            <Route path="/admin/pricing">
              <AdminRoute component={AdminPricing} />
            </Route>
            <Route path="/admin/equipment">
              <AdminRoute component={AdminEquipment} />
            </Route>
            <Route path="/admin/settings">
              <AdminRoute component={AdminSettings} />
            </Route>

            {/* Public Routes */}
            <Route path="/terrains" component={Terrains} />
            <Route path="/tournaments" component={Tournaments} />
            <Route path="/news" component={News} />
            <Route path="/contact" component={Contact} />
            <Route path="/open-matches" component={OpenMatches} />
            <Route path="/join/:token" component={JoinInvite} />
            <Route component={NotFound} />
          </Switch>
        </NavLayout>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <WouterRouter base={basePath}>
          <AppRoutes />
        </WouterRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
