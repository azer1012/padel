import { useGetMe, useGetTokenBalance, useListUpcomingReservations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: user, isLoading: isLoadingUser } = useGetMe();
  const { data: balance, isLoading: isLoadingBalance } = useGetTokenBalance();
  const { data: reservations, isLoading: isLoadingReservations } = useListUpcomingReservations();

  if (isLoadingUser || isLoadingBalance || isLoadingReservations) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full max-w-sm" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold uppercase italic text-primary">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user?.firstName || user?.email}</p>
          </div>
          <Link href="/reservations">
            <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90">
              Book Court
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl">Token Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black text-primary">{balance?.balance || 0}</div>
              <p className="text-sm text-muted-foreground mt-2">Tokens available for booking.</p>
              <Link href="/wallet">
                <Button variant="outline" className="mt-4 w-full">Manage Wallet</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl">Upcoming Matches</CardTitle>
            </CardHeader>
            <CardContent>
              {reservations && reservations.length > 0 ? (
                <ul className="space-y-4">
                  {reservations.map((res) => (
                    <li key={res.id} className="border border-border p-4 rounded-lg bg-background">
                      <div className="font-bold text-primary">{res.terrain?.name}</div>
                      <div className="text-sm text-muted-foreground">{format(new Date(res.startTime), "PPP p")}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-4">No upcoming reservations.</p>
                  <Link href="/reservations">
                    <Button variant="secondary">Book Now</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}