import { useState } from "react";
import { useListReservations, useListUpcomingReservations, useCancelReservation, getListReservationsQueryKey, getListUpcomingReservationsQueryKey, getGetTokenBalanceQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Link } from "wouter";
import { Calendar, Clock, MapPin, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-primary/20 text-primary",
  cancelled: "bg-destructive/20 text-destructive",
  pending: "bg-yellow-500/20 text-yellow-400",
};

export default function PlayerReservations() {
  const { data: upcoming, isLoading: isLoadingUpcoming } = useListUpcomingReservations();
  const { data: historyResponse, isLoading: isLoadingHistory } = useListReservations({ limit: 20 });
  const cancelReservation = useCancelReservation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const history = historyResponse?.data ?? [];
  const pastHistory = history.filter(r => r.status !== "confirmed" || new Date(r.startTime) < new Date());

  const handleCancel = (id: number) => {
    setCancellingId(id);
    cancelReservation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reservation cancelled", description: "Your token has been refunded." });
        queryClient.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
        setCancellingId(null);
      },
      onError: () => {
        toast({ title: "Cancel failed", description: "Could not cancel the reservation.", variant: "destructive" });
        setCancellingId(null);
      },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold uppercase italic text-primary">{t("myReservations")}</h1>
            <p className="text-muted-foreground mt-1">Manage your court bookings.</p>
          </div>
          <Link href="/terrains">
            <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90">
              <Calendar className="h-4 w-4 mr-2" />
              {t("bookCourt")}
            </Button>
          </Link>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {t("upcomingBookings")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUpcoming ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : upcoming && upcoming.length > 0 ? (
              <div className="space-y-3">
                {upcoming.map((res) => (
                  <div key={res.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-background hover:border-primary/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{res.terrain?.name ?? "Court"}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(res.startTime), "PPP")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(res.startTime), "HH:mm")} – {format(new Date(res.endTime), "HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${STATUS_COLORS[res.status] ?? "bg-muted text-muted-foreground"}`}>
                        {res.status}
                      </span>
                      {res.status === "confirmed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10"
                          disabled={cancellingId === res.id}
                          onClick={() => handleCancel(res.id)}
                        >
                          {cancellingId === res.id ? "..." : t("cancel")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 space-y-3">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                <p className="text-muted-foreground">{t("noUpcoming")}</p>
                <Link href="/terrains">
                  <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
                    {t("bookCourt")}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {t("pastBookings")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : pastHistory.length > 0 ? (
              <div className="space-y-3">
                {pastHistory.map((res) => (
                  <div key={res.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-background opacity-70">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted shrink-0">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{res.terrain?.name ?? "Court"}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(res.startTime), "PPP")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(res.startTime), "HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${STATUS_COLORS[res.status] ?? "bg-muted text-muted-foreground"}`}>
                      {res.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">{t("noPast")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
