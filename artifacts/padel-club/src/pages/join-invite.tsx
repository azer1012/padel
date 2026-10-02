import { useParams, useLocation, Link } from "wouter";
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
import { apiErrorText } from "@/lib/api-errors";
import { apiErrorCode } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/smash/brand";
import { CourtLines, Eyebrow } from "@/components/smash/primitives";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTx, useI18n } from "@/lib/i18n";
import { clubTime, clubDay, clubDate } from "@/lib/club-time";
import { useClubRules } from "@/hooks/use-club-rules";
import { openSpotsLabel, playersLabel, plural, tokensLabel } from "@/lib/labels";

export default function JoinInvite() {
  const tx = useTx();
  const { lang } = useI18n();
  const { token } = useParams<{ token: string }>();
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const {
    data: inviteData,
    isLoading,
    error,
  } = useGetInvite(token ?? "", { query: { enabled: !!token } });
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
          description: apiErrorText(e, tx),
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
                      fr: `${tokensLabel(res.tokensCharged)} ${plural(res.tokensCharged, "débité", "débités")}.`,
                      en: `${tokensLabel(res.tokensCharged)} charged.`,
                      ar: "تم خصم الرصيد.",
                    }),
          });
          if (inviteData)
            qc.invalidateQueries({
              queryKey: getCalendarQueryKey({
                date: clubDay(inviteData.reservation.startTime),
              }),
            });
          qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
          setLocation("/reservations");
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
          {tx({
            fr: "Invitation indisponible",
            en: "Invitation unavailable",
            ar: "الدعوة غير متاحة",
          })}
        </h1>
        <p className="m-0 text-lg text-muted-d">
          {/^(INVITE_|MATCH_)/.test(apiErrorCode(error) ?? "")
            ? apiErrorText(error, tx)
            : tx({
                fr: "Ce lien n'est plus valide. Demandez-en un nouveau à la personne qui vous a invité.",
                en: "This link is no longer valid. Ask the person who invited you for a new one.",
                ar: "هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا ممن دعاك.",
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
  const full = reservation.openSpots === 0;
  const here = encodeURIComponent(`/join/${token}`);
  /** Not signed in: what joining costs, then sign in or create an account and come back. */
  const guestActions = (
    <div className="flex flex-col gap-2.5">
      {!reservation.free && (
        <p className="m-0 flex items-center gap-2 font-semibold text-soft-d">
          <CoinsIcon className="size-5 text-ball" />
          {tx({
            fr: `Votre place : ${tokensLabel(reservation.tokensPerSpot)}`,
            en: `Your spot: ${tokensLabel(reservation.tokensPerSpot)}`,
            ar: `مكانك: ${tokensLabel(reservation.tokensPerSpot)}`,
          })}
          {rules.cashPaymentEnabled &&
            tx({
              fr: ` ou ${reservation.pricePerPerson} ${rules.currency} au club`,
              en: ` or ${reservation.pricePerPerson} ${rules.currency} at the club`,
              ar: ` أو ${reservation.pricePerPerson} ${rules.currency} في النادي`,
            })}
        </p>
      )}
      <Button variant="lime" size="xl" asChild>
        <Link href={`/sign-in?redirect=${here}`}>
          {tx({ fr: "Se connecter et rejoindre", en: "Sign in and join", ar: "سجّل الدخول وانضم" })}
        </Link>
      </Button>
      <Button variant="outline-dark" size="lg" asChild>
        <Link href={`/sign-up?redirect=${here}`}>
          {tx({
            fr: "Pas encore de compte ? Créer le mien",
            en: "No account yet? Create mine",
            ar: "ليس لديك حساب؟ أنشئ حسابًا",
          })}
        </Link>
      </Button>
    </div>
  );
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
        <span className="disp self-start text-[56px] leading-[0.9]" dir="ltr">
          {clubTime(reservation.startTime)}
        </span>
        <span className="flex items-center gap-2 font-semibold text-muted-foreground">
          <CalendarDotsIcon className="size-4" />
          {clubDate(reservation.startTime, lang)}
        </span>
        <span className="flex items-center gap-2 font-bold">
          <MapPinIcon className="size-4 text-court" />
          {reservation.terrainName}
        </span>
        <div className="flex gap-1.5" aria-hidden="true">
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
        <span className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
          <span>
            {playersLabel(tx, reservation.filledSpots, reservation.totalSpots, rules.minPlayers)}
          </span>
          <span className={full ? "text-destructive" : "text-[#0F6B3C]"}>
            {full
              ? tx({ fr: "Match complet", en: "Match full", ar: "المباراة مكتملة" })
              : openSpotsLabel(tx, reservation.openSpots)}
          </span>
        </span>
      </div>
      {full && (
        <p role="status" className="m-0 rounded-2xl bg-white/10 px-4 py-3 font-semibold">
          {tx({
            fr: "Toutes les places ont été prises. Regardez les open matches pour en trouver un autre.",
            en: "Every spot has been taken. Have a look at open matches to find another one.",
            ar: "أُخذت كل الأماكن. تصفّح المباريات المفتوحة لإيجاد مباراة أخرى.",
          })}
        </p>
      )}
      {full ? (
        <Button asChild variant="lime" size="lg">
          <Link href="/open-matches">
            {tx({ fr: "Voir les open matches", en: "See open matches", ar: "المباريات المفتوحة" })}
          </Link>
        </Button>
      ) : !isSignedIn ? (
        <>
          {reservation.free && (
            <p className="m-0 flex items-center gap-2 font-semibold text-ball">
              <GiftIcon className="size-5" />
              {tx({
                fr: `${invite.invitedBy} a réservé le terrain : votre place est offerte.`,
                en: `${invite.invitedBy} booked the court: your spot is free.`,
                ar: `${invite.invitedBy} حجز الملعب: مكانك مجاني.`,
              })}
            </p>
          )}
          {guestActions}
        </>
      ) : reservation.free ? (
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
            {tx({ fr: "Rejoindre le match", en: "Join the match", ar: "انضم إلى المباراة" })}
          </Button>
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
        </>
      ) : (
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
              fr: `Rejoindre · ${tokensLabel(reservation.tokensPerSpot)}`,
              en: `Join · ${tokensLabel(reservation.tokensPerSpot)}`,
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
      )}
    </div>,
  );
}
