import { useParams, useLocation, Link } from "wouter";
import { format } from "date-fns";
import {
  useGetInvite,
  useAcceptInvite,
  useDeclineInvite,
  settingsKeys,
  getCalendarQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDotsIcon,
  CoinsIcon,
  GiftIcon,
  MapPinIcon,
  MoneyIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { apiErrorMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/smash/brand";
import { CourtLines, Eyebrow } from "@/components/smash/primitives";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTx, useDateLocale } from "@/lib/i18n";
import { clubTime } from "@/lib/club-time";
import { useClubRules } from "@/hooks/use-club-rules";

export default function JoinInvite() {
  const tx = useTx();
  const locale = useDateLocale();
  const { token } = useParams<{ token: string }>();
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const {
    data: inviteData,
    isLoading,
    error,
  } = useGetInvite(token ?? "", { query: { enabled: !!token } as any });
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const rules = useClubRules();
  const handleDecline = () =>
    token &&
    declineInvite.mutate(token, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: settingsKeys.myInvites });
        toast({
          title: tx({ fr: "Invitation refusée", en: "Invitation declined", ar: "تم رفض الدعوة" }),
        });
        setLocation("/dashboard");
      },
      onError: (e) =>
        toast({
          title: tx({ fr: "Action impossible", en: "Couldn't decline", ar: "تعذر الرفض" }),
          description: apiErrorMessage(e, ""),
          variant: "destructive",
        }),
    });

  const handleAccept = (paymentMethod: "token" | "cash_club" = "token") => {
    if (!isSignedIn) {
      setLocation(`/sign-in?redirect=${encodeURIComponent(`/join/${token}`)}`);
      return;
    }
    if (!token) return;
    acceptInvite.mutate(
      { token, paymentMethod },
      {
        onSuccess: (res) => {
          toast({
            title: tx({
              fr: "Vous êtes dans le match !",
              en: "You're in the match!",
              ar: "أنت في المباراة!",
            }),
            description:
              res.paymentType === "invited_free"
                ? tx({
                    fr: "Votre place est offerte.",
                    en: "Your spot is on the house.",
                    ar: "مكانك مجاني.",
                  })
                : res.paymentType === "cash_club"
                  ? tx({
                      fr: "À régler à l'accueil du club.",
                      en: "Pay at the club front desk.",
                      ar: "الدفع في استقبال النادي.",
                    })
                  : tx({
                      fr: `${res.tokensCharged} token(s) débité(s).`,
                      en: `${res.tokensCharged} token(s) charged.`,
                      ar: "تم خصم الرصيد.",
                    }),
          });
          if (inviteData)
            qc.invalidateQueries({
              queryKey: getCalendarQueryKey({
                date: format(new Date(inviteData.reservation.startTime), "yyyy-MM-dd"),
              }),
            });
          qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
          setLocation("/reservations");
        },
        onError: (err: any) =>
          toast({
            title: tx({ fr: "Impossible de rejoindre", en: "Couldn't join", ar: "تعذر الانضمام" }),
            description: apiErrorMessage(err, ""),
            variant: "destructive",
          }),
      },
    );
  };

  const shell = (content: React.ReactNode) => (
    <div className="on-dark relative flex min-h-[100dvh] flex-col items-center overflow-hidden bg-night px-5 py-6 text-white">
      <div
        aria-hidden="true"
        className="absolute -end-24 top-24 h-[300px] w-[560px] rotate-[-9deg] rounded-xl border-[3px] border-white/10 bg-court/25"
      >
        <CourtLines />
      </div>
      <div className="relative w-full max-w-[480px]">
        <Logo />
      </div>
      <div className="relative flex w-full max-w-[480px] flex-1 flex-col justify-center py-10">
        {content}
      </div>
    </div>
  );

  if (!token || error || (!isLoading && !inviteData)) {
    return shell(
      <div className="enter flex flex-col items-start gap-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-coral text-night">
          <WarningCircleIcon className="size-7" />
        </span>
        <h1 className="disp m-0 text-5xl leading-none">
          {tx({ fr: "Invitation expirée", en: "Invite expired", ar: "انتهت الدعوة" })}
        </h1>
        <p className="m-0 text-lg text-muted-d">
          {apiErrorMessage(error, "") ||
            tx({
              fr: "Ce lien n'est plus valide. Demandez-en un nouveau à votre ami.",
              en: "This link is no longer valid. Ask your friend for a new one.",
              ar: "هذا الرابط لم يعد صالحًا.",
            })}
        </p>
        <Button asChild variant="lime" size="lg">
          <Link href="/open-matches">
            {tx({ fr: "Voir les open matches", en: "See open matches", ar: "المباريات المفتوحة" })}
          </Link>
        </Button>
      </div>,
    );
  }
  if (isLoading || !inviteData)
    return shell(
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-3/4 bg-white/10" />
        <Skeleton className="h-[280px] !rounded-[32px] bg-white/10" />
      </div>,
    );

  const { invite, reservation } = inviteData;
  return shell(
    <div className="enter flex flex-col gap-7">
      <Eyebrow live className="text-ball">
        {tx({ fr: "Invitation", en: "Invite", ar: "دعوة" })}
      </Eyebrow>
      <h1 className="disp m-0 text-[clamp(42px,9vw,60px)] leading-[0.95]">
        {tx({
          fr: `${invite.invitedBy} vous attend sur le terrain.`,
          en: `${invite.invitedBy} saved you a spot.`,
          ar: `${invite.invitedBy} يدعوك للعب.`,
        })}
      </h1>
      <div className="flex flex-col gap-4 rounded-[32px] bg-white p-6 text-ink">
        <span className="disp text-[56px] leading-[0.9]" dir="ltr">
          {clubTime(reservation.startTime)}
        </span>
        <span className="flex items-center gap-2 font-semibold capitalize text-muted-foreground">
          <CalendarDotsIcon className="size-4" />
          {format(new Date(reservation.startTime), "EEEE d MMMM", { locale })}
        </span>
        <span className="flex items-center gap-2 font-bold">
          <MapPinIcon className="size-4 text-court" />
          {reservation.terrainName}
        </span>
        <div
          className="flex gap-1.5"
          aria-label={`${reservation.filledSpots}/${reservation.totalSpots}`}
        >
          {Array.from({ length: reservation.totalSpots }, (_, i) => (
            <span
              key={i}
              className={
                i < reservation.filledSpots
                  ? "h-2.5 flex-1 rounded-full bg-court"
                  : "h-2.5 flex-1 rounded-full bg-secondary"
              }
            />
          ))}
        </div>
        <span className="text-sm font-semibold text-success">
          {tx({
            fr: `${reservation.openSpots} place(s) libre(s)`,
            en: `${reservation.openSpots} spot(s) left`,
            ar: `${reservation.openSpots} مكان شاغر`,
          })}
        </span>
      </div>
      {reservation.free ? (
        <>
          <p className="m-0 flex items-center gap-2 font-semibold text-ball">
            <GiftIcon className="size-5" />
            {tx({
              fr: `${invite.invitedBy} a réservé le terrain : votre place est offerte.`,
              en: `${invite.invitedBy} booked the court: your spot is free.`,
              ar: `${invite.invitedBy} حجز الملعب: مكانك مجاني.`,
            })}
          </p>
          <Button
            variant="lime"
            size="xl"
            onClick={() => handleAccept()}
            disabled={acceptInvite.isPending || reservation.openSpots === 0}
            loading={acceptInvite.isPending}
          >
            <GiftIcon />
            {isSignedIn
              ? tx({ fr: "Rejoindre le match", en: "Join the match", ar: "انضم إلى المباراة" })
              : tx({
                  fr: "Se connecter et rejoindre",
                  en: "Sign in and join",
                  ar: "سجّل الدخول وانضم",
                })}
          </Button>
          {isSignedIn && inviteData?.invite.personal && (
            <Button
              variant="ghost"
              size="lg"
              onClick={handleDecline}
              disabled={declineInvite.isPending}
            >
              {tx({ fr: "Refuser l'invitation", en: "Decline the invitation", ar: "رفض الدعوة" })}
            </Button>
          )}
        </>
      ) : isSignedIn ? (
        <div className="flex flex-col gap-2.5">
          <Button
            variant="lime"
            size="xl"
            onClick={() => handleAccept("token")}
            disabled={acceptInvite.isPending || reservation.openSpots === 0}
            loading={acceptInvite.isPending}
          >
            <CoinsIcon />
            {tx({
              fr: `Rejoindre · ${reservation.tokensPerSpot} token${reservation.tokensPerSpot > 1 ? "s" : ""}`,
              en: `Join · ${reservation.tokensPerSpot} token${reservation.tokensPerSpot > 1 ? "s" : ""}`,
              ar: `انضم · ${reservation.tokensPerSpot} رصيد`,
            })}
          </Button>
          {rules.cashPaymentEnabled && (
            <Button
              variant="outline-dark"
              size="lg"
              onClick={() => handleAccept("cash_club")}
              disabled={acceptInvite.isPending || reservation.openSpots === 0}
            >
              <MoneyIcon />
              {tx({
                fr: `Réserver et payer au club (${reservation.pricePerPerson} ${rules.currency})`,
                en: `Hold my spot, pay at the club (${reservation.pricePerPerson} ${rules.currency})`,
                ar: `احجز وادفع في النادي (${reservation.pricePerPerson} ${rules.currency})`,
              })}
            </Button>
          )}
          {inviteData?.invite.personal && (
            <Button
              variant="ghost"
              size="lg"
              onClick={handleDecline}
              disabled={declineInvite.isPending}
            >
              {tx({ fr: "Refuser l'invitation", en: "Decline the invitation", ar: "رفض الدعوة" })}
            </Button>
          )}
        </div>
      ) : (
        <Button
          variant="lime"
          size="xl"
          onClick={() => handleAccept()}
          disabled={reservation.openSpots === 0}
        >
          {tx({ fr: "Se connecter et rejoindre", en: "Sign in and join", ar: "سجّل الدخول وانضم" })}
        </Button>
      )}
    </div>,
  );
}
