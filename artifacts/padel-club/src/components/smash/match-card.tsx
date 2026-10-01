import { format } from "date-fns";
import type { OpenMatch } from "@workspace/api-client-react";
import { CoinsIcon, PlusIcon, SunIcon, WarehouseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/smash/primitives";
import { useTx, useDateLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";

export function MatchCard({
  match,
  onJoin,
  pending,
  className,
}: {
  match: OpenMatch;
  onJoin: () => void;
  pending?: boolean;
  className?: string;
}) {
  const tx = useTx();
  const locale = useDateLocale();
  const { tokenCostPlayer: cost } = useClubRules();
  const start = new Date(match.startTime);
  const outdoor = match.terrain?.type === "outdoor";
  return (
    <article
      className={cn(
        "match flex flex-col gap-5 rounded-[30px] bg-card p-6 shadow-sm hover:shadow-lg",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-col">
          <span className="disp text-[48px] leading-[0.9]" dir="ltr">
            {format(start, "HH:mm")}
          </span>
          <span className="mt-1 text-sm font-semibold capitalize text-muted-foreground">
            {format(start, "EEEE d MMMM", { locale })}
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[13px] font-bold">
          {outdoor ? <SunIcon className="size-3.5" /> : <WarehouseIcon className="size-3.5" />}
          {match.terrain?.name}
        </span>
      </div>
      <p className="m-0 text-[17px] font-bold leading-snug">
        {match.publicDescription ||
          tx({
            fr: "Match amical, tous niveaux",
            en: "Friendly match, all levels",
            ar: "مباراة ودية لكل المستويات",
          })}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E8F7] pt-5 text-court">
        <span
          className="flex ps-2.5"
          aria-label={tx({
            fr: `${match.filledSpots} joueurs sur ${match.totalSpots}`,
            en: `${match.filledSpots} of ${match.totalSpots} players`,
            ar: `${match.filledSpots} من ${match.totalSpots}`,
          })}
        >
          {match.players.map((p, i) => (
            <span
              key={i}
              className="avatar -ms-2.5"
              style={{ "--i": i } as React.CSSProperties}
              title={p.name}
            >
              <Avatar name={p.name} index={i} size={44} ring="#fff" />
            </span>
          ))}
          {Array.from({ length: match.openSpots }, (_, i) => (
            <span
              key={`o${i}`}
              className="open-seat -ms-2.5 flex size-11 items-center justify-center rounded-full bg-card"
              style={{ "--i": match.players.length + i } as React.CSSProperties}
            >
              <PlusIcon className="size-4" />
            </span>
          ))}
        </span>
        <Button onClick={onJoin} loading={pending} size="sm" className="shrink-0">
          <CoinsIcon weight="fill" />
          {tx({ fr: `Rejoindre · ${cost}`, en: `Join · ${cost}`, ar: `انضم · ${cost}` })}
        </Button>
      </div>
      <span className="-mt-2 text-sm font-semibold text-success">
        {tx({
          fr: `${match.openSpots} place(s) libre(s)`,
          en: `${match.openSpots} spot(s) left`,
          ar: `${match.openSpots} مكان شاغر`,
        })}
      </span>
    </article>
  );
}
