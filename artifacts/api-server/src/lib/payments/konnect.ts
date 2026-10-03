import {
  fromMillimes,
  gatewayCall,
  toMillimes,
  type InitInput,
  type PaymentProvider,
  type RemoteStatus,
} from "./provider";

export type KonnectConfig = {
  /** https://api.konnect.network/api/v2 (production) or the sandbox's address. */
  apiUrl: string;
  apiKey: string;
  /** The club's Konnect wallet: where the money goes. */
  walletId: string;
};

/**
 * Konnect (konnect.network). docs.konnect.network → API integration:
 *   POST /payments/init-payment   x-api-key   → { payUrl, paymentRef }
 *   GET  /payments/:paymentRef                → { payment: { status, amount, … } }
 * `payment.status` is "completed" once paid; anything else is not paid yet.
 */
export function konnect(config: KonnectConfig): PaymentProvider {
  const base = config.apiUrl.replace(/\/$/, "");
  const headers = { "x-api-key": config.apiKey };
  return {
    name: "konnect",
    async init(input: InitInput) {
      const json = await gatewayCall("konnect", `${base}/payments/init-payment`, {
        method: "POST",
        headers,
        body: {
          receiverWalletId: config.walletId,
          token: "TND",
          amount: toMillimes(input.amount),
          type: "immediate",
          description: input.description,
          acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
          lifespan: 30,
          checkoutForm: false,
          addPaymentFeesToAmount: false,
          firstName: input.customer.firstName ?? undefined,
          lastName: input.customer.lastName ?? undefined,
          phoneNumber: input.customer.phone ?? undefined,
          email: input.customer.email,
          orderId: String(input.paymentId),
          ...(input.webhookUrl ? { webhook: input.webhookUrl } : {}),
          successUrl: input.successUrl,
          failUrl: input.failUrl,
          theme: "light",
        },
      });
      const ref = json.paymentRef;
      const url = json.payUrl;
      if (typeof ref !== "string" || typeof url !== "string" || !/^https:\/\//.test(url))
        throw new Error("konnect: init-payment answered without payUrl / paymentRef");
      return { ref, url };
    },
    async status(ref: string): Promise<RemoteStatus> {
      const json = await gatewayCall("konnect", `${base}/payments/${encodeURIComponent(ref)}`, {
        method: "GET",
        headers,
      });
      const payment = (json.payment ?? {}) as Record<string, unknown>;
      const amount = fromMillimes(payment.amount);
      if (payment.status === "completed") return { status: "paid", amount };
      const expires =
        typeof payment.expirationDate === "string" ? Date.parse(payment.expirationDate) : NaN;
      if (Number.isFinite(expires) && expires < Date.now()) return { status: "expired", amount };
      return { status: "pending", amount };
    },
  };
}
