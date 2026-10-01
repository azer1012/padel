/**
 * Club identity and contact details, in one place (set them in .env, VITE_CLUB_*).
 * Contact channels left empty are simply not shown: the site never displays a
 * placeholder phone number or a dead social link.
 */
const env = import.meta.env;
const digits = (v: string) => v.replace(/[^\d+]/g, "");
const phone = (env.VITE_CLUB_PHONE as string | undefined)?.trim() ?? "";
const whatsapp = digits((env.VITE_CLUB_WHATSAPP as string | undefined) ?? phone).replace(/^\+/, "");

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const address = text(env.VITE_CLUB_ADDRESS);
const postal = text(env.VITE_CLUB_POSTAL);

/**
 * Branding of THIS installation (design-time, set by the developer per customer in
 * .env → VITE_CLUB_*). Operational rules — prices, match duration, opening hours,
 * tokens — are NOT here: admins edit them in Réglages (see useClubRules()).
 */
export const CLUB = {
  name: text(env.VITE_CLUB_NAME) || "Padel Club",
  city: text(env.VITE_CLUB_CITY),
  address,
  postal,
  /** "Street, 1053 City" — empty when no address is configured. */
  fullAddress: [address, postal].filter(Boolean).join(", "),
  phone,
  phoneHref: phone ? `tel:${digits(phone)}` : "",
  whatsappHref: whatsapp ? `https://wa.me/${whatsapp}` : "",
  email: text(env.VITE_CLUB_EMAIL),
  mapsQuery: text(env.VITE_CLUB_MAPS_QUERY) || [address, postal].filter(Boolean).join(", "),
  social: {
    instagram: text(env.VITE_CLUB_INSTAGRAM),
    facebook: text(env.VITE_CLUB_FACEBOOK),
  },
} as const;

export const PHOTOS = {
  hero: "/hero-padel.webp",
  indoor: "/terrain-indoor.webp",
  outdoor: "/terrain-outdoor.webp",
  tournament: "/tournament.webp",
} as const;
