import { useGetOpenMatches, useJoinSession, getOpenMatchesQueryKey, getCalendarQueryKey, getListUpcomingReservationsQueryKey, getGetTokenBalanceQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Users, MapPin, Calendar, Zap, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function OpenMatches() {
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: matches, isLoading } = useGetOpenMatches();
  const joinSession = useJoinSession();

  const handleJoin = (reservationId: number, startTime: string) => {
    if (!isSignedIn) {
      window.location.href = "/sign-in";
      return;
    }
    joinSession.mutate({ id: reservationId }, {
      onSuccess: () => {
        toast({ title: "Place confirmée!", description: "Vous avez rejoint la session. 1 token débité." });
        const dateStr = new Date(startTime).toISOString().split("T")[0];
        qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
        qc.invalidateQueries({ queryKey: getCalendarQueryKey({ date: dateStr }) });
        qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Erreur", description: err?.data?.error ?? "Impossible de rejoindre", variant: "destructive" });
      },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-black uppercase italic text-primary flex items-center justify-center gap-3">
            <Globe className="h-9 w-9" />
            Open Matches
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Sessions ouvertes — rejoignez une session et payez uniquement votre place (1 token).
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
          </div>
        ) : matches && matches.length > 0 ? (
          <div className="space-y-4">
            {matches.map((match) => (
              <Card key={match.reservationId} className="bg-card border-border overflow-hidden hover:border-primary/40 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-green-500/50 text-green-500 text-xs">
                          <Globe className="h-2.5 w-2.5 mr-1" /> Open
                        </Badge>
                        <span className="font-bold text-foreground">{match.terrain?.name ?? "Court"}</span>
                        <Badge variant="outline" className="text-xs border-border capitalize">{match.terrain?.type}</Badge>
                      </div>

                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(match.startTime), "EEEE d MMMM", { locale: fr })}
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-foreground">
                          {format(new Date(match.startTime), "HH:mm")}–{format(new Date(match.endTime), "HH:mm")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {match.filledSpots}/{match.totalSpots} joueurs · <span className="text-primary font-semibold">{match.openSpots} place{match.openSpots !== 1 ? "s" : ""} libre{match.openSpots !== 1 ? "s" : ""}</span>
                        </span>
                      </div>

                      {match.publicDescription && (
                        <p className="text-sm text-muted-foreground italic">{match.publicDescription}</p>
                      )}

                      {/* Players preview */}
                      <div className="flex gap-1">
                        {match.players.map((p, i) => (
                          <div key={i} className="h-6 w-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                        {Array.from({ length: match.openSpots }, (_, i) => (
                          <div key={`e-${i}`} className="h-6 w-6 rounded-full border-2 border-dashed border-border/50 flex items-center justify-center">
                            <span className="text-[10px] text-muted-foreground">+</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Coût</div>
                        <div className="flex items-center gap-1 text-primary font-bold">
                          <Zap className="h-3.5 w-3.5" /> 1 token
                        </div>
                      </div>
                      <Button
                        className="bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                        onClick={() => handleJoin(match.reservationId, match.startTime)}
                        disabled={joinSession.isPending}
                      >
                        Rejoindre
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 space-y-4">
            <Globe className="h-16 w-16 text-muted-foreground mx-auto opacity-30" />
            <p className="text-lg text-muted-foreground">Aucun open match disponible pour le moment</p>
            <p className="text-sm text-muted-foreground">Réservez un créneau et ouvrez-le à d'autres joueurs!</p>
            <Link href="/terrains">
              <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90 mt-2">
                Voir les courts
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
