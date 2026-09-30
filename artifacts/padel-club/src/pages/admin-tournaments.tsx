import { useState } from "react";
import {
  useListTournaments,
  useCreateTournament,
  useUpdateTournament,
  getListTournamentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Page, PageHeader } from "@/components/smash/primitives";
import { useTx } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trophy } from "lucide-react";
import { format } from "date-fns";

type TournamentForm = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  maxTeams: string;
  status: string;
  prizeInfo: string;
};
const defaultForm: TournamentForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  maxTeams: "",
  status: "upcoming",
  prizeInfo: "",
};

const statusColors: Record<string, string> = {
  upcoming: "border-transparent bg-secondary text-muted-foreground",
  open: "border-transparent bg-ball text-night",
  ongoing: "border-transparent bg-court text-white",
  completed: "border-transparent bg-[#DDF5E7] text-[#0F6B3C]",
  cancelled: "border-transparent bg-[#FDE4E4] text-[#A3262B]",
};

export default function AdminTournaments() {
  const tx = useTx();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TournamentForm>(defaultForm);

  const { data: tournaments, isLoading } = useListTournaments({
    query: { queryKey: getListTournamentsQueryKey() },
  });
  const createMutation = useCreateTournament();
  const updateMutation = useUpdateTournament();

  function openCreate() {
    setForm(defaultForm);
    setCreateOpen(true);
  }
  function openEdit(t: any) {
    setEditId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? "",
      status: t.status,
      prizeInfo: t.prizeInfo ?? "",
      maxTeams: t.maxTeams ? String(t.maxTeams) : "",
      startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 16) : "",
      endDate: t.endDate ? new Date(t.endDate).toISOString().slice(0, 16) : "",
    });
  }

  function handleSave() {
    if (!form.name || !form.startDate) {
      toast({ title: "Name and start date required", variant: "destructive" });
      return;
    }
    const payload: any = {
      name: form.name,
      description: form.description || undefined,
      startDate: new Date(form.startDate).toISOString(),
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      maxTeams: form.maxTeams ? parseInt(form.maxTeams) : undefined,
      status: form.status as any,
      prizeInfo: form.prizeInfo || undefined,
    };
    if (editId) {
      updateMutation.mutate(
        { id: editId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Tournament updated" });
            setEditId(null);
            queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
          },
          onError: () => toast({ title: "Error", variant: "destructive" }),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Tournament created" });
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
          },
          onError: () => toast({ title: "Error", variant: "destructive" }),
        },
      );
    }
  }

  const formFields = (
    <div className="space-y-4">
      <div>
        <Label>Name *</Label>
        <Input
          data-testid="input-tournament-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Summer Championship"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Tournament description"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start Date *</Label>
          <Input
            type="datetime-local"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <Label>End Date</Label>
          <Input
            type="datetime-local"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger data-testid="select-tournament-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Max Teams</Label>
          <Input
            type="number"
            value={form.maxTeams}
            onChange={(e) => setForm((f) => ({ ...f, maxTeams: e.target.value }))}
            placeholder="8"
          />
        </div>
      </div>
      <div>
        <Label>Prize Info</Label>
        <Input
          value={form.prizeInfo}
          onChange={(e) => setForm((f) => ({ ...f, prizeInfo: e.target.value }))}
          placeholder="e.g. 1st place: 500 TND"
        />
      </div>
      <Button
        data-testid="btn-save-tournament"
        onClick={handleSave}
        disabled={createMutation.isPending || updateMutation.isPending}
        className="w-full"
        size="lg"
      >
        {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Tournament"}
      </Button>
    </div>
  );

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Tournois", en: "Tournaments", ar: "البطولات" })}
        subtitle={tx({
          fr: "Créez et gérez les tournois.",
          en: "Create and manage tournaments.",
          ar: "أنشئ البطولات وأدرها.",
        })}
        actions={
          <>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-create-tournament" onClick={openCreate}>
                  <Plus /> New Tournament
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>New Tournament</DialogTitle>
                </DialogHeader>
                {formFields}
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments?.map((t) => (
            <Card
              key={t.id}
              data-testid={`card-tournament-${t.id}`}
              className="bg-card border-border"
            >
              <CardContent className="pt-4 flex items-center gap-4">
                <Trophy className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-lg">{t.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${statusColors[t.status] ?? ""}`}
                    >
                      {t.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {format(new Date(t.startDate), "MMM d, yyyy")}
                    {t.endDate && ` — ${format(new Date(t.endDate), "MMM d, yyyy")}`}
                    {t.maxTeams && ` · ${t.registeredTeams}/${t.maxTeams} teams`}
                  </div>
                  {t.prizeInfo && (
                    <p className="text-xs text-muted-foreground mt-1">{t.prizeInfo}</p>
                  )}
                </div>
                <Dialog
                  open={editId === t.id}
                  onOpenChange={(o) => {
                    if (!o) setEditId(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`btn-edit-tournament-${t.id}`}
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[560px]">
                    <DialogHeader>
                      <DialogTitle>Edit Tournament</DialogTitle>
                    </DialogHeader>
                    {formFields}
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
          {!tournaments?.length && (
            <div className="text-center py-12 text-muted-foreground">
              No tournaments yet. Create your first one.
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
