import { useState } from "react";
import { useListReservations, useCancelReservation, useCreateReservation, useListTerrains, useListUsers, getListReservationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, X, CalendarDays } from "lucide-react";
import { format } from "date-fns";

export default function AdminReservations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [terrainFilter, setTerrainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const params: Record<string, any> = { page, limit: 20 };
  if (date) params.date = date;
  if (terrainFilter !== "all") params.terrainId = parseInt(terrainFilter);
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, isLoading } = useListReservations(params, {
    query: { queryKey: getListReservationsQueryKey(params) },
  });
  const { data: terrains } = useListTerrains();
  const { data: usersData } = useListUsers();
  const cancelMutation = useCancelReservation();
  const createMutation = useCreateReservation();

  const [newBooking, setNewBooking] = useState({
    terrainId: "",
    startTime: "",
    userId: "",
    guestName: "",
    bookingType: "manual" as const,
    notes: "",
  });

  function handleCancel(id: number) {
    cancelMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reservation cancelled" });
        queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey() });
      },
    });
  }

  function handleCreate() {
    if (!newBooking.terrainId || !newBooking.startTime) {
      toast({ title: "Please fill terrain and time", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        terrainId: parseInt(newBooking.terrainId),
        startTime: new Date(newBooking.startTime).toISOString(),
        userId: newBooking.userId ? parseInt(newBooking.userId) : undefined,
        guestName: newBooking.guestName || undefined,
        bookingType: newBooking.bookingType,
        notes: newBooking.notes || undefined,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Reservation created" });
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey() });
      },
      onError: (e: any) => toast({ title: e?.message ?? "Error", variant: "destructive" }),
    });
  }

  const statusColor = (status: string) => {
    if (status === "confirmed") return "bg-primary/20 text-primary border-primary/30";
    if (status === "cancelled") return "bg-destructive/20 text-destructive border-destructive/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin"><Button variant="ghost" size="icon" data-testid="btn-back"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold uppercase text-primary">Reservations</h1>
            <p className="text-muted-foreground text-sm">Manage all court bookings</p>
          </div>
          <div className="ml-auto">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-create-reservation" className="bg-primary text-primary-foreground font-bold">
                  <Plus className="h-4 w-4 mr-2" /> New Booking
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Manual Booking</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Select onValueChange={v => setNewBooking(b => ({ ...b, terrainId: v }))}>
                    <SelectTrigger data-testid="select-terrain"><SelectValue placeholder="Select terrain" /></SelectTrigger>
                    <SelectContent>
                      {terrains?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input data-testid="input-start-time" type="datetime-local" value={newBooking.startTime} onChange={e => setNewBooking(b => ({ ...b, startTime: e.target.value }))} />
                  <Select onValueChange={v => setNewBooking(b => ({ ...b, userId: v }))}>
                    <SelectTrigger data-testid="select-user"><SelectValue placeholder="Select member (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No member (guest)</SelectItem>
                      {usersData?.data?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!newBooking.userId && (
                    <Input data-testid="input-guest-name" placeholder="Guest name" value={newBooking.guestName} onChange={e => setNewBooking(b => ({ ...b, guestName: e.target.value }))} />
                  )}
                  <Select defaultValue="manual" onValueChange={v => setNewBooking(b => ({ ...b, bookingType: v as any }))}>
                    <SelectTrigger data-testid="select-booking-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Notes (optional)" value={newBooking.notes} onChange={e => setNewBooking(b => ({ ...b, notes: e.target.value }))} />
                  <Button data-testid="btn-confirm-booking" onClick={handleCreate} disabled={createMutation.isPending} className="w-full bg-primary text-primary-foreground font-bold">
                    {createMutation.isPending ? "Creating..." : "Create Booking"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3">
              <Input data-testid="input-date-filter" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40 bg-background" placeholder="Filter by date" />
              <Select value={terrainFilter} onValueChange={setTerrainFilter}>
                <SelectTrigger data-testid="select-terrain-filter" className="w-44 bg-background"><SelectValue placeholder="All terrains" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All terrains</SelectItem>
                  {terrains?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter" className="w-36 bg-background"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              {(date || terrainFilter !== "all" || statusFilter !== "all") && (
                <Button variant="ghost" size="sm" onClick={() => { setDate(""); setTerrainFilter("all"); setStatusFilter("all"); }}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (
          <Card className="bg-card border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/20">
                  <tr>
                    <th className="text-left p-4 font-medium text-muted-foreground">Player</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Terrain</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Date & Time</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data?.map(r => (
                    <tr key={r.id} data-testid={`row-reservation-${r.id}`} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="p-4">
                        <div className="font-medium">{r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email : r.guestName ?? "Guest"}</div>
                        <div className="text-xs text-muted-foreground">{r.user?.email}</div>
                      </td>
                      <td className="p-4 text-muted-foreground">{r.terrain?.name}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 text-primary" />
                          {format(new Date(r.startTime), "MMM d, yyyy HH:mm")}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="text-xs capitalize border-border">{r.bookingType}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={`text-xs capitalize ${statusColor(r.status)}`}>{r.status}</Badge>
                      </td>
                      <td className="p-4 text-right">
                        {r.status !== "cancelled" && (
                          <Button data-testid={`btn-cancel-${r.id}`} variant="ghost" size="sm" onClick={() => handleCancel(r.id)} disabled={cancelMutation.isPending} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data?.data?.length && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No reservations found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data && data.total > 20 && (
              <div className="flex justify-between items-center p-4 border-t border-border">
                <span className="text-sm text-muted-foreground">{data.total} total</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= data.total}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
