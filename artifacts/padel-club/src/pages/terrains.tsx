import { useGetMe } from "@workspace/api-client-react";
import { Coins, Timer, Users } from "lucide-react";
import CourtCalendar from "@/components/court-calendar";
import { Page, PageHeader } from "@/components/smash/primitives";
import { useAuth } from "@/lib/auth";
import { useTx } from "@/lib/i18n";
import { useClubRules } from "@/hooks/use-club-rules";

export default function Terrains() {
  const { isSignedIn } = useAuth();
  const { data: me } = useGetMe({ query: { enabled: isSignedIn } as any });
  const tx = useTx();
  const rules = useClubRules();
  const facts = [
    {
      icon: Coins,
      text: tx({
        fr: `Terrain complet : ${rules.tokenCostFullCourt} tokens`,
        en: `Full court: ${rules.tokenCostFullCourt} tokens`,
        ar: `ملعب كامل: ${rules.tokenCostFullCourt} رصيد`,
      }),
    },
    {
      icon: Users,
      text: tx({
        fr: `Votre place : ${rules.tokenCostPlayer} token`,
        en: `Your spot: ${rules.tokenCostPlayer} token`,
        ar: `مكانك: رصيد ${rules.tokenCostPlayer}`,
      }),
    },
    {
      icon: Timer,
      text: tx({
        fr: `${rules.bookingDurationMinutes} minutes par match`,
        en: `${rules.bookingDurationMinutes} minutes per match`,
        ar: `${rules.bookingDurationMinutes} دقيقة للمباراة`,
      }),
    },
  ];
  return (
    <Page wide>
      <PageHeader
        eyebrow={tx({ fr: "Réserver", en: "Book a court", ar: "احجز ملعبًا" })}
        title={tx({ fr: "Choisissez votre terrain", en: "Pick your court", ar: "اختر ملعبك" })}
        subtitle={
          <span className="hidden sm:inline">
            {tx({
              fr: "Les créneaux verts sont libres. Touchez-en un pour réserver le terrain ou juste votre place.",
              en: "Green slots are free. Tap one to book the whole court or just your spot.",
              ar: "المواعيد الخضراء متاحة. اضغط لحجز الملعب أو مكانك فقط.",
            })}
          </span>
        }
      />
      {/* On phones the grid comes first: the booking dialog explains prices anyway */}
      <ul className="enter m-0 -mt-3 hidden list-none flex-wrap gap-2 p-0 sm:flex">
        {facts.map((r) => (
          <li
            key={r.text}
            className="flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold shadow-sm"
          >
            <r.icon className="size-4 text-court" />
            {r.text}
          </li>
        ))}
      </ul>
      <CourtCalendar isAdmin={false} currentUserId={me?.id ?? null} />
    </Page>
  );
}
