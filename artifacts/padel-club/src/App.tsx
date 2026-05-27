import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLayout } from "@/components/nav-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { AuthProvider, useAuth } from "@/lib/auth";
import { syncUser } from "@/lib/user-sync";
import { getAccessToken } from "@/services/api";
import { I18nProvider } from "@/lib/i18n";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import AdminDashboard from "@/pages/admin";
import AdminReservations from "@/pages/admin-reservations";
import AdminTerrains from "@/pages/admin-terrains";
import AdminUsers from "@/pages/admin-users";
import AdminTokens from "@/pages/admin-tokens";
import AdminNews from "@/pages/admin-news";
import AdminTournaments from "@/pages/admin-tournaments";
import Terrains from "@/pages/terrains";
import Tournaments from "@/pages/tournaments";
import News from "@/pages/news";
import Contact from "@/pages/contact";
import PlayerReservations from "@/pages/player-reservations";
import Wallet from "@/pages/wallet";
import Profile from "@/pages/profile";
import JoinInvite from "@/pages/join-invite";
import OpenMatches from "@/pages/open-matches";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

setAuthTokenGetter(getAccessToken);

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";

  const handlePasswordAuth = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setLocation("/dashboard");
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${basePath || ""}/dashboard` },
    });
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <img src={`${basePath}/logo.svg`} alt="Padel Club" className="mx-auto mb-4 h-12 w-auto" />
          <h1 className="text-2xl font-black text-foreground">{isSignUp ? "Join Padel Club" : "Welcome back"}</h1>
          <p className="text-sm text-muted-foreground">
            {isSignUp ? "Create your account to book courts" : "Sign in to book your next match"}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handlePasswordAuth}>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required minLength={8} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "..." : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-2">
          <Button variant="outline" onClick={() => handleOAuth("google")}>Continue with Google</Button>
          <Button variant="outline" onClick={() => handleOAuth("apple")}>Continue with Apple</Button>
        </div>

        <Button
          variant="link"
          className="mt-4 w-full text-primary"
          onClick={() => setLocation(isSignUp ? "/sign-in" : "/sign-up")}
        >
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </Button>
      </div>
    </div>
  );
}

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
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/reservations" component={AdminReservations} />
            <Route path="/admin/terrains" component={AdminTerrains} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/tokens" component={AdminTokens} />
            <Route path="/admin/news" component={AdminNews} />
            <Route path="/admin/tournaments" component={AdminTournaments} />
            <Route path="/terrains" component={Terrains} />
            <Route path="/tournaments" component={Tournaments} />
            <Route path="/news" component={News} />
            <Route path="/contact" component={Contact} />
            <Route path="/reservations" component={PlayerReservations} />
            <Route path="/wallet" component={Wallet} />
            <Route path="/profile" component={Profile} />
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
