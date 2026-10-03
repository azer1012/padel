import { useCallback, useEffect, useRef, useState } from "react";
import { useVerifyPayment, type Payment } from "@workspace/api-client-react";

/**
 * Back from the payment page: the gateway sends the member to `…?payment=<id>`. The
 * API is asked what became of that payment (it asks the gateway itself), the address
 * is cleaned, and the outcome is given to the screen. A payment still pending can be
 * checked again.
 */
export function usePaymentReturn(onPaid?: (payment: Payment) => void) {
  const verify = useVerifyPayment();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const paid = useRef(onPaid);
  paid.current = onPaid;

  const check = useCallback(
    (id: number) => {
      setFailed(false);
      verify.mutate(id, {
        onSuccess: (p) => {
          setPayment(p);
          if (p.status === "paid") paid.current?.(p);
        },
        onError: () => setFailed(true),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("payment"));
    if (!Number.isInteger(id) || id <= 0) return;
    started.current = true;
    // Whatever the gateway added to the address goes with it: a reload asks nothing again
    window.history.replaceState(null, "", window.location.pathname);
    setPayment({ id } as Payment);
    check(id);
  }, [check]);

  return {
    /** The payment the member came back from; null when they did not come from one. */
    payment: payment && "status" in payment ? payment : null,
    returning: payment !== null,
    checking: verify.isPending,
    /** The API could not be asked: the payment may well be paid, nothing is concluded. */
    failed,
    recheck: () => payment && check(payment.id),
    dismiss: () => setPayment(null),
  };
}
