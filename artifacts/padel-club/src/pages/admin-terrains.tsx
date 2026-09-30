import { useState } from "react";
import {
  useListTerrains,
  useCreateTerrain,
  useUpdateTerrain,
  useDeleteTerrain,
  getListTerrainsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Page, PageHeader } from "@/components/smash/primitives";
import { useTx } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";

type TerrainForm = {
  name: string;
  description: string;
  type: string;
  pricePerPerson: string;
  capacity: string;
  openingTime: string;
  closingTime: string;
};
const defaultForm: TerrainForm = {
  name: "",
  description: "",
  type: "indoor",
  pricePerPerson: "25",
  capacity: "4",
  openingTime: "08:00",
  closingTime: "23:00",
};

export default function AdminTerrains() {
  const tx = useTx();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: terrains, isLoading } = useListTerrains();
  const createMutation = useCreateTerrain();
  const updateMutation = useUpdateTerrain();
  const deleteMutation = useDeleteTerrain();

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TerrainForm>(defaultForm);

  function openCreate() {
    setForm(defaultForm);
    setCreateOpen(true);
  }
  function openEdit(t: any) {
    setEditId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? "",
      type: t.type,
      pricePerPerson: String(t.pricePerPerson),
      capacity: String(t.capacity),
      openingTime: t.openingTime,
      closingTime: t.closingTime,
    });
  }
  function handleSave() {
    const payload = {
      name: form.name,
      description: form.description,
      type: form.type as any,
      pricePerPerson: parseFloat(form.pricePerPerson),
      capacity: parseInt(form.capacity),
      openingTime: form.openingTime,
      closingTime: form.closingTime,
    };
    if (editId) {
      updateMutation.mutate(
        { id: editId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Terrain updated" });
            setEditId(null);
            queryClient.invalidateQueries({ queryKey: getListTerrainsQueryKey() });
          },
          onError: () => toast({ title: "Error updating", variant: "destructive" }),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Terrain created" });
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: getListTerrainsQueryKey() });
          },
          onError: () => toast({ title: "Error creating", variant: "destructive" }),
        },
      );
    }
  }
  function handleToggle(t: any) {
    updateMutation.mutate(
      { id: t.id, data: { isActive: !t.isActive } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTerrainsQueryKey() }),
      },
    );
  }
  function handleDelete(id: number) {
    if (!confirm("Delete this terrain?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Terrain deleted" });
          queryClient.invalidateQueries({ queryKey: getListTerrainsQueryKey() });
        },
      },
    );
  }

  const formFields = (
    <div className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input
          data-testid="input-terrain-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Court A"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Description (optional)"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger data-testid="select-terrain-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="indoor">Indoor</SelectItem>
              <SelectItem value="outdoor">Outdoor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Capacity</Label>
          <Input
            type="number"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Opening Time</Label>
          <Input
            type="time"
            value={form.openingTime}
            onChange={(e) => setForm((f) => ({ ...f, openingTime: e.target.value }))}
          />
        </div>
        <div>
          <Label>Closing Time</Label>
          <Input
            type="time"
            value={form.closingTime}
            onChange={(e) => setForm((f) => ({ ...f, closingTime: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <Label>Price per person (TND)</Label>
        <Input
          type="number"
          value={form.pricePerPerson}
          onChange={(e) => setForm((f) => ({ ...f, pricePerPerson: e.target.value }))}
        />
      </div>
      <Button
        data-testid="btn-save-terrain"
        onClick={handleSave}
        disabled={createMutation.isPending || updateMutation.isPending}
        className="w-full"
        size="lg"
      >
        {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Terrain"}
      </Button>
    </div>
  );

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
        subtitle={tx({
          fr: "Vos terrains, horaires et prix.",
          en: "Your courts, hours and prices.",
          ar: "ملاعبك وأوقاتها وأسعارها.",
        })}
        actions={
          <>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-create-terrain" onClick={openCreate}>
                  <Plus /> Add Terrain
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>New Terrain</DialogTitle>
                </DialogHeader>
                {formFields}
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {terrains?.map((t) => (
            <Card key={t.id} data-testid={`card-terrain-${t.id}`} className="bg-card border-border">
              <CardContent className="pt-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg">{t.name}</span>
                    <Badge variant="outline" className="text-xs capitalize border-border">
                      {t.type}
                    </Badge>
                    {!t.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.openingTime}–{t.closingTime} · {t.capacity} players · {t.pricePerPerson}{" "}
                    TND/person
                  </p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={t.isActive}
                      onCheckedChange={() => handleToggle(t)}
                      data-testid={`switch-terrain-${t.id}`}
                    />
                    <Label className="text-xs text-muted-foreground">
                      {t.isActive ? "Active" : "Inactive"}
                    </Label>
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
                        data-testid={`btn-edit-terrain-${t.id}`}
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[560px]">
                      <DialogHeader>
                        <DialogTitle>Edit Terrain</DialogTitle>
                      </DialogHeader>
                      {formFields}
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`btn-delete-terrain-${t.id}`}
                    onClick={() => handleDelete(t.id)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!terrains?.length && (
            <div className="text-center py-12 text-muted-foreground">
              No terrains yet. Add your first court.
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
