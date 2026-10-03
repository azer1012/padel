# Online payment

Members buy tokens and pay boutique orders by card or e-Dinar, through the club's own
account at a Tunisian payment gateway: **Konnect** or **Flouci**, chosen per
installation. Off by default: without a gateway, everything is paid at the desk as
before.

The money never passes through AmiVio: the gateway account belongs to the club, and
the gateway pays the club.

## What a member can pay online

| What                    | Where                                | Amount                                                         |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------- |
| A token pack            | Wallet → the pack's **Payer** button | the pack's price (Réglages → Tokens → packs)                   |
| A number of tokens      | Wallet → **Autre quantité**          | tokens × price of one token, above the club minimum            |
| A boutique order        | Checkout → **En ligne maintenant**   | the order's total                                              |
| An order placed earlier | Boutique → Mes commandes → **Payer** | the order's total, while it is neither delivered nor cancelled |

The member is sent to the gateway's payment page and comes back to the site, which
says what became of the payment. Tokens are in the wallet as soon as the payment is
confirmed. A boutique order paid online is still called by the club to be confirmed;
the desk sees "Déjà payée en ligne : rien à encaisser".

## What the platform guarantees

- **The amount is decided by the API**, from the club's packs, token price or the
  order. Nothing the browser sends changes it.
- **A payment is settled only on the gateway's own answer to the API.** The member
  coming back, the gateway's callback and the scheduler all do the same thing: make
  the API ask the gateway. A callback is never believed on its own.
- **The gateway must report the amount that was asked**, to the millime; otherwise
  nothing is credited and the payment is closed as failed (`AMOUNT_MISMATCH`).
- **Tokens are credited once**: the payment row is locked while it is settled, and its
  ledger entry carries a key that can exist once (`payment:<id>`).
- **Nothing is lost when the member closes the tab**: the scheduler asks the gateway
  about every pending payment every 5 minutes, and closes those still unpaid after a
  day.

## Refunds

The platform never sends money back by itself.

- A paid boutique order **cancelled by the desk**: the payment becomes "à rembourser"
  on the order (Admin → Boutique). The desk refunds it in the gateway's merchant
  space, then presses **Remboursement effectué**: who and when are recorded.
- An order **paid after it was cancelled**, or paid twice on two payment pages: same
  thing, the extra payment is owed back.
- **Tokens bought online are not refunded from the app.** If the club agrees to a
  refund, it refunds in the gateway's merchant space and removes the tokens in
  Admin → Tokens (a debit, with the reason).

## Setting it up for a club

1. The club opens a merchant account at the gateway (its company, its bank account)
   and gets its keys. Sandbox / test keys first.
2. In the API's environment (never in a `VITE_` variable):

   | Gateway | Variables                                                                                                      |
   | ------- | -------------------------------------------------------------------------------------------------------------- |
   | Konnect | `PAYMENT_PROVIDER=konnect`, `KONNECT_API_KEY`, `KONNECT_WALLET_ID`, and `KONNECT_API_URL` while on the sandbox |
   | Flouci  | `PAYMENT_PROVIDER=flouci`, `FLOUCI_PUBLIC_KEY`, `FLOUCI_PRIVATE_KEY` (the "TEST APP" keys while testing)       |

   `FRONTEND_URL` must be the site's public address (members come back to it), and
   `API_PUBLIC_URL` the API's (the gateway calls back on
   `<API_PUBLIC_URL>/api/payments/webhook/<gateway>`). Without `API_PUBLIC_URL`
   payments are still confirmed, on the member's return and by the scheduler.

3. The API refuses to start with a gateway and no keys, so a typo is seen at once.
4. Online payment works in **dinars only**: with another currency in Réglages it
   stays off.
5. The club switches it on or off in **Réglages → Fonctionnalités → Paiement en
   ligne**. The row says which gateway the installation uses, or that none is set.
6. Go through the checklist below with the test keys, then replace them with the
   production keys.

## Before going live with a club (to do with the gateway's test keys)

The gateway adapters are written from the gateways' published documentation and are
tested against a local server that answers like that documentation. **They have not
been run against the real gateways**: that needs the club's test keys. With them:

- [ ] a pack paid with a test card: tokens in the wallet, "Achat en ligne" in the history
- [ ] a payment abandoned on the payment page: nothing credited, "n'a pas abouti"
- [ ] a failed card: nothing credited
- [ ] the tab closed after paying: tokens arrive within 5 minutes (scheduler)
- [ ] the callback address reachable from outside, if `API_PUBLIC_URL` is set
- [ ] a boutique order paid at checkout, then cancelled by the desk and refunded in
      the merchant space
- [ ] the amounts in the gateway's back-office equal the amounts in Admin → Caisse
      ("Payé en ligne")

## Where it is in the code

| Looking for                       | It is in                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| The two gateways                  | `lib/payments/konnect.ts`, `lib/payments/flouci.ts`                                        |
| Amounts, settling, refunds owed   | `lib/payments/index.ts`                                                                    |
| Routes (member, callbacks, admin) | `routes/payments.ts`                                                                       |
| The table                         | `payments` (migration `20261011000000_online_payments.sql`)                                |
| The stand-in gateway of the tests | `lib/payments/test-provider.ts` (`PAYMENT_PROVIDER=test`, refused outside `NODE_ENV=test`) |
| Tests                             | `test/payments.test.ts`, `scripts/e2e/payments.e2e.mjs`                                    |
