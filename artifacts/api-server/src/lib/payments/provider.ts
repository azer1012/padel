import { HttpError } from "../http";

/**
 * A payment gateway, as the API needs it: open a payment page for an amount, and ask
 * what became of it. The gateway is never believed on the browser's word: a payment
 * is settled only on the answer of `status`, asked by the API itself.
 */
export type ProviderName = "konnect" | "flouci" | "test";

export type InitInput = {
  /** Our payment id: sent along so the gateway's back-office shows which payment it is. */
  paymentId: number;
  /** In the club's currency (dinars), to the millime. */
  amount: number;
  description: string;
  /** Where the member's browser comes back after paying, and after giving up. */
  successUrl: string;
  failUrl: string;
  /** Called by the gateway when the payment changes (null: the API is not reachable from outside). */
  webhookUrl: string | null;
  customer: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
  };
};
export type InitResult = {
  /** The gateway's own reference of the payment. */
  ref: string;
  /** The page the member pays on. */
  url: string;
};
export type RemoteStatus = {
  status: "paid" | "pending" | "failed" | "expired";
  /** What the gateway says the payment is for, in dinars (null when it does not say). */
  amount: number | null;
};

export interface PaymentProvider {
  name: ProviderName;
  init(input: InitInput): Promise<InitResult>;
  status(ref: string): Promise<RemoteStatus>;
}

/** Both gateways count in millimes (1 dinar = 1000). */
export const toMillimes = (amount: number) => Math.round(amount * 1000);
export const fromMillimes = (millimes: unknown) => {
  const n = Number(millimes);
  return Number.isFinite(n) ? n / 1000 : null;
};

const unreachable = (provider: string, detail: string) =>
  new HttpError(
    502,
    "The payment service did not answer: nothing was charged, try again",
    "PAYMENT_PROVIDER_ERROR",
    { provider, detail },
  );

/** One call to a gateway: JSON in, JSON out, never longer than 15 seconds. */
export async function gatewayCall(
  provider: string,
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown },
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw unreachable(provider, err instanceof Error ? err.message : String(err));
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: refused below */
  }
  if (!res.ok || !json || typeof json !== "object")
    throw unreachable(provider, `HTTP ${res.status} ${text.slice(0, 200)}`);
  return json as Record<string, unknown>;
}
