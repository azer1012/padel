import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLayout } from "@/components/nav-layout";
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
import { syncUser } from "@/lib/user-sync";
import { I18nProvider } from "@/lib/i18n";

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "110 100% 54%",
    colorForeground: "0 0% 98%",
    colorMutedForeground: "197 10% 65%",
    colorDanger: "0 84% 60%",
    colorBackground: "197 26% 10%",
    colorInput: "197 26% 18%",
    colorInputForeground: "0 0% 98%",
    colorNeutral: "197 26% 18%",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold text-2xl",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/80 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-destructive font-medium",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "bg-secondary hover:bg-secondary/80 border-border text-foreground transition-colors",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-colors",
    formFieldInput: "bg-input border-border text-foreground focus:ring-primary focus:border-primary transition-all",
    footerAction: "flex items-center justify-center space-x-2 mt-4",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border-destructive text-destructive",
    otpCodeFieldInput: "bg-input border-border text-foreground focus:ring-primary focus:border-primary transition-all",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function UserSyncer() {
  const { user, isSignedIn } = useUser();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isSignedIn && user && syncedRef.current !== user.id) {
      syncedRef.current = user.id;
      syncUser({
        id: user.id,
        primaryEmailAddress: user.primaryEmailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
      });
    }
  }, [isSignedIn, user]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Dashboard />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to Padel Club",
            subtitle: "Sign in to book your next match",
          },
        },
        signUp: {
          start: {
            title: "Join Padel Club",
            subtitle: "Get access to premium courts",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <UserSyncer />
        <TooltipProvider>
          <NavLayout>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
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
              <Route component={NotFound} />
            </Switch>
          </NavLayout>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <I18nProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </I18nProvider>
  );
}

export default App;
