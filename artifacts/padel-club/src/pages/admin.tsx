import { useGetMe, useGetDashboardStats, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CalendarDays, Users, Coins } from "lucide-react";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { data: user, isLoading: isLoadingUser } = useGetMe();
  const { data: stats, isLoading: isLoadingStats } = useGetDashboardStats();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity({ limit: 5 });

  if (isLoadingUser || isLoadingStats || isLoadingActivity) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return <div className="p-8 text-destructive">Unauthorized. Admin access only.</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold uppercase italic text-primary">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of your club's performance.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Reservations</CardTitle>
              <CalendarDays className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalReservationsToday || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeUsers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Occupancy Rate (Today)</CardTitle>
              <Activity className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(stats?.occupancyRateToday || 0)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens Issued</CardTitle>
              <Coins className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalTokensIssued || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity && activity.length > 0 ? (
              <ul className="space-y-4">
                {activity.map((item) => (
                  <li key={item.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{item.message}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "PP p")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No recent activity.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}