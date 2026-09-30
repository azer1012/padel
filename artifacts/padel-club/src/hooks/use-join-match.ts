import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useJoinSession,
  getOpenMatchesQueryKey,
  getCalendarQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";

export function useJoinMatch() {
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tx = useTx();
  const [, setLocation] = useLocation();
  const join = useJoinSession();

  const run = (reservationId: number, startTime: string) => {
    if (!isSignedIn) {
      setLocation(`/sign-in?redirect=${encodeURIComponent("/open-matches")}`);
      return;
    }
    join.mutate(
      { id: reservationId },
      {
        onSuccess: () => {
          toast({
            title: tx({
              fr: "Vous êtes dans le match !",
              en: "You're in the match!",
              ar: "أنت في المباراة!",
            }),
            description: tx({
              fr: "1 token débité.",
              en: "1 token charged.",
              ar: "تم خصم رصيد واحد.",
            }),
          });
          qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
          qc.invalidateQueries({
            queryKey: getCalendarQueryKey({ date: format(new Date(startTime), "yyyy-MM-dd") }),
          });
          qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
        },
        onError: (err: any) =>
          toast({
            title: tx({ fr: "Impossible de rejoindre", en: "Couldn't join", ar: "تعذر الانضمام" }),
            description: err?.data?.error,
            variant: "destructive",
          }),
      },
    );
  };
  return { run, pendingId: join.isPending ? (join.variables?.id ?? null) : null };
}
