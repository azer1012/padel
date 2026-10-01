import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
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
import { DEMO } from "@/lib/demo-flag";
import { useHashLocation } from "wouter/use-hash-location";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import ResetPassword from "@/pages/reset-password";
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

function QueryClientCacheInvalidator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        queryClient.clear();
      }
    });

    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return null;
}

function UserSyncer() {
  const { user, isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn && user) {
      syncUser(user);
    }
  }, [isSignedIn, user]);

  return null;
}

function HomeRedirect() {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <Dashboard /> : <Home />;
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
function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [location] = useLocation();
  const { data: me, isLoading, isError } = useGetMe({ query: { enabled: isSignedIn } as any });

  if (!isLoaded) return <RouteLoader />;
  if (!isSignedIn) return <Redirect to={`/sign-in?redirect=${encodeURIComponent(location)}`} />;
  if (isLoading) return <RouteLoader />;
  if (isError || me?.role !== "admin") return <Redirect to="/dashboard" />;

  return (
    <Suspense fallback={<RouteLoader />}>
      <Component />
    </Suspense>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [location] = useLocation();

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return <Redirect to={`/sign-in?redirect=${encodeURIComponent(location)}`} />;
  }

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
        <WouterRouter {...(DEMO ? { hook: useHashLocation } : { base: basePath })}>
          <AppRoutes />
        </WouterRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
