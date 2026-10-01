import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { EnvelopeOpenIcon, GiftIcon, MapPinIcon } from "@/components/icons";
import {
  useMyInvites,
  useDeclineInvite,
  settingsKeys,
  apiErrorMessage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import { clubDate, clubTime } from "@/lib/club-time";

/** Personal match invitations waiting for an answer (hidden when there are none). */
export function MyInvitations() {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: invites } = useMyInvites();
  const decline = useDeclineInvite();
  if (!invites?.length) return null;
  return (
    <section
      className="enter flex flex-col gap-3 rounded-[28px] bg-ball p-5 text-night"
      aria-live="polite"
    >
      <h2 className="m-0 flex items-center gap-2 text-xl font-extrabold">
        <EnvelopeOpenIcon className="size-5" />
        {tx({
          fr: `${invites.length} invitation(s) à un match`,
          en: `${invites.length} match invitation(s)`,
          ar: `${invites.length} دعوة إلى مباراة`,
        })}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {invites.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 p-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-extrabold">
                {tx({
                  fr: `${i.invitedBy} vous invite`,
                  en: `${i.invitedBy} invited you`,
                  ar: `${i.invitedBy} يدعوك`,
                })}
                {i.reservation.free && (
                  <span className="ms-2 inline-flex items-center gap-1 text-sm">
                    <GiftIcon className="size-3.5" />
                    {tx({ fr: "place offerte", en: "spot paid", ar: "مكان مدفوع" })}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 text-sm capitalize">
                <MapPinIcon className="size-3.5" />
                {i.reservation.terrainName} ·{" "}
                {clubDate(i.reservation.startTime, "fr", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · <span dir="ltr">{clubTime(i.reservation.startTime)}</span>
              </span>
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="dark" asChild>
                <Link href={`/join/${i.token}`}>
                  {tx({ fr: "Répondre", en: "Answer", ar: "الرد" })}
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={decline.isPending}
                onClick={() =>
                  decline.mutate(i.token, {
                    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.myInvites }),
                    onError: (e) =>
                      toast({
                        title: tx({
                          fr: "Action impossible",
                          en: "Couldn't decline",
                          ar: "تعذر الرفض",
                        }),
                        description: apiErrorMessage(e, ""),
                        variant: "destructive",
                      }),
                  })
                }
              >
                {tx({ fr: "Refuser", en: "Decline", ar: "رفض" })}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
