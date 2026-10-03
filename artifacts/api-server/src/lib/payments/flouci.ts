import {
  fromMillimes,
  gatewayCall,
  toMillimes,
  type InitInput,
  type PaymentProvider,
  type RemoteStatus,
} from "./provider";

export type FlouciConfig = {
  /** https://developers.flouci.com/api/v2 */
  apiUrl: string;
  /** Keys of the club's Flouci application (the test application while integrating). */
  publicKey: string;
  privateKey: string;
};

/**
 * Flouci (flouci.com). docs.flouci.com → API reference:
 *   POST /generate_payment          Bearer <public>:<private>  → { result: { payment_id, link } }
 *   GET  /verify_payment/:paymentId                            → { result: { status, amount } }
 * `result.status`: SUCCESS, PENDING, EXPIRED, FAILURE (amounts in millimes).
 */
export function flouci(config: FlouciConfig): PaymentProvider {
  const base = config.apiUrl.replace(/\/$/, "");
  const headers = { authorization: `Bearer ${config.publicKey}:${config.privateKey}` };
  return {
    name: "flouci",
    async init(input: InitInput) {
      const json = await gatewayCall("flouci", `${base}/generate_payment`, {
        method: "POST",
        headers,
        body: {
          amount: String(toMillimes(input.amount)),
          success_link: input.successUrl,
          fail_link: input.failUrl,
          ...(input.webhookUrl ? { webhook: input.webhookUrl } : {}),
          developer_tracking_id: String(input.paymentId),
          session_timeout_secs: 1800,
          accept_card: true,
        },
      });
      const result = (json.result ?? {}) as Record<string, unknown>;
      const ref = result.payment_id;
      const url = result.link;
      if (
        result.success !== true ||
        typeof ref !== "string" ||
        typeof url !== "string" ||
        !/^https:\/\//.test(url)
      )
        throw new Error("flouci: generate_payment answered without payment_id / link");
      return { ref, url };
    },
    async status(ref: string): Promise<RemoteStatus> {
      const json = await gatewayCall(
        "flouci",
        `${base}/verify_payment/${encodeURIComponent(ref)}`,
        {
          method: "GET",
          headers,
        },
      );
      const result = (json.result ?? {}) as Record<string, unknown>;
      const amount = fromMillimes(result.amount);
      switch (result.status) {
        case "SUCCESS":
          return { status: "paid", amount };
        case "PENDING":
          return { status: "pending", amount };
        case "EXPIRED":
          return { status: "expired", amount };
        default:
          return { status: "failed", amount };
      }
    },
  };
}
