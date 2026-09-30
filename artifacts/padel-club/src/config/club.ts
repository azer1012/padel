/**
 * Club identity and contact details, in one place.
 * Change the name here and it updates the nav, footer, auth pages and titles.
 */
export const CLUB = {
  name: "Smash Padel",
  city: "Tunis",
  address: "Les Berges du Lac",
  postal: "1053 Tunis, Tunisie",
  phone: "+216 71 123 456",
  phoneHref: "tel:+21671123456",
  whatsappHref: "https://wa.me/21671123456",
  email: "contact@padelclub.tn",
  hours: "06:00 – 00:00",
  mapsQuery: "Les Berges du Lac, Tunis",
  social: { instagram: "#", facebook: "#" },
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
