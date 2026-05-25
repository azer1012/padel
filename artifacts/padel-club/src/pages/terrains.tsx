import { useUser } from "@clerk/react";
import { useI18n } from "@/lib/i18n";
import CourtCalendar from "@/components/court-calendar";
import { Calendar } from "lucide-react";

export default function Terrains() {
  const { user } = useUser();
  const { t } = useI18n();

  const dbUserId = null; // Will use currentUserId from the calendar component directly if needed

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-black uppercase italic text-primary flex items-center justify-center gap-3">
            <Calendar className="h-9 w-9" />
            {t("courts")}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Réservez un créneau sur nos terrains indoor et outdoor — court complet (4 tokens) ou votre place uniquement (1 token).
          </p>
        </div>
        <CourtCalendar isAdmin={false} currentUserId={null} />
      </div>
    </div>
  );
}
