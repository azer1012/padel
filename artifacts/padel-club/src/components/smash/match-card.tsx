import type { OpenMatch } from "@workspace/api-client-react";
import { CoinsIcon, PlusIcon, SunIcon, WarehouseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/smash/primitives";
import { useTx, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";
import { clubTime, clubDate } from "@/lib/club-time";
import { openSpotsLabel, playersLabel, tokensLabel } from "@/lib/labels";

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
  const { lang } = useI18n();
  const rules = useClubRules();
  // Peak hours cost more: the match carries its own price per spot
  const cost = match.tokensPerSpot ?? rules.tokenCostPlayer;
  const start = new Date(match.startTime);
  const names = match.players
    .map((p) => p.name)
    .filter(Boolean)
    .join(", ");
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
          <span className="disp self-start text-[48px] leading-[0.9]" dir="ltr">
            {clubTime(start)}
          </span>
          <span className="mt-1 text-sm font-semibold text-muted-foreground">
            {clubDate(start, lang)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[13px] font-bold">
          {outdoor ? <SunIcon className="size-3.5" /> : <WarehouseIcon className="size-3.5" />}
          {match.terrain?.name}
        </span>
      </div>
      {names && (
        <span className="-mb-3 truncate text-sm font-semibold text-muted-foreground">
          {tx({ fr: `Avec ${names}`, en: `With ${names}`, ar: `مع ${names}` })}
        </span>
      )}
      <p className="m-0 text-[17px] font-bold leading-snug">
        {match.publicDescription ||
          tx({
            fr: "Match amical, tous niveaux",
            en: "Friendly match, all levels",
            ar: "مباراة ودية لكل المستويات",
          })}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#E4E8F7] pt-5 text-court">
        <span className="flex ps-2.5" aria-hidden="true">
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
        <span className="flex flex-col items-end text-end">
          <span className="text-base font-extrabold text-ink">
            {playersLabel(tx, match.filledSpots, match.totalSpots)}
          </span>
          <span className="text-sm font-semibold text-[#0F6B3C]">
            {openSpotsLabel(tx, match.openSpots)}
          </span>
        </span>
      </div>
      <Button onClick={onJoin} loading={pending} className="-mt-1 w-full">
        <CoinsIcon weight="fill" />
        {tx({
          fr: `Rejoindre · ${tokensLabel(cost)}`,
          en: `Join · ${tokensLabel(cost)}`,
          ar: `انضم · ${cost} رصيد`,
        })}
      </Button>
    </article>
  );
}
