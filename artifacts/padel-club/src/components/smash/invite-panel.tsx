import { useEffect, useState } from "react";
import { useCreateInvite, apiErrorMessage } from "@workspace/api-client-react";
import { Check, Copy, MessageCircle, QrCode, Share2, Gift, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTx } from "@/lib/i18n";

/** SVG QR code, rendered locally (no third-party QR service sees the invite link). */
function QrSvg({ text }: { text: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      if (alive) setSvg(qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
    });
    return () => {
      alive = false;
    };
  }, [text]);
  if (!svg) return <Skeleton className="mx-auto size-[200px]" />;
  return (
    <div
      className="mx-auto size-[200px] rounded-2xl bg-white p-2 [&_svg]:size-full"
      role="img"
      aria-label="QR code"
      // Generated locally from our own invite URL
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Creates (or reuses) the match's invite link and offers every way to share it:
 * copy, WhatsApp, the phone's native share sheet and a QR code to scan at the club.
 */
export function InvitePanel({
  reservationId,
  free,
  shareText,
}: {
  reservationId: number;
  /** Full court: friends join free. Own spot: they pay their own spot. */
  free: boolean;
  shareText: string;
}) {
  const tx = useTx();
  const createInvite = useCreateInvite();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setUrl(null);
    setError(null);
    createInvite.mutate(
      { id: reservationId },
      {
        onSuccess: (d) =>
          setUrl(
            d.inviteUrl?.startsWith("http")
              ? d.inviteUrl
              : `${window.location.origin}/join/${d.token}`,
          ),
        onError: (e) =>
          setError(
            apiErrorMessage(
              e,
              tx({ fr: "Lien indisponible", en: "Link unavailable", ar: "الرابط غير متاح" }),
            ),
          ),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const message = url ? `${shareText} ${url}` : "";
  const copy = () =>
    url &&
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  const nativeShare = () =>
    url &&
    navigator
      .share?.({
        title: tx({ fr: "Match de padel", en: "Padel match", ar: "مباراة بادل" }),
        text: shareText,
        url,
      })
      .catch(() => {});

  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-ball p-4 text-night">
      <span className="flex items-center gap-2 font-extrabold">
        {free ? <Gift className="size-4" /> : <Coins className="size-4" />}
        {free
          ? tx({
              fr: "Invitez vos 3 partenaires, c'est déjà payé",
              en: "Invite your 3 partners, it's already paid",
              ar: "ادعُ شركاءك الثلاثة، الحجز مدفوع",
            })
          : tx({
              fr: "Invitez des joueurs : chacun paie sa place",
              en: "Invite players: each pays their own spot",
              ar: "ادعُ لاعبين: كل واحد يدفع مكانه",
            })}
      </span>
      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold">
          {error}
        </p>
      ) : !url ? (
        <Skeleton className="h-9 bg-white/60" />
      ) : (
        <>
          <code className="truncate rounded-xl bg-white/70 px-3 py-2 text-xs" dir="ltr">
            {url}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="dark" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied
                ? tx({ fr: "Copié", en: "Copied", ar: "تم النسخ" })
                : tx({ fr: "Copier", en: "Copy", ar: "نسخ" })}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button size="sm" variant="outline" onClick={nativeShare}>
                <Share2 />
                {tx({ fr: "Partager", en: "Share", ar: "مشاركة" })}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowQr((v) => !v)}
              aria-expanded={showQr}
            >
              <QrCode />
              QR
            </Button>
          </div>
          {showQr && <QrSvg text={url} />}
        </>
      )}
    </div>
  );
}
