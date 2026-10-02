import { useSyncExternalStore } from "react";
import type { ShopCartLine } from "@workspace/api-client-react";

/**
 * The boutique cart. It lives in this browser (localStorage), so a visitor can fill
 * it before signing in and finds it again after. It only holds which articles and
 * how many: names, prices and stock always come from the API.
 */
const KEY = "padel-cart";
const MAX_QUANTITY = 20;

function read(): ShopCartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map((l) => ({ productId: Number(l?.productId), quantity: Math.floor(Number(l?.quantity)) }))
      .filter((l) => Number.isInteger(l.productId) && l.productId > 0 && l.quantity > 0);
  } catch {
    return [];
  }
}

let lines: ShopCartLine[] = typeof localStorage === "undefined" ? [] : read();
const listeners = new Set<() => void>();

function write(next: ShopCartLine[]) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing without storage: the cart lives for this visit only
  }
  listeners.forEach((l) => l());
}

// Another tab of the same browser changed the cart
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    lines = read();
    listeners.forEach((l) => l());
  });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const cart = {
  /** Sets how many of an article are in the cart (0 removes it). `max` = units in stock. */
  set(productId: number, quantity: number, max = MAX_QUANTITY) {
    const q = Math.max(0, Math.min(Math.floor(quantity), max, MAX_QUANTITY));
    const rest = lines.filter((l) => l.productId !== productId);
    write(q > 0 ? [...rest, { productId, quantity: q }] : rest);
  },
  add(productId: number, max = MAX_QUANTITY) {
    const current = lines.find((l) => l.productId === productId)?.quantity ?? 0;
    cart.set(productId, current + 1, max);
  },
  remove(productId: number) {
    cart.set(productId, 0);
  },
  clear() {
    write([]);
  },
};

export function useCart() {
  const current = useSyncExternalStore(
    subscribe,
    () => lines,
    () => lines,
  );
  return {
    lines: current,
    count: current.reduce((sum, l) => sum + l.quantity, 0),
    quantityOf: (productId: number) =>
      current.find((l) => l.productId === productId)?.quantity ?? 0,
  };
}
