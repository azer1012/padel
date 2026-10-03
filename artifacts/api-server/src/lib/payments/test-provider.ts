import crypto from "node:crypto";
import type { PaymentProvider, RemoteStatus } from "./provider";

/**
 * Stand-in gateway for the test suites (PAYMENT_PROVIDER=test, refused outside
 * NODE_ENV=test). Nothing leaves the process: a payment stays pending until a test
 * says what became of it (`testGateway.set`), or until the "payment page" is opened
 * (routes/payments.ts, test only), which pays it like a member would.
 */
const outcomes = new Map<string, RemoteStatus>();
/** What the next payment opened on the stand-in page becomes (default: paid). */
let next: RemoteStatus["status"] = "paid";
/** Amounts asked for, by reference: what a "paid" answer reports unless told otherwise. */
const asked = new Map<string, number>();

export const testGateway = {
  /** Decides what the gateway answers for a reference. `amount` defaults to what was asked. */
  set(ref: string, status: RemoteStatus["status"], amount?: number) {
    outcomes.set(ref, { status, amount: amount ?? asked.get(ref) ?? null });
  },
  next(status: RemoteStatus["status"]) {
    next = status;
  },
  /** The member opens the payment page: the payment takes the outcome set by `next`. */
  open(ref: string) {
    if (!asked.has(ref)) return false;
    if (!outcomes.has(ref)) testGateway.set(ref, next);
    return true;
  },
  reset() {
    outcomes.clear();
    asked.clear();
    next = "paid";
  },
};

export function testProvider(apiBase: string): PaymentProvider {
  return {
    name: "test",
    async init(input) {
      const ref = `test-${input.paymentId}-${crypto.randomBytes(6).toString("hex")}`;
      asked.set(ref, input.amount);
      const back = new URLSearchParams({ ref, success: input.successUrl, fail: input.failUrl });
      return { ref, url: `${apiBase}/internal/payments/test/pay?${back}` };
    },
    async status(ref) {
      return outcomes.get(ref) ?? { status: "pending", amount: asked.get(ref) ?? null };
    },
  };
}
