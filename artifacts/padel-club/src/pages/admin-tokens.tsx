import { useState } from "react";
import { useListAllTokenTransactions, useAdjustUserTokens, useListUsers, getListAllTokenTransactionsQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function AdminTokens() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [userFilter, setUserFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", amount: "", type: "credit", description: "", notes: "" });

  const params: Record<string, any> = { page, limit: 25 };
  if (userFilter !== "all") params.userId = parseInt(userFilter);
  if (typeFilter !== "all") params.type = typeFilter;

  const { data, isLoading } = useListAllTokenTransactions(params, { query: { queryKey: getListAllTokenTransactionsQueryKey(params) } });
  const { data: usersData } = useListUsers({}, { query: { queryKey: getListUsersQueryKey({}) } });
  const adjustMutation = useAdjustUserTokens();

  function handleAdjust() {
    if (!form.userId || !form.amount || !form.description) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    adjustMutation.mutate({
      data: { userId: parseInt(form.userId), amount: parseInt(form.amount), type: form.type as any, description: form.description, notes: form.notes || undefined },
    }, {
      onSuccess: () => {
        toast({ title: "Tokens adjusted" });
        setDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getListAllTokenTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: () => toast({ title: "Error", variant: "destructive" }),
    });
  }

  const typeIcon = (type: string) => {
    if (type === "credit") return <TrendingUp className="h-3 w-3 text-primary" />;
    if (type === "debit") return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <RefreshCw className="h-3 w-3 text-muted-foreground" />;
  };

  const typeColor = (type: string) => {
    if (type === "credit") return "bg-primary/10 text-primary border-primary/30";
    if (type === "debit") return "bg-destructive/10 text-destructive border-destructive/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold uppercase text-primary">Token Management</h1>
            <p className="text-muted-foreground text-sm">Credits, debits, and transaction history</p>
          </div>
          <div className="ml-auto">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="btn-new-transaction" className="bg-primary text-primary-foreground font-bold">
                  <Plus className="h-4 w-4 mr-2" /> Adjust Tokens
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader><DialogTitle>Adjust Tokens</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Member *</Label>
                    <Select onValueChange={v => setForm(f => ({ ...f, userId: v }))}>
                      <SelectTrigger data-testid="select-adjust-user"><SelectValue placeholder="Select member" /></SelectTrigger>
                      <SelectContent>
                        {usersData?.data?.filter(u => u.role === "player").map(u => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.email} ({u.tokenBalance} tokens)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Amount *</Label>
                      <Input data-testid="input-adjust-amount" type="number" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="4" />
                    </div>
                    <div>
                      <Label>Type *</Label>
                      <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                        <SelectTrigger data-testid="select-adjust-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credit">Credit</SelectItem>
                          <SelectItem value="debit">Debit</SelectItem>
                          <SelectItem value="adjustment">Adjustment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Description *</Label>
                    <Input data-testid="input-adjust-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Cash payment — 100 TND" />
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes" />
                  </div>
                  <Button data-testid="btn-confirm-adjust" onClick={handleAdjust} disabled={adjustMutation.isPending} className="w-full bg-primary text-primary-foreground font-bold">
                    {adjustMutation.isPending ? "Processing..." : "Confirm Adjustment"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-52 bg-card border-border"><SelectValue placeholder="All members" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All members</SelectItem>
              {usersData?.data?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 bg-card border-border"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (
          <Card className="bg-card border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/20">
                  <tr>
                    <th className="text-left p-4 font-medium text-muted-foreground">Member</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Balance After</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Description</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data?.map(tx => (
                    <tr key={tx.id} data-testid={`row-transaction-${tx.id}`} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="p-4">
                        <div className="text-xs text-muted-foreground">{tx.user?.email}</div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={`text-xs capitalize flex items-center gap-1 w-fit ${typeColor(tx.type)}`}>
                          {typeIcon(tx.type)} {tx.type}
                        </Badge>
                      </td>
                      <td className="p-4 font-bold">{tx.type === "debit" ? "-" : "+"}{tx.amount}</td>
                      <td className="p-4 font-medium text-primary">{tx.balanceAfter}</td>
                      <td className="p-4 text-muted-foreground">{tx.description}</td>
                      <td className="p-4 text-muted-foreground text-xs">{format(new Date(tx.createdAt), "MMM d, yyyy HH:mm")}</td>
                    </tr>
                  ))}
                  {!data?.data?.length && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No transactions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data && data.total > 25 && (
              <div className="flex justify-between items-center p-4 border-t border-border">
                <span className="text-sm text-muted-foreground">{data.total} total transactions</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 25 >= data.total}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
