import { useState } from "react";
import {
  useListUsers,
  useGetUser,
  useAdjustUserTokens,
  useListAllTokenTransactions,
  getListUsersQueryKey,
  getGetUserQueryKey,
  getListAllTokenTransactionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Page, PageHeader } from "@/components/smash/primitives";
import { useTx } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Coins, Search } from "lucide-react";
import { format } from "date-fns";

export default function AdminUsers() {
  const tx = useTx();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({
    amount: "",
    type: "credit",
    description: "",
    notes: "",
  });

  const params: Record<string, any> = { page, limit: 20 };
  if (search) params.search = search;

  const { data, isLoading } = useListUsers(params, {
    query: { queryKey: getListUsersQueryKey(params) },
  });
  const { data: selectedUser } = useGetUser(selectedUserId!, {
    query: { enabled: !!selectedUserId, queryKey: getGetUserQueryKey(selectedUserId!) },
  });
  const adjustMutation = useAdjustUserTokens();

  function openTokenDialog(userId: number) {
    setSelectedUserId(userId);
    setTokenForm({ amount: "", type: "credit", description: "", notes: "" });
    setTokenOpen(true);
  }

  function handleAdjust() {
    if (!selectedUserId || !tokenForm.amount || !tokenForm.description) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    adjustMutation.mutate(
      {
        data: {
          userId: selectedUserId,
          amount: parseInt(tokenForm.amount),
          type: tokenForm.type as any,
          description: tokenForm.description,
          notes: tokenForm.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `Tokens ${tokenForm.type}ed successfully` });
          setTokenOpen(false);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(selectedUserId!) });
        },
        onError: () => toast({ title: "Error adjusting tokens", variant: "destructive" }),
      },
    );
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Membres", en: "Members", ar: "الأعضاء" })}
        subtitle={tx({
          fr: "Les joueurs du club et leurs soldes de tokens.",
          en: "Club players and their token balances.",
          ar: "لاعبو النادي وأرصدتهم.",
        })}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-user-search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9 bg-card border-border"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-mist">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground">User</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Role</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Tokens</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Joined</th>
                  <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.data?.map((u) => (
                  <tr
                    key={u.id}
                    data-testid={`row-user-${u.id}`}
                    className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium">
                        {u.firstName || u.lastName
                          ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="p-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${u.role === "admin" ? "border-primary/30 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {u.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-primary text-lg">{u.tokenBalance}</span>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">
                      {format(new Date(u.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        data-testid={`btn-manage-tokens-${u.id}`}
                        variant="outline"
                        size="sm"
                        onClick={() => openTokenDialog(u.id)}
                      >
                        <Coins className="h-3 w-3 mr-1" /> Tokens
                      </Button>
                    </td>
                  </tr>
                ))}
                {!data?.data?.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data && data.total > 20 && (
            <div className="flex justify-between items-center p-4 border-t border-border">
              <span className="text-sm text-muted-foreground">{data.total} total users</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * 20 >= data.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Manage Tokens — {selectedUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mb-4">
            <p className="text-sm text-muted-foreground">Current balance</p>
            <p className="text-3xl font-black text-primary">{selectedUser?.tokenBalance ?? 0}</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input
                  data-testid="input-token-amount"
                  type="number"
                  min="1"
                  value={tokenForm.amount}
                  onChange={(e) => setTokenForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g. 4"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={tokenForm.type}
                  onValueChange={(v) => setTokenForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger data-testid="select-token-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit (add)</SelectItem>
                    <SelectItem value="debit">Debit (remove)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Input
                data-testid="input-token-description"
                value={tokenForm.description}
                onChange={(e) => setTokenForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Cash payment — 100 TND"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={tokenForm.notes}
                onChange={(e) => setTokenForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes"
              />
            </div>
            <Button
              data-testid="btn-confirm-tokens"
              onClick={handleAdjust}
              disabled={adjustMutation.isPending}
              className="w-full"
              size="lg"
            >
              {adjustMutation.isPending
                ? "Processing..."
                : `${tokenForm.type === "credit" ? "Add" : "Remove"} Tokens`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
