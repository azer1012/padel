import {
  ClockIcon,
  EnvelopeSimpleIcon,
  MapPinIcon,
  NavigationArrowIcon,
  PhoneIcon,
  WhatsappLogoIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/smash/primitives";
import { useI18n, useTx } from "@/lib/i18n";
import { CLUB } from "@/config/club";
import { useClubRules } from "@/hooks/use-club-rules";

export default function Contact() {
  const rules = useClubRules();
  const tx = useTx();
  const { t } = useI18n();
  const q = encodeURIComponent(CLUB.mapsQuery);
  const items = [
    ...(CLUB.fullAddress
      ? [
          {
            icon: MapPinIcon,
            label: tx({ fr: "Adresse", en: "Address", ar: "العنوان" }),
            value: (
              <>
                {CLUB.address}
                {CLUB.address && CLUB.postal && <br />}
                {CLUB.postal}
              </>
            ),
          },
        ]
      : []),
    {
      icon: ClockIcon,
      label: tx({ fr: "Horaires", en: "Opening hours", ar: "ساعات العمل" }),
      value: (
        <>
          {rules.openEveryDay
            ? tx({ fr: "Tous les jours", en: "Every day", ar: "كل يوم" })
            : tx({ fr: "Horaires", en: "Hours", ar: "الساعات" })}{" "}
          <span dir="ltr">{rules.hoursLabel}</span>
        </>
      ),
    },
    ...(CLUB.phone
      ? [
          {
            icon: PhoneIcon,
            label: tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" }),
            value: (
              <a href={CLUB.phoneHref} className="ulink" dir="ltr">
                {CLUB.phone}
              </a>
            ),
          },
        ]
      : []),
    ...(CLUB.email
      ? [
          {
            icon: EnvelopeSimpleIcon,
            label: "Email",
            value: (
              <a href={`mailto:${CLUB.email}`} className="ulink">
                {CLUB.email}
              </a>
            ),
          },
        ]
      : []),
  ];
  return (
    <Page wide>
      <PageHeader
        eyebrow={t("contact")}
        title={tx({ fr: "Passez nous voir.", en: "Come and see us.", ar: "زورونا." })}
        subtitle={tx({
          fr: "Une question sur une réservation, les tokens ou un tournoi ? On répond vite, surtout sur WhatsApp.",
          en: "Questions about a booking, tokens or a tournament? We answer fast, especially on WhatsApp.",
          ar: "لديك سؤال؟ نجيب بسرعة، خاصة على واتساب.",
        })}
        actions={
          <>
            {CLUB.whatsappHref && (
              <Button asChild variant="lime">
                <a href={CLUB.whatsappHref} target="_blank" rel="noreferrer">
                  <WhatsappLogoIcon />
                  WhatsApp
                </a>
              </Button>
            )}
            {CLUB.phoneHref && (
              <Button asChild variant="dark">
                <a href={CLUB.phoneHref}>
                  <PhoneIcon />
                  {tx({ fr: "Appeler", en: "Call", ar: "اتصل" })}
                </a>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ul className="stagger m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-1">
          {items.map((i) => (
            <li
              key={i.label}
              className="enter flex items-start gap-4 rounded-[26px] bg-card p-5 shadow-sm"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ball text-night">
                <i.icon className="size-5" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="label text-muted-foreground">{i.label}</span>
                <span className="text-[17px] font-bold leading-snug">{i.value}</span>
              </span>
            </li>
          ))}
        </ul>
        {CLUB.mapsQuery && (
          <div className="enter relative min-h-[380px] overflow-hidden rounded-[32px] bg-night shadow-sm">
            <iframe
              title={tx({ fr: "Carte du club", en: "Club map", ar: "خريطة النادي" })}
              src={`https://www.google.com/maps?q=${q}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 size-full border-0"
            />
            <Button asChild variant="default" className="absolute bottom-4 end-4">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${q}`}
                target="_blank"
                rel="noreferrer"
              >
                <NavigationArrowIcon />
                {tx({ fr: "Itinéraire", en: "Directions", ar: "الاتجاهات" })}
              </a>
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}
