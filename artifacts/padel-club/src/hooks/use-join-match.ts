import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useJoinSession,
  getOpenMatchesQueryKey,
  getCalendarQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import { clubDay } from "@/lib/club-time";
import { plural, tokensLabel } from "@/lib/labels";
import { apiErrorText } from "@/lib/api-errors";

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
        onSuccess: (joined) => {
          toast({
            title: tx({
              fr: "Vous êtes dans le match !",
              en: "You're in the match!",
              ar: "أنت في المباراة!",
            }),
            description: tx({
              fr: `${tokensLabel(joined.tokensCharged)} ${plural(joined.tokensCharged, "débité", "débités")}.`,
              en: `${tokensLabel(joined.tokensCharged)} charged.`,
              ar: `تم خصم ${joined.tokensCharged} رصيد.`,
            }),
          });
          qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
          qc.invalidateQueries({
            queryKey: getCalendarQueryKey({ date: clubDay(startTime) }),
          });
          qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
        },
        onError: (err) =>
          toast({
            title: tx({ fr: "Impossible de rejoindre", en: "Couldn't join", ar: "تعذر الانضمام" }),
            description: apiErrorText(err, tx),
            variant: "destructive",
          }),
      },
    );
  };
  return { run, pendingId: join.isPending ? (join.variables?.id ?? null) : null };
}
