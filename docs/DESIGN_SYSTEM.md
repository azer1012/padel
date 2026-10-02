# Design system

The whole web app (visitor site, player app, admin) shares one visual language.
Everything below lives in `artifacts/padel-club/src/index.css` and `src/components/smash/`.

## Colour roles

| Token                      | Hex       | Used for                                          |
| -------------------------- | --------- | ------------------------------------------------- |
| `night`                    | `#0A1030` | immersive sections, sidebar, nav, hero            |
| `ink`                      | `#101A4D` | text, dark cards, selected pills                  |
| `mist`                     | `#F4F6FF` | app background                                    |
| `court` (shadcn `primary`) | `#2E4CF6` | primary actions, free courts on the hero board    |
| `ball`                     | `#DDF74A` | free / live / selected, token balance, highlights |
| `coral`                    | `#FF8A6B` | courts in play, alerts, unread badges             |
| `lilac`                    | `#CBBDFF` | open spots / open matches                         |

The shadcn tokens (`--primary`, `--card`, `--sidebar`…) are mapped to these, so every
`components/ui/*` primitive and every admin table already follows the brand.

## Type

- Display: **Bricolage Grotesque 800** (`.disp`), tight tracking.
- Body: **Figtree**. Arabic falls back to **IBM Plex Sans Arabic**.
- Small labels: `.label` (uppercase, 0.14em tracking; tracking removed in RTL).

## Icons

[Phosphor](https://phosphoricons.com), always imported from `@/components/icons` (never from the
package): that module lists every icon in use and sets the defaults (24 px fallback, decorative
`aria-hidden`). Name an icon by what it shows (`CalendarPlusIcon`, `CourtIcon`), add new ones there.

Weights carry meaning:

| Weight    | Used for                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| `bold`    | default, matches the heavy display type                                                 |
| `fill`    | the active nav item / tab, filled status icons (notification bell with unread, toasts)  |
| `duotone` | large feature tiles, KPI badges, empty states (`<IconWeightProvider weight="duotone">`) |

## Interaction language

- `Button` variants: `default` (court blue), `lime`, `dark`, `outline`, `outline-dark`, `outline-destructive`, `secondary`, `ghost`, `link`.
  Hover = 2 px lift + colour sweep + icon nudge, press = scale .97 + ink ripple from the pointer.
- `<Button loading={mutation.isPending}>`: spinner replaces the leading icon, label stays put, clicks are blocked,
  `aria-busy` is set. Use it on the button that started the action, not on every button sharing the mutation.
- Add `shine` to the one main call-to-action of a screen (a light glint every few seconds). Never more than one per view (the sidebar button has none for that reason).
- `.lift` for cards, `.tile` + `.tile-ic` + `.tile-arrow` for shortcut tiles (icon springs, arrow slides),
  `.pill-tab` for segmented filters (`aria-pressed` / `aria-selected` drive the state).
- Court tiles: `.court[data-state=free|partial|busy|selected]`. Booking cells: `.slot[data-state=available|partial|full|mine|past|blocked]`.
  A state is always carried by a word or an icon as well as by its colour.

## Layout patterns

- Segmented filters: `.pill-group` around `.pill-tab` buttons. It scrolls sideways when the labels do not fit,
  so a long label can never widen the page.
- Dialogs: `DialogContent` is a bottom sheet below `sm` and a centred dialog above. Put the main action in a
  `.dialog-actions` bar (sticky at the bottom, safe-area aware) so it stays under the thumb while the content scrolls.
- Tables (`DataTable`): the scroll wrapper is `relative`; keep it so, otherwise screen-reader-only text inside
  the table widens the page on phones.
- Icon-only `Button`s (`size="icon"` / `"icon-sm"`) must have an `aria-label`: it is also shown as the hover tooltip.
- Phone tab bar: nav items take a `short` label (about 70 px per tab). The first four items are tabs, the rest
  live in the "Plus" sheet.

## Copy helpers (`src/lib/labels.ts`, `src/lib/api-errors.ts`)

- `plural(n, one, many)`, `tokensLabel(n)`, `openSpotsLabel(tx, n)`, `playersLabel(tx, filled, total)`:
  never write "place(s)" in the interface.
- `apiErrorText(e, tx)`: what to show when an API call fails. It translates the API error codes members can
  meet (slot taken, not enough tokens, cancellation closed…) and falls back to a plain "try again";
  never show a raw status or an untranslated server sentence.
- Dates come from `lib/club-time.ts` already capitalised ("Vendredi 2 octobre"): do not add CSS `capitalize`.

## Feedback (toasts)

`toast({ title, description, variant })` from `@/hooks/use-toast`.

| Variant               | Icon                        | Use                                 |
| --------------------- | --------------------------- | ----------------------------------- |
| `default` / `success` | animated check, ball badge  | the action worked                   |
| `destructive`         | warning circle, coral badge | the action failed (stays 7 s)       |
| `warning`             | warning, amber badge        | done, but something needs attention |
| `info`                | info, blue badge            | neutral information                 |

Up to 3 stack (top of the screen on phones, bottom-right on desktop). Each one shows a countdown bar
that pauses while hovered or focused; swipe right to dismiss.

## Motion

- Scroll effects use native scroll-driven animations (`animation-timeline: view()`), no JS on scroll.
  `[data-reveal]` falls back to one shared IntersectionObserver (`hooks/use-reveal.ts`).
- Route changes fade the new page up (`.page-in`, applied by the app shell).
- `.stagger` on a list or grid cascades its children in (60 ms apart). `.enter` / `.delay-1…5` for single blocks.
- `<CountUp value={n} />` for headline numbers (token balances, KPIs); screen readers get the final value.
- `.grow-x` for bars and planning blocks, `.shimmer` on skeletons (`<Skeleton>` has it), `.icon-pop` for an icon that just changed state.
- Dialogs, popovers and selects open with a spring zoom; the sidebar's active pill slides between links.
- Only `transform` and `opacity` are animated (plus colour transitions). `prefers-reduced-motion: reduce` disables loops, reveals,
  parallax, cascades, ripples and count-ups; spinners keep turning because they carry meaning.

## Building blocks (`src/components/smash/`)

`brand.tsx` (Logo, BallMark) · `primitives.tsx` (Page, PageHeader, EmptyState, ErrorState, Avatar, LiveDot, CourtLines, Eyebrow, CountUp)
· `live-board.tsx` (hero court board + `useTonight`) · `match-card.tsx`.

## Copy and languages

Page copy is written inline with `useTx()`: `tx({ fr, en, ar })` (EN/AR fall back to FR).
Dates use `useDateLocale()`. Direction switches to RTL automatically for Arabic; use logical
utilities (`ms-`, `ps-`, `start-`, `end-`) rather than `ml-`/`left-`.

## Club identity

Name, contact, hours and token rules: `src/config/club.ts`. Photos: `PHOTOS` in the same file (WebP in `public/`).
These four pictures are placeholders: replace them with the customer's own photos of the club (same file names,
1600 px wide WebP, under 250 kB each) before delivery.

Photography is used where it shows the place: home hero and gallery, the sign-in panel, a court's own photo
(Admin → Terrains) behind its name in the booking dialog, a tournament's or an article's own picture. A tournament
without a picture gets a drawn court cover (`EventCover`), never a repeated stock image.
