import { useState } from "react";
import {
  useCreateReservation,
  useGetTokenBalance,
  useBlockSlot,
  apiErrorCode,
} from "@workspace/api-client-react";
import type { CalendarSlot, EquipmentLine, Reservation, User } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  ArrowRightIcon,
  CalendarPlusIcon,
  CheckIcon,
  CoinsIcon,
  InfoIcon,
  MoneyIcon,
  ShieldWarningIcon,
  UserCircleIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useI18n, useTx } from "@/lib/i18n";
import { clubDate, clubTime } from "@/lib/club-time";
import { downloadIcs } from "@/lib/ics";
import {
  inviteShareText,
  loyaltyFor,
  plural,
  tokenAmount,
  tokenWord,
  tokensLabel,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { EquipmentPicker } from "@/components/smash/equipment-picker";
import { InvitePanel } from "@/components/smash/invite-panel";
import { MemberPicker } from "@/components/smash/member-picker";
import { useClubRules } from "@/hooks/use-club-rules";
import { useRefreshBookings, type Terrain } from "./shared";
import { apiErrorText } from "@/lib/api-errors";

/** Book a free slot: full court or one spot, with the admin's front-desk options. */
export function BookDialog({
  slot,
  terrain,
  isAdmin,
  onClose,
}: {
  slot: CalendarSlot;
  terrain: Terrain;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const rules = useClubRules();
  const tx = useTx();
  const { lang } = useI18n();
  const { toast } = useToast();
  const refresh = useRefreshBookings();
  const { data: balance } = useGetTokenBalance();
  const createReservation = useCreateReservation();
  const blockSlot = useBlockSlot();

  const [mode, setMode] = useState<"full_court" | "own_spot">("full_court");
  const [isPublic, setIsPublic] = useState(true);
  const [publicDescription, setPublicDescription] = useState("");
  const [equipment, setEquipment] = useState<EquipmentLine[]>([]);
  const [booked, setBooked] = useState<Reservation | null>(null);
  // Admin desk
  const [forWho, setForWho] = useState<"member" | "guest">("member");
  const [member, setMember] = useState<User | null>(null);
  const [payment, setPayment] = useState<"token" | "cash_club">("cash_club");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const perSpot = slot.tokensPerSpot ?? rules.tokenCostPlayer;
  const spots = slot.totalSpots || rules.maxPlayers;
  const fullCost = slot.tokensFullCourt ?? perSpot * spots;
  const cost = mode === "own_spot" ? perSpot : fullCost;
  const cash =
    mode === "own_spot"
      ? (slot.pricePerPerson ?? rules.playerPrice)
      : (slot.fullCourtPrice ?? spots * (slot.pricePerPerson ?? rules.playerPrice));
  const payer = isAdmin ? (forWho === "member" ? member : null) : null;
  const paysTokens = isAdmin ? forWho === "member" && payment === "token" : true;
  const wallet = isAdmin ? (payer?.tokenBalance ?? null) : (balance?.balance ?? null);
  const short = paysTokens && wallet !== null && wallet < cost;
  const adminIncomplete = isAdmin && (forWho === "member" ? !member : !guestName.trim());

  const book = () =>
    createReservation.mutate(
      {
        data: {
          terrainId: terrain.id,
          startTime: slot.startTime,
          bookingMode: mode,
          isPublic: mode === "own_spot" && isPublic,
          publicDescription: mode === "own_spot" && isPublic ? publicDescription : undefined,
          equipment: equipment.length ? equipment : undefined,
          ...(isAdmin
            ? forWho === "member"
              ? { userId: member?.id, paymentMethod: payment }
              : { guestName, guestPhone, bookingType: "phone" as const }
            : {}),
        },
      },
      {
        onSuccess: (r) => {
          refresh(slot.startTime);
          setBooked(r);
        },
        onError: (e) => {
          refresh(slot.startTime);
          const taken = apiErrorCode(e) === "SLOT_TAKEN";
          toast({
            title: taken
              ? tx({
                  fr: "Ce terrain vient d'être réservé par un autre joueur",
                  en: "Another player just booked this court",
                  ar: "تم حجز هذا الموعد للتو",
                })
              : tx({ fr: "Réservation impossible", en: "Booking failed", ar: "تعذر الحجز" }),
            description: taken
              ? tx({
                  fr: "Aucun token n'a été débité. Choisissez un autre horaire.",
                  en: "No token was charged. Pick another time.",
                  ar: "لم يتم خصم أي رصيد. اختر موعدًا آخر.",
                })
              : apiErrorText(e, tx),
            variant: "destructive",
          });
          if (taken) onClose();
        },
      },
    );

  const block = () =>
    blockSlot.mutate(
      { terrainId: terrain.id, startTime: slot.startTime, reason: "Maintenance" },
      {
        onSuccess: () => {
          refresh(slot.startTime);
          toast({ title: tx({ fr: "Créneau bloqué", en: "Slot blocked", ar: "تم حجب الموعد" }) });
          onClose();
        },
        onError: (e) =>
          toast({
            title: tx({
              fr: "Blocage impossible",
              en: "Couldn't block the slot",
              ar: "تعذر حجب الموعد",
            }),
            description: apiErrorText(e, tx),
            variant: "destructive",
          }),
      },
    );

  if (booked) {
    const invitable = !!booked.userId && !isAdmin && rules.invitationsEnabled;
    const bookedFull = booked.bookingMode === "full_court";
    const recap = [
      { label: tx({ fr: "Terrain", en: "Court", ar: "الملعب" }), value: terrain.name },
      {
        label: tx({ fr: "Date", en: "Date", ar: "التاريخ" }),
        value: clubDate(slot.startTime, lang),
      },
      {
        label: tx({ fr: "Horaire", en: "Time", ar: "الوقت" }),
        value: (
          <span dir="ltr">
            {clubTime(slot.startTime)} – {clubTime(slot.endTime)}
          </span>
        ),
      },
      {
        label: tx({ fr: "Joueurs", en: "Players", ar: "اللاعبون" }),
        value: bookedFull
          ? tx({
              fr: `Terrain complet · ${spots} places`,
              en: `Full court · ${spots} spots`,
              ar: `ملعب كامل · ${spots} أماكن`,
            })
          : tx({
              fr: `Votre place · ${spots - 1} à pourvoir`,
              en: `Your spot · ${spots - 1} to fill`,
              ar: `مكانك · ${spots - 1} شاغرة`,
            }),
      },
      {
        label: tx({ fr: "Paiement", en: "Payment", ar: "الدفع" }),
        value: booked.tokensCharged
          ? tx({
              fr: `${tokensLabel(booked.tokensCharged)} ${plural(booked.tokensCharged, "débité", "débités")}`,
              en: `${tokensLabel(booked.tokensCharged)} charged`,
              ar: `تم خصم ${tokensLabel(booked.tokensCharged)}`,
            })
          : tx({
              fr: `${cash} ${rules.currency} à régler au club`,
              en: `${cash} ${rules.currency} to pay at the club`,
              ar: `${cash} ${rules.currency} تُدفع في النادي`,
            }),
      },
    ];
    return (
      <div className="flex flex-col gap-5" role="status">
        <div className="flex items-center gap-4">
          <span className="pop-in flex size-14 shrink-0 items-center justify-center rounded-full bg-ball text-night">
            <CheckIcon className="size-7" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h3 className="disp m-0 text-[28px] leading-none">
              {tx({ fr: "Réservation confirmée", en: "Booking confirmed", ar: "تم تأكيد الحجز" })}
            </h3>
            <p className="m-0 mt-1.5 text-[15px] text-muted-foreground">
              {isAdmin
                ? tx({
                    fr: "Le créneau est réservé dans le planning.",
                    en: "The slot is booked in the schedule.",
                    ar: "تم حجز الموعد في الجدول.",
                  })
                : tx({
                    fr: "Vous la retrouvez dans « Mes réservations ».",
                    en: "You'll find it under “My bookings”.",
                    ar: "تجده في «حجوزاتي».",
                  })}
            </p>
          </div>
        </div>

        <dl className="m-0 flex flex-col gap-2.5 rounded-[22px] bg-secondary/60 p-4 text-[15px]">
          {recap.map((r) => (
            <div key={r.label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
              <dd className="m-0 text-end font-bold">{r.value}</dd>
            </div>
          ))}
        </dl>

        {invitable && (
          <div className="flex flex-col gap-2.5">
            <h4 className="m-0 text-base font-extrabold">
              {bookedFull
                ? tx({
                    fr: "Invitez vos partenaires",
                    en: "Invite your partners",
                    ar: "ادعُ شركاءك",
                  })
                : tx({
                    fr: "Proposez les places restantes",
                    en: "Offer the remaining spots",
                    ar: "اعرض الأماكن المتبقية",
                  })}
            </h4>
            <InvitePanel
              reservationId={booked.id}
              free={bookedFull}
              shareText={inviteShareText(tx, terrain.name, slot.startTime)}
            />
          </div>
        )}

        <div className="dialog-actions flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            className="px-4 sm:flex-1"
            aria-label={tx({
              fr: "Ajouter au calendrier",
              en: "Add to calendar",
              ar: "أضف إلى التقويم",
            })}
            onClick={() =>
              downloadIcs({
                id: booked.id,
                startTime: slot.startTime,
                endTime: slot.endTime,
                terrainName: terrain.name,
              })
            }
          >
            <CalendarPlusIcon />
            <span className="sm:hidden">
              {tx({ fr: "Calendrier", en: "Calendar", ar: "التقويم" })}
            </span>
            <span className="hidden sm:inline">
              {tx({ fr: "Ajouter au calendrier", en: "Add to calendar", ar: "أضف إلى التقويم" })}
            </span>
          </Button>
          {isAdmin ? (
            <Button className="flex-1" onClick={onClose}>
              {tx({ fr: "Terminé", en: "Done", ar: "تم" })}
            </Button>
          ) : (
            <Button className="flex-1" asChild>
              <Link href="/reservations">
                {tx({ fr: "Voir ma réservation", en: "View my booking", ar: "عرض حجزي" })}
                <ArrowRightIcon className="btn-ic" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const modes = [
    {
      id: "full_court" as const,
      icon: <UsersIcon className="size-5" />,
      title: tx({ fr: "Terrain complet", en: "Full court", ar: "ملعب كامل" }),
      text: tx({
        fr: `Vous réservez tout le terrain. Invitez jusqu'à ${spots - 1} joueurs, ils ne paient rien.`,
        en: `You book the whole court. Invite up to ${spots - 1} players, they pay nothing.`,
        ar: `تحجز الملعب كاملًا. ادعُ حتى ${spots - 1} لاعبين دون أن يدفعوا.`,
      }),
      cost: fullCost,
      cash: slot.fullCourtPrice ?? spots * (slot.pricePerPerson ?? rules.playerPrice),
    },
    {
      id: "own_spot" as const,
      icon: <UserCircleIcon className="size-5" />,
      title: tx({ fr: "Juste ma place", en: "Just my spot", ar: "مكاني فقط" }),
      text: tx({
        fr: `Vous réservez votre place. ${spots - 1} autres joueurs peuvent rejoindre et paient la leur.`,
        en: `You book your own spot. ${spots - 1} other players can join and pay theirs.`,
        ar: `تحجز مكانك. يمكن لـ ${spots - 1} لاعبين آخرين الانضمام ودفع أماكنهم.`,
      }),
      cost: perSpot,
      cash: slot.pricePerPerson ?? rules.playerPrice,
    },
  ];
  const after = wallet !== null ? wallet - cost : null;

  return (
    <div className="flex flex-col gap-5">
      {isAdmin && (
        <fieldset className="m-0 flex flex-col gap-3 rounded-[22px] border border-[#E4E8F7] p-4">
          <legend className="label px-1 text-muted-foreground">
            {tx({
              fr: "Réservation au comptoir",
              en: "Front-desk booking",
              ar: "حجز من الاستقبال",
            })}
          </legend>
          <div className="flex rounded-full bg-secondary p-1" role="group">
            {(["member", "guest"] as const).map((w) => (
              <button
                key={w}
                type="button"
                className="pill-tab h-9 flex-1"
                aria-pressed={forWho === w}
                onClick={() => setForWho(w)}
              >
                {w === "member"
                  ? tx({ fr: "Membre", en: "Member", ar: "عضو" })
                  : tx({ fr: "Invité / téléphone", en: "Guest / phone", ar: "زائر / هاتف" })}
              </button>
            ))}
          </div>
          {forWho === "member" ? (
            <>
              <MemberPicker value={member} onChange={setMember} />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment">
                {(["cash_club", "token"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={payment === p}
                    onClick={() => setPayment(p)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-sm font-bold",
                      payment === p ? "border-court bg-[#EEF1FF]" : "border-[#E4E8F7]",
                    )}
                  >
                    {p === "token" ? (
                      <CoinsIcon className="size-4" />
                    ) : (
                      <MoneyIcon className="size-4" />
                    )}
                    {p === "token"
                      ? tx({ fr: "Ses tokens", en: "Their tokens", ar: "رصيده" })
                      : tx({ fr: "Espèces au club", en: "Cash at club", ar: "نقدًا في النادي" })}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-name">{tx({ fr: "Nom", en: "Name", ar: "الاسم" })}</Label>
                <Input
                  id="guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="guest-phone">
                  {tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })}
                </Label>
                <Input
                  id="guest-phone"
                  type="tel"
                  inputMode="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div
        role="radiogroup"
        aria-label={tx({ fr: "Formule", en: "Booking type", ar: "نوع الحجز" })}
        className="flex flex-col gap-2.5"
      >
        {modes.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex items-start gap-3 rounded-[22px] border-2 p-4 text-start transition-[border-color,background-color,transform] active:scale-[.99]",
                on ? "border-court bg-[#EEF1FF]" : "border-[#E4E8F7] hover:border-[#C6CEF6]",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                  on ? "bg-court text-white" : "bg-secondary",
                )}
              >
                {on ? <CheckIcon key="on" className="icon-pop size-5" /> : m.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-base font-extrabold">{m.title}</span>
                  <span className="flex items-center gap-1.5 font-extrabold text-court">
                    {paysTokens && <CoinsIcon className="size-4" />}
                    {paysTokens ? tokensLabel(m.cost) : `${m.cash} ${rules.currency}`}
                  </span>
                </span>
                <span className="text-[13px] leading-snug text-muted-foreground">{m.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {mode === "own_spot" && rules.openMatchesEnabled && (
        <div className="flex flex-col gap-3 rounded-[22px] bg-secondary p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-bold">
                {tx({
                  fr: "Ouvrir aux joueurs du club",
                  en: "Open to club players",
                  ar: "مفتوح لأعضاء النادي",
                })}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {tx({
                  fr: "Votre match apparaît dans les open matches.",
                  en: "Your match shows up in open matches.",
                  ar: "تظهر مباراتك في المباريات المفتوحة.",
                })}
              </span>
            </span>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
          {isPublic && (
            <Input
              value={publicDescription}
              maxLength={200}
              onChange={(e) => setPublicDescription(e.target.value)}
              placeholder={tx({
                fr: "Ex : niveau 3, débutants bienvenus",
                en: "e.g. level 3, beginners welcome",
                ar: "مثال: مستوى 3",
              })}
            />
          )}
        </div>
      )}

      <EquipmentPicker startTime={slot.startTime} value={equipment} onChange={setEquipment} />

      <dl className="m-0 flex flex-col gap-2.5 rounded-[22px] border border-[#E4E8F7] p-4 text-[15px]">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {tx({ fr: "Joueurs", en: "Players", ar: "اللاعبون" })}
          </dt>
          <dd className="m-0 text-end font-bold">
            {mode === "full_court"
              ? tx({
                  fr: `${spots} places (vous + ${spots - 1} invités)`,
                  en: `${spots} spots (you + ${spots - 1} guests)`,
                  ar: `${spots} أماكن (أنت + ${spots - 1} ضيوف)`,
                })
              : tx({ fr: "1 place (la vôtre)", en: "1 spot (yours)", ar: "مكان واحد (مكانك)" })}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {tx({ fr: "Durée", en: "Duration", ar: "المدة" })}
          </dt>
          <dd className="m-0 font-bold">{rules.bookingDurationMinutes} min</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{tx({ fr: "Prix", en: "Price", ar: "السعر" })}</dt>
          <dd className="m-0 font-bold">
            {cash} {rules.currency}
          </dd>
        </div>
        {after !== null && wallet !== null && paysTokens && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {isAdmin
                ? tx({ fr: "Solde du membre", en: "Member's balance", ar: "رصيد العضو" })
                : tx({ fr: "Votre solde", en: "Your balance", ar: "رصيدك" })}
            </dt>
            <dd className={cn("m-0 text-end font-bold", short && "text-destructive")}>
              {short ? (
                tokensLabel(wallet)
              ) : (
                <>
                  {wallet} <span aria-hidden="true">→</span>
                  <span className="sr-only">{tx({ fr: "puis", en: "then", ar: "ثم" })}</span>{" "}
                  {tokensLabel(after)}
                </>
              )}
            </dd>
          </div>
        )}
        {paysTokens && loyaltyFor(rules, cost) > 0 && (
          <div className="flex justify-between gap-4" data-testid="loyalty-line">
            <dt className="text-muted-foreground">
              {tx({ fr: "Fidélité", en: "Loyalty", ar: "الوفاء" })}
            </dt>
            <dd className="m-0 text-end font-bold text-[#0F6B3C]">
              +{tokenAmount(loyaltyFor(rules, cost))} {tokenWord(loyaltyFor(rules, cost))}
            </dd>
          </div>
        )}
        <div className="flex items-end justify-between gap-4 border-t border-[#E4E8F7] pt-3">
          <dt className="font-bold">
            {paysTokens
              ? tx({ fr: "Total à débiter", en: "Total charged", ar: "الإجمالي" })
              : tx({ fr: "À régler au club", en: "To pay at the club", ar: "يُدفع في النادي" })}
          </dt>
          <dd className="disp m-0 text-3xl">
            {paysTokens ? tokensLabel(cost) : `${cash} ${rules.currency}`}
          </dd>
        </div>
      </dl>

      {short && wallet !== null ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl bg-[#FFEBD9] px-4 py-3 text-sm font-semibold text-[#7A3A0D] sm:flex-row sm:items-center"
        >
          <span className="flex flex-1 items-start gap-2">
            <ShieldWarningIcon className="mt-0.5 size-4 shrink-0" />
            {tx({
              fr: `Il manque ${tokensLabel(cost - wallet)}. Les tokens s'achètent en espèces à l'accueil du club.`,
              en: `You are ${tokensLabel(cost - wallet)} short. Buy tokens with cash at the club front desk.`,
              ar: `ينقصك ${cost - wallet} رصيد. يُشترى الرصيد نقدًا من استقبال النادي.`,
            })}
          </span>
          {!isAdmin && (
            <Link
              href="/wallet"
              className="shrink-0 self-start font-extrabold underline underline-offset-4 sm:self-auto"
            >
              {tx({ fr: "Mon portefeuille", en: "My wallet", ar: "محفظتي" })}
            </Link>
          )}
        </div>
      ) : (
        !isAdmin && (
          <p className="m-0 flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            {rules.cancellationNoticeHours > 0
              ? tx({
                  fr: `Annulation remboursée jusqu'à ${rules.cancellationNoticeHours} h avant le match.`,
                  en: `Cancel with a refund up to ${rules.cancellationNoticeHours} h before the match.`,
                  ar: `الإلغاء مع استرجاع الرصيد حتى ${rules.cancellationNoticeHours} ساعة قبل المباراة.`,
                })
              : tx({
                  fr: "Vous pouvez annuler avant le match : vos tokens sont remboursés.",
                  en: "You can cancel before the match: your tokens are refunded.",
                  ar: "يمكنك الإلغاء قبل المباراة ويُعاد رصيدك.",
                })}
          </p>
        )
      )}

      {isAdmin && (
        <Button
          variant="outline-destructive"
          size="sm"
          className="self-start"
          onClick={block}
          disabled={blockSlot.isPending}
          loading={blockSlot.isPending}
        >
          <WrenchIcon />
          {tx({
            fr: "Bloquer ce créneau (maintenance)",
            en: "Block this slot (maintenance)",
            ar: "حجب هذا الموعد (صيانة)",
          })}
        </Button>
      )}

      <div className="dialog-actions flex gap-2.5">
        <Button
          variant="outline"
          className="hidden flex-1 sm:inline-flex"
          onClick={onClose}
          disabled={createReservation.isPending}
        >
          {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
        </Button>
        <Button
          className="flex-[1.6]"
          onClick={book}
          disabled={createReservation.isPending || short || adminIncomplete}
          loading={createReservation.isPending}
        >
          {createReservation.isPending
            ? tx({ fr: "Réservation…", en: "Booking…", ar: "جارٍ الحجز…" })
            : tx({ fr: "Confirmer la réservation", en: "Confirm booking", ar: "تأكيد الحجز" })}
        </Button>
      </div>
    </div>
  );
}
