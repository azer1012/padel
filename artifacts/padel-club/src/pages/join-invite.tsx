import { useParams } from "wouter";
import { useGetInvite, useAcceptInvite, getCalendarQueryKey, getListUpcomingReservationsQueryKey, getGetTokenBalanceQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useUser } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapPin, Calendar, Users, Zap, CheckCircle, AlertCircle } from "lucide-react";

export default function JoinInvite() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { isSignedIn } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: inviteData, isLoading, error } = useGetInvite(token ?? "", {
    query: { enabled: !!token },
  });

  const acceptInvite = useAcceptInvite();

  const handleAccept = () => {
    if (!isSignedIn) {
      window.location.href = `/sign-in?redirect=/join/${token}`;
      return;
    }
    if (!token) return;
    acceptInvite.mutate({ token }, {
      onSuccess: () => {
        toast({ title: "Place confirmée!", description: "Vous avez rejoint la session. 1 token débité." });
        const dateStr = inviteData ? new Date(inviteData.reservation.startTime).toISOString().split("T")[0] : "";
        if (dateStr) qc.invalidateQueries({ queryKey: getCalendarQueryKey({ date: dateStr }) });
        qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
        setLocation("/reservations");
      },
      onError: (err: any) => {
        toast({ title: "Erreur", description: err?.data?.error ?? "Impossible de rejoindre", variant: "destructive" });
      },
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full bg-card border-border">
          <CardContent className="pt-6 text-center space-y-2">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-foreground font-bold">Lien d'invitation invalide</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full bg-card border-border">
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !inviteData) {
    const errMsg = (error as any)?.data?.error ?? "Lien expiré ou invalide";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full bg-card border-border">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-foreground font-bold">Invitation invalide</p>
            <p className="text-muted-foreground text-sm">{errMsg}</p>
            <Button variant="outline" onClick={() => setLocation("/terrains")} className="w-full">Voir les courts</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { invite, reservation } = inviteData;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-sm w-full bg-card border-border">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl font-black uppercase text-primary">Invitation à jouer</CardTitle>
          <p className="text-sm text-muted-foreground">{invite.invitedBy} vous invite à rejoindre une session</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-background border border-border space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold">{reservation.terrainName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{format(new Date(reservation.startTime), "EEEE d MMMM yyyy", { locale: fr })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>{reservation.filledSpots}/{reservation.totalSpots} joueurs · {reservation.openSpots} place{reservation.openSpots !== 1 ? "s" : ""} libre{reservation.openSpots !== 1 ? "s" : ""}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-muted-foreground"><strong className="text-foreground">1 token</strong> sera débité de votre portefeuille</span>
          </div>

          {!isSignedIn && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Connectez-vous pour accepter l'invitation
            </div>
          )}

          <Button
            className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
            onClick={handleAccept}
            disabled={acceptInvite.isPending}
          >
            {acceptInvite.isPending ? "..." : isSignedIn ? "Rejoindre la session" : "Se connecter & rejoindre"}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setLocation("/terrains")}>
            Retour aux courts
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
