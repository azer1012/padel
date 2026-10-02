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
  hero: "/hero-court.webp",
  indoor: "/terrain-indoor.webp",
  outdoor: "/terrain-outdoor.webp",
} as const;

/**
 * Photos of the courts section of the home page: `public/<name>-<width>.webp` in
 * three widths, the largest one for 4K screens. The browser picks the one it needs.
 */
const sized = (name: string, widths: readonly [number, number, number]) => ({
  src: `/${name}-${widths[1]}.webp`,
  srcSet: widths.map((w) => `/${name}-${w}.webp ${w}w`).join(", "),
});
export const CLUB_PHOTOS = {
  main: sized("club-main", [960, 1920, 3642]),
  detail: sized("club-detail", [960, 1920, 3648]),
  indoor: sized("club-indoor", [960, 1920, 3840]),
  outdoor: sized("club-outdoor", [960, 1920, 3840]),
} as const;
