import React, { useState, useMemo } from "react";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useGetCalendar, useCreateReservation, useJoinSession, useCreateInvite, useMakeSessionPublic, useMakeSessionPrivate, getCalendarQueryKey, getListReservationsQueryKey, getListUpcomingReservationsQueryKey, getGetTokenBalanceQueryKey, useLeaveSession, useUpdatePlayerPayment, getOpenMatchesQueryKey, useCancelReservation } from "@workspace/api-client-react";
import type { CalendarSlot, CalendarTerrain } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";
import { useI18n } from "@/lib/i18n";
import { Calendar, Users, Zap, Clock, Link, Globe, Lock, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

function getWeekStart(offset = 0): Date {
  const d = addDays(new Date(), offset * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

type BookingModal =
  | { type: "book"; slot: CalendarSlot; terrain: CalendarTerrain["terrain"] }
  | { type: "session"; slot: CalendarSlot; terrain: CalendarTerrain["terrain"] }
  | null;

function OccupancyBar({ filled, total }: { filled: number; total: number }) {
  const pct = Math.min((filled / total) * 100, 100);
  const color = pct >= 100 ? "bg-destructive" : pct >= 50 ? "bg-yellow-500" : "bg-primary";
  return (
    <div className="mt-1 w-full h-1 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SlotCell({
  slot,
  onClickAvailable,
  onClickBooked,
  currentUserId,
  isAdmin,
}: {
  slot: CalendarSlot;
  onClickAvailable: () => void;
  onClickBooked: () => void;
  currentUserId: number | null;
  isAdmin: boolean;
}) {
  const userIsInSession = slot.players.some(p => p.userId === currentUserId);

  if (slot.status === "past") {
    return (
      <div className="h-16 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center opacity-40">
        <span className="text-xs text-muted-foreground">{format(new Date(slot.startTime), "HH:mm")}</span>
      </div>
    );
  }

  if (slot.status === "available") {
    return (
      <button
        onClick={onClickAvailable}
        className="h-16 w-full rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/15 hover:border-primary transition-all group flex flex-col items-center justify-center gap-0.5"
      >
        <span className="text-xs font-semibold text-primary">{format(new Date(slot.startTime), "HH:mm")}</span>
        <span className="text-[10px] text-primary/60 group-hover:text-primary/80 transition-colors">Disponible</span>
      </button>
    );
  }

  // booked: partial or full
  const isFull = slot.status === "full";
  const isMySession = userIsInSession;

  let cellBg = "bg-destructive/15 border-destructive/40";
  if (isMySession) cellBg = "bg-blue-500/15 border-blue-500/50";
  else if (!isFull && slot.isPublic) cellBg = "bg-yellow-500/15 border-yellow-500/50";
  else if (!isFull) cellBg = "bg-orange-500/15 border-orange-500/40";

  return (
    <button
      onClick={onClickBooked}
      className={cn("h-16 w-full rounded-lg border flex flex-col items-start justify-between p-1.5 transition-all hover:brightness-110", cellBg)}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-[10px] font-bold text-foreground">{format(new Date(slot.startTime), "HH:mm")}</span>
        {isMySession && <span className="text-[9px] text-blue-400 font-semibold">YOU</span>}
        {slot.isPublic && !isMySession && <Globe className="h-2.5 w-2.5 text-yellow-400" />}
      </div>
      <div className="w-full">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Users className="h-2.5 w-2.5" />
            {slot.filledSpots}/{slot.totalSpots}
          </span>
          {isFull && <span className="text-[9px] text-destructive font-bold">COMPLET</span>}
        </div>
        <OccupancyBar filled={slot.filledSpots} total={slot.totalSpots} />
      </div>
    </button>
  );
}

function BookingModal({
  modal,
  onClose,
  currentUserId,
  isAdmin,
}: {
  modal: BookingModal;
  onClose: () => void;
  currentUserId: number | null;
  isAdmin: boolean;
}) {
  const [bookingMode, setBookingMode] = useState<"full_court" | "own_spot">("full_court");
  const [isPublic, setIsPublic] = useState(false);
  const [publicDescription, setPublicDescription] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const { toast } = useToast();
  const qc = useQueryClient();

  const createReservation = useCreateReservation();
  const joinSession = useJoinSession();
  const leaveSession = useLeaveSession();
  const createInvite = useCreateInvite();
  const makePublic = useMakeSessionPublic();
  const makePrivate = useMakeSessionPrivate();
  const updatePlayerPayment = useUpdatePlayerPayment();
  const cancelReservation = useCancelReservation();

  if (!modal) return null;
  const { slot, terrain } = modal;

  const invalidateAll = () => {
    const dateStr = new Date(slot.startTime).toISOString().split("T")[0];
    qc.invalidateQueries({ queryKey: getCalendarQueryKey({ date: dateStr }) });
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
    qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
  };

  const userIsInSession = slot.players.some(p => p.userId === currentUserId);

  const handleBook = () => {
    createReservation.mutate(
      {
        data: {
          terrainId: terrain.id,
          startTime: slot.startTime,
          bookingMode,
          isPublic: bookingMode === "own_spot" ? isPublic : false,
          publicDescription: (bookingMode === "own_spot" && isPublic) ? publicDescription : undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Réservation confirmée!", description: `${terrain.name} — ${format(new Date(slot.startTime), "PPP p", { locale: fr })}` });
          invalidateAll();
          onClose();
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "Erreur lors de la réservation";
          toast({ title: "Erreur", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleJoin = () => {
    if (!slot.reservationId) return;
    joinSession.mutate({ id: slot.reservationId }, {
      onSuccess: () => {
        toast({ title: "Place réservée!", description: "Vous avez rejoint la session." });
        invalidateAll();
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Erreur", description: err?.data?.error ?? "Impossible de rejoindre", variant: "destructive" });
      },
    });
  };

  const handleLeave = () => {
    if (!slot.reservationId) return;
    leaveSession.mutate({ id: slot.reservationId }, {
      onSuccess: () => {
        toast({ title: "Place libérée", description: "Vous avez quitté la session. Token remboursé." });
        invalidateAll();
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Erreur", description: err?.data?.error ?? "Impossible de quitter", variant: "destructive" });
      },
    });
  };

  const handleInvite = () => {
    if (!slot.reservationId) return;
    createInvite.mutate({ id: slot.reservationId }, {
      onSuccess: (data) => {
        setInviteUrl(data.inviteUrl || `${window.location.origin}/join/${data.token}`);
        toast({ title: "Lien d'invitation créé!" });
      },
      onError: () => toast({ title: "Erreur", description: "Impossible de créer l'invitation", variant: "destructive" }),
    });
  };

  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    });
  };

  const handleTogglePublic = () => {
    if (!slot.reservationId) return;
    if (slot.isPublic) {
      makePrivate.mutate({ id: slot.reservationId }, {
        onSuccess: () => { toast({ title: "Session rendue privée" }); invalidateAll(); onClose(); },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      });
    } else {
      makePublic.mutate({ id: slot.reservationId }, {
        onSuccess: () => { toast({ title: "Session rendue publique" }); invalidateAll(); onClose(); },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      });
    }
  };

  const handleAdminPayment = (playerId: number, paymentStatus: string) => {
    if (!slot.reservationId) return;
    updatePlayerPayment.mutate({ reservationId: slot.reservationId, playerId, paymentStatus }, {
      onSuccess: () => { toast({ title: "Paiement mis à jour" }); invalidateAll(); },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    });
  };

  const handleAdminCancel = () => {
    if (!slot.reservationId) return;
    cancelReservation.mutate({ id: slot.reservationId }, {
      onSuccess: () => {
        toast({ title: "Réservation annulée (admin)" });
        invalidateAll();
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Erreur", description: err?.data?.error ?? "Impossible d'annuler", variant: "destructive" });
      },
    });
  };

  const handleAdminAssignPlayer = async () => {
    if (!slot.reservationId || !assignUserId.trim()) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`/api/reservations/${slot.reservationId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parseInt(assignUserId), paymentType: "cash", paymentStatus: "pending" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Erreur", description: err.error ?? "Impossible d'assigner", variant: "destructive" });
        return;
      }
      toast({ title: "Joueur assigné à la session" });
      setAssignUserId("");
      invalidateAll();
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAdminBlockSlot = async () => {
    try {
      const res = await fetch("/api/admin/slots/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terrainId: terrain.id, startTime: slot.startTime, reason: "Maintenance" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Erreur", description: err.error ?? "Impossible de bloquer", variant: "destructive" });
        return;
      }
      toast({ title: "Créneau bloqué pour maintenance" });
      invalidateAll();
      onClose();
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    }
  };

  const isLoading = createReservation.isPending || joinSession.isPending || leaveSession.isPending || cancelReservation.isPending;

  if (modal.type === "book") {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-primary">Réserver un créneau</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {terrain.name} — {format(new Date(slot.startTime), "EEEE d MMMM", { locale: fr })}
              {" · "}{format(new Date(slot.startTime), "HH:mm")}–{format(new Date(slot.endTime), "HH:mm")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Mode de réservation</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBookingMode("full_court")}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    bookingMode === "full_court"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/50"
                  )}
                >
                  <div className="font-bold text-sm">Court complet</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Réservez les 4 places</div>
                  <div className="mt-2 flex items-center gap-1 text-primary font-bold text-sm">
                    <Zap className="h-3.5 w-3.5" /> 4 tokens
                  </div>
                </button>
                <button
                  onClick={() => setBookingMode("own_spot")}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    bookingMode === "own_spot"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/50"
                  )}
                >
                  <div className="font-bold text-sm">Ma place</div>
                  <div className="text-xs text-muted-foreground mt-0.5">1 place, 3 ouvertes</div>
                  <div className="mt-2 flex items-center gap-1 text-primary font-bold text-sm">
                    <Zap className="h-3.5 w-3.5" /> 1 token
                  </div>
                </button>
              </div>
            </div>

            {bookingMode === "own_spot" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={e => setIsPublic(e.target.checked)}
                    className="rounded accent-primary"
                  />
                  <span className="text-sm">Rendre cette session publique (open match)</span>
                </label>
                {isPublic && (
                  <input
                    type="text"
                    value={publicDescription}
                    onChange={e => setPublicDescription(e.target.value)}
                    placeholder="Description (ex: débutant bienvenu)"
                    className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground"
                  />
                )}
              </div>
            )}

            <div className="p-3 rounded-lg bg-background border border-border space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Court</span>
                <span className="font-semibold">{terrain.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Horaire</span>
                <span className="font-semibold">{format(new Date(slot.startTime), "HH:mm")}–{format(new Date(slot.endTime), "HH:mm")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tokens</span>
                <span className="font-bold text-primary">{bookingMode === "own_spot" ? 1 : 4} token{bookingMode !== "own_spot" ? "s" : ""}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={isLoading}>
                Annuler
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                onClick={handleBook}
                disabled={isLoading}
              >
                {isLoading ? "..." : "Confirmer"}
              </Button>
            </div>

            {isAdmin && (
              <Button
                variant="outline"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={handleAdminBlockSlot}
                disabled={isLoading}
              >
                Bloquer pour maintenance
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Session detail modal
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase text-primary">{terrain.name}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {format(new Date(slot.startTime), "EEEE d MMMM", { locale: fr })} · {format(new Date(slot.startTime), "HH:mm")}–{format(new Date(slot.endTime), "HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", slot.status === "full" ? "border-destructive/50 text-destructive" : "border-yellow-500/50 text-yellow-500")}>
              {slot.status === "full" ? "Complet" : `${slot.openSpots} place${slot.openSpots > 1 ? "s" : ""} libre${slot.openSpots > 1 ? "s" : ""}`}
            </Badge>
            {slot.isPublic && (
              <Badge variant="outline" className="text-xs border-green-500/50 text-green-500">
                <Globe className="h-3 w-3 mr-1" /> Open match
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Joueurs ({slot.filledSpots}/{slot.totalSpots})</p>
            <div className="space-y-1.5">
              {slot.players.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{p.paymentType} · {p.paymentStatus}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.paymentStatus === "paid" ? (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    )}
                    {isAdmin && p.paymentStatus === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 border-primary/50 text-primary"
                        onClick={() => handleAdminPayment(p.id, "paid")}
                        disabled={updatePlayerPayment.isPending}
                      >
                        Marquer payé
                      </Button>
                    )}
                    {isAdmin && p.paymentType === "token" && p.paymentStatus === "paid" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => handleAdminPayment(p.id, "pending")}
                        disabled={updatePlayerPayment.isPending}
                      >
                        ···
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {Array.from({ length: slot.openSpots }, (_, i) => (
                <div key={`empty-${i}`} className="flex items-center p-2 rounded-lg bg-background border border-dashed border-border/50">
                  <div className="h-7 w-7 rounded-full border-2 border-dashed border-border mr-2" />
                  <span className="text-sm text-muted-foreground">Place libre</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {!userIsInSession && slot.openSpots > 0 && slot.bookingMode === "own_spot" && (
              <Button
                className="flex-1 bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                onClick={handleJoin}
                disabled={isLoading}
              >
                <Zap className="h-4 w-4 mr-1" />
                Rejoindre (1 token)
              </Button>
            )}
            {userIsInSession && (
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={handleLeave}
                disabled={isLoading}
              >
                Quitter la session
              </Button>
            )}
            {(userIsInSession || slot.players.some(p => p.userId === currentUserId)) && (
              <Button
                variant="outline"
                className="border-primary/50 text-primary"
                onClick={handleInvite}
                disabled={createInvite.isPending}
              >
                <Link className="h-4 w-4 mr-1" /> Inviter
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                className={cn("border-muted", slot.isPublic ? "text-yellow-500 border-yellow-500/50" : "text-muted-foreground")}
                onClick={handleTogglePublic}
                disabled={makePublic.isPending || makePrivate.isPending}
              >
                {slot.isPublic ? <><Lock className="h-3.5 w-3.5 mr-1" /> Rendre privé</> : <><Globe className="h-3.5 w-3.5 mr-1" /> Rendre public</>}
              </Button>
            )}
            {isAdmin && slot.reservationId && (
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={handleAdminCancel}
                disabled={isLoading}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Annuler (admin)
              </Button>
            )}
          </div>

          {/* Admin: assign player */}
          {isAdmin && slot.openSpots > 0 && slot.bookingMode !== "full_court" && slot.reservationId && (
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigner un joueur (admin)</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="User ID"
                  value={assignUserId}
                  onChange={e => setAssignUserId(e.target.value)}
                  className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  size="sm"
                  onClick={handleAdminAssignPlayer}
                  disabled={isAssigning || !assignUserId.trim()}
                  className="bg-primary text-primary-foreground font-bold"
                >
                  {isAssigning ? "..." : "Assigner"}
                </Button>
              </div>
            </div>
          )}
          {inviteUrl && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <p className="text-xs font-semibold text-primary">Lien d'invitation</p>
              <div className="flex gap-2">
                <code className="text-[10px] text-muted-foreground flex-1 truncate">{inviteUrl}</code>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={copyInvite}>
                  {copiedInvite ? "Copié!" : "Copier"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CourtCalendar({
  isAdmin = false,
  currentUserId = null,
}: {
  isAdmin?: boolean;
  currentUserId?: number | null;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [modal, setModal] = useState<BookingModal>(null);
  const { isSignedIn } = useUser();

  // Week: today + offset*7 → today + offset*7 + 6
  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset]);
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return d.toISOString().split("T")[0];
    }), [weekStart]);

  const dateStr = weekDays[0];
  const endDateStr = weekDays[6];

  const { data: calendarData, isLoading } = useGetCalendar({ date: dateStr, endDate: endDateStr });

  const handleClickAvailable = (slot: CalendarSlot, terrain: CalendarTerrain["terrain"]) => {
    if (!isSignedIn) {
      window.location.href = "/sign-in";
      return;
    }
    setModal({ type: "book", slot, terrain });
  };

  const handleClickBooked = (slot: CalendarSlot, terrain: CalendarTerrain["terrain"]) => {
    setModal({ type: "session", slot, terrain });
  };

  const terrains = calendarData?.terrains ?? [];

  // Build slot lookup: terrainId → date → timeHHMM → slot
  const slotMap = useMemo(() => {
    const map = new Map<string, CalendarSlot>();
    terrains.forEach(({ terrain, slots }) => {
      slots.forEach(slot => {
        const d = slot.startTime.slice(0, 10);
        const t = new Date(slot.startTime).toISOString().slice(11, 16);
        map.set(`${terrain.id}|${d}|${t}`, slot);
      });
    });
    return map;
  }, [terrains]);

  // Unique time-of-day rows (HH:MM), sorted
  const timeRows = useMemo(() => {
    const times = new Set<string>();
    terrains.forEach(({ slots }) =>
      slots.forEach(s => times.add(new Date(s.startTime).toISOString().slice(11, 16)))
    );
    return Array.from(times).sort();
  }, [terrains]);

  const numTerrains = terrains.length;
  const totalCols = 1 + numTerrains * 7; // time col + 7 days × N terrains

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-10 w-20 rounded-lg" />)}</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `72px repeat(${numTerrains * 7 || 3}, 1fr)` }}>
          {[...Array(32)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-1.5 rounded-lg border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex gap-1 flex-wrap">
          {weekDays.map((day) => {
            const isToday = day === new Date().toISOString().split("T")[0];
            return (
              <div
                key={day}
                className={cn(
                  "px-2 py-1 rounded-lg text-xs font-semibold border text-center min-w-[52px]",
                  isToday
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground bg-muted/10"
                )}
              >
                <div className="capitalize">{format(new Date(day + "T12:00:00"), "EEE", { locale: fr })}</div>
                <div className="opacity-70">{format(new Date(day + "T12:00:00"), "dd/MM")}</div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="p-1.5 rounded-lg border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/10 border border-primary/40 inline-block" /> Disponible</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500/15 border border-orange-500/40 inline-block" /> Partiellement</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-destructive/15 border border-destructive/40 inline-block" /> Complet</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/15 border border-blue-500/50 inline-block" /> Votre session</span>
        <span className="flex items-center gap-1"><Globe className="h-3 w-3 text-yellow-400" /> Open match</span>
      </div>

      {/* Full-week grid: time rows × (day × terrain) columns */}
      {terrains.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Aucun terrain disponible</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `64px repeat(${numTerrains * 7}, minmax(80px, 1fr))`,
              minWidth: `${64 + numTerrains * 7 * 80}px`,
            }}
          >
            {/* ── Row 1: Day headers (each spans numTerrains cols) ── */}
            <div className="bg-muted/40 p-2 border-b border-border sticky left-0 z-10" />
            {weekDays.map((day, di) => (
              terrains.map((_, ti) => (
                ti === 0 ? (
                  <div
                    key={`day-${day}`}
                    className="bg-muted/40 p-2 border-b border-l border-border text-center"
                    style={{ gridColumn: `span ${numTerrains}` }}
                  >
                    <div className={cn("text-[11px] font-bold capitalize", day === new Date().toISOString().split("T")[0] ? "text-primary" : "text-foreground")}>
                      {format(new Date(day + "T12:00:00"), "EEEE", { locale: fr })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{format(new Date(day + "T12:00:00"), "dd/MM")}</div>
                  </div>
                ) : null
              ))
            ))}

            {/* ── Row 2: Terrain sub-headers ── */}
            <div className="bg-muted/20 p-1 border-b border-border sticky left-0 z-10" />
            {weekDays.flatMap((day) =>
              terrains.map(({ terrain }) => (
                <div key={`th-${day}-${terrain.id}`} className="bg-muted/20 p-1.5 border-b border-l border-border/60">
                  <div className="text-[9px] font-bold text-foreground/70 uppercase truncate">{terrain.name}</div>
                  <div className="text-[8px] text-muted-foreground">{(terrain as any).pricePerSession ?? ""}</div>
                </div>
              ))
            )}

            {/* ── Time rows ── */}
            {timeRows.map((timeHHMM) => (
              <React.Fragment key={timeHHMM}>
                {/* Time label */}
                <div className="flex flex-col items-center justify-center p-1 border-b border-border/30 bg-muted/10 sticky left-0 z-10">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground mb-0.5" />
                  <span className="text-[10px] font-semibold text-muted-foreground">{timeHHMM}</span>
                </div>
                {/* Cells: day × terrain */}
                {weekDays.flatMap((day) =>
                  terrains.map(({ terrain }) => {
                    const slot = slotMap.get(`${terrain.id}|${day}|${timeHHMM}`);
                    if (!slot) {
                      return (
                        <div
                          key={`${terrain.id}|${day}|${timeHHMM}`}
                          className="p-1 border-b border-l border-border/30 bg-muted/5"
                        />
                      );
                    }
                    return (
                      <div key={`${terrain.id}|${day}|${timeHHMM}`} className="p-1 border-b border-l border-border/30">
                        <SlotCell
                          slot={slot}
                          onClickAvailable={() => handleClickAvailable(slot, terrain)}
                          onClickBooked={() => handleClickBooked(slot, terrain)}
                          currentUserId={currentUserId}
                          isAdmin={isAdmin}
                        />
                      </div>
                    );
                  })
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <BookingModal modal={modal} onClose={() => setModal(null)} currentUserId={currentUserId} isAdmin={isAdmin} />
    </div>
  );
}
