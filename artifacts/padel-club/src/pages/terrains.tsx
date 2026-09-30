import { useGetMe } from "@workspace/api-client-react";
import { Coins, Timer, Users } from "lucide-react";
import CourtCalendar from "@/components/court-calendar";
import { Page, PageHeader } from "@/components/smash/primitives";
import { useAuth } from "@/lib/auth";
import { useTx } from "@/lib/i18n";
import { CLUB } from "@/config/club";

export default function Terrains() {
  const { isSignedIn } = useAuth();
  const { data: me } = useGetMe({ query: { enabled: isSignedIn } as any });
  const tx = useTx();
  const rules = [
    { icon: Coins, text: tx({ fr: `Terrain complet : ${CLUB.tokensFullCourt} tokens`, en: `Full court: ${CLUB.tokensFullCourt} tokens`, ar: `ملعب كامل: ${CLUB.tokensFullCourt} رصيد` }) },
    { icon: Users, text: tx({ fr: `Votre place : ${CLUB.tokensOwnSpot} token`, en: `Your spot: ${CLUB.tokensOwnSpot} token`, ar: `مكانك: رصيد ${CLUB.tokensOwnSpot}` }) },
    { icon: Timer, text: tx({ fr: `${CLUB.slotMinutes} minutes par match`, en: `${CLUB.slotMinutes} minutes per match`, ar: `${CLUB.slotMinutes} دقيقة للمباراة` }) },
  ];
  return (
    <Page wide>
      <PageHeader
        eyebrow={tx({ fr: "Réserver", en: "Book a court", ar: "احجز ملعبًا" })}
        title={tx({ fr: "Choisissez votre terrain", en: "Pick your court", ar: "اختر ملعبك" })}
        subtitle={tx({ fr: "Les créneaux verts sont libres. Touchez-en un pour réserver le terrain ou juste votre place.", en: "Green slots are free. Tap one to book the whole court or just your spot.", ar: "المواعيد الخضراء متاحة. اضغط لحجز الملعب أو مكانك فقط." })}
      />
      <ul className="enter m-0 -mt-3 flex list-none flex-wrap gap-2 p-0">
        {rules.map((r) => (
          <li key={r.text} className="flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold shadow-sm"><r.icon className="size-4 text-court" />{r.text}</li>
        ))}
      </ul>
      <CourtCalendar isAdmin={false} currentUserId={me?.id ?? null} />
    </Page>
  );
}
