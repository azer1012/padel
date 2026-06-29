import { useState } from "react";
import { useListNews, useCreateNews, useUpdateNews, useDeleteNews, getListNewsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Globe } from "lucide-react";
import { format } from "date-fns";

type NewsForm = { title: string; excerpt: string; content: string; imageUrl: string; category: string; isPublished: boolean; };
const defaultForm: NewsForm = { title: "", excerpt: "", content: "", imageUrl: "", category: "", isPublished: false };

export default function AdminNews() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<NewsForm>(defaultForm);

  const { data, isLoading } = useListNews({ page: 1, limit: 50 }, { query: { queryKey: getListNewsQueryKey({ page: 1, limit: 50 }) } });
  const createMutation = useCreateNews();
  const updateMutation = useUpdateNews();
  const deleteMutation = useDeleteNews();

  function openCreate() { setForm(defaultForm); setCreateOpen(true); }
  function openEdit(a: any) {
    setEditId(a.id);
    setForm({ title: a.title, excerpt: a.excerpt ?? "", content: a.content, imageUrl: a.imageUrl ?? "", category: a.category ?? "", isPublished: a.isPublished });
  }

  function handleSave() {
    const payload = { title: form.title, excerpt: form.excerpt || undefined, content: form.content, imageUrl: form.imageUrl || undefined, category: form.category || undefined, isPublished: form.isPublished };
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => { toast({ title: "Article updated" }); setEditId(null); queryClient.invalidateQueries({ queryKey: getListNewsQueryKey() }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast({ title: "Article created" }); setCreateOpen(false); queryClient.invalidateQueries({ queryKey: getListNewsQueryKey() }); },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      });
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this article?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Article deleted" }); queryClient.invalidateQueries({ queryKey: getListNewsQueryKey() }); },
    });
  }

  function handleTogglePublish(a: any) {
    updateMutation.mutate({ id: a.id, data: { isPublished: !a.isPublished } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNewsQueryKey() }),
    });
  }

  const FormFields = () => (
    <div className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input data-testid="input-news-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Article title" />
      </div>
      <div>
        <Label>Excerpt</Label>
        <Input value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Short summary" />
      </div>
      <div>
        <Label>Content *</Label>
        <textarea
          className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          placeholder="Article content..."
        />
      </div>
      <div>
        <Label>Image URL</Label>
        <Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div>
        <Label>Category</Label>
        <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Tournament, News, Event" />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} data-testid="switch-publish" />
        <Label>Publish immediately</Label>
      </div>
      <Button data-testid="btn-save-article" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-primary text-primary-foreground font-bold">
        {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Article"}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold uppercase text-primary">News & Events</h1>
            <p className="text-muted-foreground text-sm">Manage club articles and announcements</p>
          </div>
          <div className="ml-auto">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-create-article" onClick={openCreate} className="bg-primary text-primary-foreground font-bold">
                  <Plus className="h-4 w-4 mr-2" /> New Article
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New Article</DialogTitle></DialogHeader>
                <FormFields />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : (
          <div className="space-y-3">
            {data?.data?.map(a => (
              <Card key={a.id} data-testid={`card-article-${a.id}`} className="bg-card border-border">
                <CardContent className="pt-4 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{a.title}</span>
                      {a.category && <Badge variant="outline" className="text-xs border-border text-muted-foreground">{a.category}</Badge>}
                      {a.isPublished
                        ? <Badge variant="outline" className="text-xs border-primary/30 text-primary"><Globe className="h-3 w-3 mr-1" /> Published</Badge>
                        : <Badge variant="outline" className="text-xs border-border text-muted-foreground">Draft</Badge>
                      }
                    </div>
                    {a.excerpt && <p className="text-sm text-muted-foreground mt-1">{a.excerpt}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch checked={a.isPublished} onCheckedChange={() => handleTogglePublish(a)} data-testid={`switch-publish-${a.id}`} />
                    </div>
                    <Dialog open={editId === a.id} onOpenChange={o => { if (!o) setEditId(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`btn-edit-article-${a.id}`} onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Edit Article</DialogTitle></DialogHeader>
                        <FormFields />
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" data-testid={`btn-delete-article-${a.id}`} onClick={() => handleDelete(a.id)} className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!data?.data?.length && (
              <div className="text-center py-12 text-muted-foreground">No articles yet. Create your first piece.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
