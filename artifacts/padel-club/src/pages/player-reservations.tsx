import { useListReservations, useListUpcomingReservations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function PlayerReservations() {
  const { data: upcoming, isLoading: isLoadingUpcoming } = useListUpcomingReservations();
  const { data: history, isLoading: isLoadingHistory } = useListReservations({ limit: 10 });

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <h1 className="text-3xl font-bold uppercase italic text-primary">My Reservations</h1>
          <p className="text-muted-foreground">Manage your bookings.</p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Upcoming Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUpcoming ? (
              <Skeleton className="h-32 w-full" />
            ) : upcoming && upcoming.length > 0 ? (
              <div className="space-y-4">
                {upcoming.map((res) => (
                  <div key={res.id} className="flex justify-between items-center p-4 border border-border rounded-lg bg-background">
                    <div>
                      <h3 className="font-bold text-lg">{res.terrain?.name}</h3>
                      <p className="text-muted-foreground">{format(new Date(res.startTime), "PPP p")}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary uppercase">
                        {res.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">No upcoming reservations.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Past Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <Skeleton className="h-64 w-full" />
            ) : history?.data && history.data.length > 0 ? (
              <div className="space-y-4">
                {history.data.filter(r => r.status === 'confirmed' || r.status === 'cancelled').map((res) => (
                  <div key={res.id} className="flex justify-between items-center p-4 border border-border rounded-lg bg-background opacity-75">
                    <div>
                      <h3 className="font-bold text-lg">{res.terrain?.name}</h3>
                      <p className="text-muted-foreground">{format(new Date(res.startTime), "PPP p")}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium uppercase text-muted-foreground">{res.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">No past reservations.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}