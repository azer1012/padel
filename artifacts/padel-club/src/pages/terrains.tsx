import { useState } from "react";
import { useListTerrains, useGetTerrainSlots, useCreateReservation, getListUpcomingReservationsQueryKey, getListReservationsQueryKey, getGetTokenBalanceQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, addDays } from "date-fns";
import { Calendar, Clock, Zap, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";
import { useI18n } from "@/lib/i18n";

function SlotGrid({
  terrainId,
  date,
  onBook,
  isPending,
}: {
  terrainId: number;
  date: string;
  onBook: (startTime: string) => void;
  isPending: boolean;
}) {
  const { data: slots, isLoading } = useGetTerrainSlots({ terrainId, date });
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return <p className="text-muted-foreground text-center py-6">No slots available for this date.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((slot) => {
        const isAvailable = slot.available;
        const isBooked = !slot.available && slot.reservationId != null;
        const start = new Date(slot.startTime);
        return (
          <button
            key={slot.startTime}
            disabled={!isAvailable || isPending}
            onClick={() => onBook(slot.startTime)}
            className={`
              rounded-lg py-3 px-2 text-sm font-semibold transition-all border
              ${isAvailable
                ? "bg-primary/10 border-primary text-primary hover:bg-primary hover:text-primary-foreground cursor-pointer"
                : isBooked
                  ? "bg-destructive/10 border-destructive/30 text-destructive/60 cursor-not-allowed"
                  : "bg-muted/30 border-border text-muted-foreground cursor-not-allowed"
              }
            `}
          >
            {format(start, "HH:mm")}
            {isBooked && <span className="block text-xs mt-0.5">{t("booked")}</span>}
          </button>
        );
      })}
    </div>
  );
}

const NEXT_7_DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = addDays(new Date(), i);
  d.setHours(12, 0, 0, 0);
  return d;
});

export default function Terrains() {
  const { data: terrains, isLoading } = useListTerrains();
  const createReservation = useCreateReservation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isSignedIn } = useUser();
  const { t } = useI18n();

  const [selectedTerrain, setSelectedTerrain] = useState<{ id: number; name: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(NEXT_7_DAYS[0]);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);

  const dateStr = selectedDate.toISOString().split("T")[0];

  const handleBook = (startTime: string) => {
    if (!isSignedIn) {
      window.location.href = "/sign-in";
      return;
    }
    setPendingSlot(startTime);
  };

  const confirmBooking = () => {
    if (!selectedTerrain || !pendingSlot) return;
    createReservation.mutate(
      { data: { terrainId: selectedTerrain.id, startTime: pendingSlot } },
      {
        onSuccess: () => {
          toast({ title: t("bookingSuccess"), description: `${selectedTerrain.name} — ${format(new Date(pendingSlot), "PPP p")}` });
          setPendingSlot(null);
          setSelectedTerrain(null);
          queryClient.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? t("bookingError");
          toast({ title: t("bookingError"), description: msg, variant: "destructive" });
          setPendingSlot(null);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black uppercase italic text-primary">{t("courts")}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience premium padel on our meticulously maintained indoor and outdoor courts.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {terrains?.filter(t => t.isActive).map((terrain) => (
              <Card key={terrain.id} className="bg-card border-border overflow-hidden flex flex-col">
                <div className="h-48 overflow-hidden bg-muted relative">
                  <img
                    src={terrain.type === 'indoor' ? '/src/assets/images/terrain-indoor.png' : '/src/assets/images/terrain-outdoor.png'}
                    alt={terrain.name}
                    className="w-full h-full object-cover transition-transform hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-background/80 text-primary uppercase backdrop-blur">
                    {terrain.type}
                  </span>
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold uppercase">{terrain.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <p className="text-muted-foreground">{terrain.description}</p>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-primary" />
                        <span>{terrain.openingTime} – {terrain.closingTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-primary" />
                        <span>{terrain.pricePerPerson} TND / person</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 mt-4"
                    onClick={() => {
                      setSelectedTerrain({ id: terrain.id, name: terrain.name });
                      setSelectedDate(NEXT_7_DAYS[0]);
                    }}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {t("bookCourt")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedTerrain} onOpenChange={(open) => { if (!open) { setSelectedTerrain(null); setPendingSlot(null); } }}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-primary">
              {t("bookCourt")} — {selectedTerrain?.name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("selectDate")} and pick an available time slot (90 min, 1 token).
            </DialogDescription>
          </DialogHeader>

          {!isSignedIn && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              You must be signed in to book a court.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">{t("selectDate")}</p>
              <div className="flex gap-2 flex-wrap">
                {NEXT_7_DAYS.map((day) => {
                  const isSelected = day.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-foreground hover:border-primary"
                      }`}
                    >
                      <div className="text-center">
                        <div>{format(day, "EEE")}</div>
                        <div className="text-xs opacity-80">{format(day, "dd/MM")}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {t("availableSlots")} — {format(selectedDate, "EEEE d MMMM")}
              </p>
              {selectedTerrain && (
                <SlotGrid
                  terrainId={selectedTerrain.id}
                  date={dateStr}
                  onBook={handleBook}
                  isPending={createReservation.isPending}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingSlot} onOpenChange={(open) => { if (!open) setPendingSlot(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase text-primary">{t("confirmBooking")}</DialogTitle>
          </DialogHeader>
          {pendingSlot && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-background border border-border space-y-1">
                <p className="font-bold">{selectedTerrain?.name}</p>
                <p className="text-muted-foreground text-sm">{format(new Date(pendingSlot), "PPP")}</p>
                <p className="text-primary font-semibold">{format(new Date(pendingSlot), "HH:mm")} – {format(new Date(new Date(pendingSlot).getTime() + 90 * 60 * 1000), "HH:mm")}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4 text-primary" />
                <span>1 {t("tokensRequired")} will be deducted from your wallet.</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setPendingSlot(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  className="flex-1 bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                  onClick={confirmBooking}
                  disabled={createReservation.isPending}
                >
                  {createReservation.isPending ? "..." : t("bookNow")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
