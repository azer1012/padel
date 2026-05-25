import { useListTournaments, useRegisterForTournament, getListTournamentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Trophy, Users, Calendar } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Tournaments() {
  const { data: tournaments, isLoading } = useListTournaments();
  const registerMutation = useRegisterForTournament();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRegister = (id: number) => {
    registerMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Registered successfully", description: "You are now part of the tournament." });
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
      },
      onError: () => {
        toast({ title: "Registration failed", description: "Could not register for tournament.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black uppercase italic text-primary">Tournaments</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Compete with the best. Join our upcoming padel tournaments.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {tournaments && tournaments.length > 0 ? tournaments.map((tournament) => (
              <Card key={tournament.id} className="bg-card border-border overflow-hidden">
                {tournament.imageUrl && (
                  <div className="h-48 overflow-hidden bg-muted">
                    <img src={tournament.imageUrl} alt={tournament.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-2xl font-bold uppercase">{tournament.name}</CardTitle>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary uppercase">
                      {tournament.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">{tournament.description}</p>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>{format(new Date(tournament.startDate), "PPP")}</span>
                    </div>
                    {tournament.maxTeams && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4 text-primary" />
                        <span>{tournament.registeredTeams || 0} / {tournament.maxTeams} Teams</span>
                      </div>
                    )}
                    {tournament.prizeInfo && (
                      <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        <span>{tournament.prizeInfo}</span>
                      </div>
                    )}
                  </div>

                  {tournament.status === 'open' && (
                    <Button
                      className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 mt-4"
                      onClick={() => handleRegister(tournament.id)}
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Registering..." : "Register Now"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )) : (
              <div className="col-span-1 md:col-span-2 text-center py-12 text-muted-foreground">
                No upcoming tournaments at the moment.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
