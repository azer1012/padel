/**
 * Club identity and contact details, in one place (set them in .env, VITE_CLUB_*).
 * Contact channels left empty are simply not shown: the site never displays a
 * placeholder phone number or a dead social link.
 */
const env = import.meta.env;
const digits = (v: string) => v.replace(/[^\d+]/g, "");
const phone = (env.VITE_CLUB_PHONE as string | undefined)?.trim() ?? "";
const whatsapp = digits((env.VITE_CLUB_WHATSAPP as string | undefined) ?? phone).replace(/^\+/, "");

export const CLUB = {
  name: (env.VITE_CLUB_NAME as string | undefined) || "Smash Padel",
  city: (env.VITE_CLUB_CITY as string | undefined) || "Tunis",
  address: (env.VITE_CLUB_ADDRESS as string | undefined) || "Les Berges du Lac",
  postal: (env.VITE_CLUB_POSTAL as string | undefined) || "1053 Tunis, Tunisie",
  phone,
  phoneHref: phone ? `tel:${digits(phone)}` : "",
  whatsappHref: whatsapp ? `https://wa.me/${whatsapp}` : "",
  email: (env.VITE_CLUB_EMAIL as string | undefined)?.trim() ?? "",
  hours: (env.VITE_CLUB_HOURS as string | undefined) || "08:00 – 23:00",
  mapsQuery: (env.VITE_CLUB_MAPS_QUERY as string | undefined) || "Les Berges du Lac, Tunis",
  social: {
    instagram: (env.VITE_CLUB_INSTAGRAM as string | undefined)?.trim() ?? "",
    facebook: (env.VITE_CLUB_FACEBOOK as string | undefined)?.trim() ?? "",
  },
  /** Business rules shown in the UI (the API is the source of truth when booking). */
  tokensFullCourt: 4,
  tokensOwnSpot: 1,
  slotMinutes: 90,
  currency: "TND",
} as const;

export const PHOTOS = {
  hero: "/hero-padel.webp",
  indoor: "/terrain-indoor.webp",
  outdoor: "/terrain-outdoor.webp",
  tournament: "/tournament.webp",
} as const;
