# Smash Padel — design system

The whole web app (visitor site, player app, admin) shares one visual language.
Everything below lives in `artifacts/padel-club/src/index.css` and `src/components/smash/`.

## Colour roles

| Token | Hex | Used for |
|---|---|---|
| `night` | `#0A1030` | immersive sections, sidebar, nav, hero |
| `ink` | `#101A4D` | text, dark cards, selected pills |
| `mist` | `#F4F6FF` | app background |
| `court` (shadcn `primary`) | `#2E4CF6` | primary actions, free courts on the hero board |
| `ball` | `#DDF74A` | free / live / selected, token balance, highlights |
| `coral` | `#FF8A6B` | courts in play, alerts, unread badges |
| `lilac` | `#CBBDFF` | open spots / open matches |

The shadcn tokens (`--primary`, `--card`, `--sidebar`…) are mapped to these, so every
`components/ui/*` primitive and every admin table already follows the brand.

## Type
- Display: **Bricolage Grotesque 800** (`.disp`), tight tracking.
- Body: **Figtree**. Arabic falls back to **IBM Plex Sans Arabic**.
- Small labels: `.label` (uppercase, 0.14em tracking; tracking removed in RTL).

## Interaction language
- `Button` variants: `default` (court blue), `lime`, `dark`, `outline`, `outline-dark`, `outline-destructive`, `secondary`, `ghost`, `link`.
  Hover = 2 px lift + colour sweep, press = scale .97, all under 200 ms.
- `.lift` for cards, `.pill-tab` for segmented filters (`aria-pressed` / `aria-selected` drive the state).
- Court tiles: `.court[data-state=free|partial|busy|selected]`. Booking cells: `.slot[data-state=available|partial|full|mine|past]`.

## Motion
- Scroll effects use native scroll-driven animations (`animation-timeline: view()`), no JS on scroll.
  `[data-reveal]` falls back to one shared IntersectionObserver (`hooks/use-reveal.ts`).
- Only `transform` and `opacity` are animated. `prefers-reduced-motion: reduce` disables loops, reveals and parallax.

## Building blocks (`src/components/smash/`)
`brand.tsx` (Logo, BallMark) · `primitives.tsx` (Page, PageHeader, EmptyState, ErrorState, Avatar, LiveDot, CourtLines, Eyebrow)
· `live-board.tsx` (hero court board + `useTonight`) · `match-card.tsx`.

## Copy and languages
Page copy is written inline with `useTx()`: `tx({ fr, en, ar })` (EN/AR fall back to FR).
Dates use `useDateLocale()`. Direction switches to RTL automatically for Arabic; use logical
utilities (`ms-`, `ps-`, `start-`, `end-`) rather than `ml-`/`left-`.

## Club identity
Name, contact, hours and token rules: `src/config/club.ts`. Photos: `PHOTOS` in the same file (WebP in `public/`).

## Demo mode
`pnpm --filter @workspace/padel-club dev:demo` runs the real UI against an in-memory club
(`src/lib/demo.ts`): no API server or Supabase needed. Useful for design reviews and sales demos.
Never enabled in production builds.
