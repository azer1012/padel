import { useGetTokenBalance, useListTokenTransactions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Wallet() {
  const { data: balance, isLoading: isLoadingBalance } = useGetTokenBalance();
  const { data: transactions, isLoading: isLoadingTx } = useListTokenTransactions({ limit: 20 });

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <h1 className="text-3xl font-bold uppercase italic text-primary">My Wallet</h1>
          <p className="text-muted-foreground">Manage your tokens.</p>
        </div>

        <Card className="bg-card border-border border-primary/50 shadow-[0_0_15px_rgba(57,255,20,0.1)]">
          <CardHeader>
            <CardTitle className="text-center text-muted-foreground uppercase tracking-widest text-sm">Available Tokens</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {isLoadingBalance ? (
              <Skeleton className="h-16 w-32 mx-auto" />
            ) : (
              <div className="text-6xl font-black text-primary">{balance?.balance || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTx ? (
              <Skeleton className="h-64 w-full" />
            ) : transactions?.data && transactions.data.length > 0 ? (
              <div className="space-y-4">
                {transactions.data.map((tx) => (
                  <div key={tx.id} className="flex justify-between items-center p-4 border border-border rounded-lg bg-background">
                    <div>
                      <p className="font-bold">{tx.description}</p>
                      <p className="text-sm text-muted-foreground">{format(new Date(tx.createdAt), "PPP p")}</p>
                    </div>
                    <div className={`text-xl font-bold ${tx.type === 'credit' ? 'text-primary' : 'text-destructive'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">No transactions found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}