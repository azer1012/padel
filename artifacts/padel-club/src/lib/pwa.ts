/**
 * Installable app + web push.
 * - registerServiceWorker(): production only, never in demo mode or inside an iframe (previews)
 * - install prompt: Chrome/Edge/Android fire `beforeinstallprompt`; iOS Safari needs manual
 *   "Share → Add to Home Screen", so we detect it and show instructions instead
 * - push: subscribe this device with the API's VAPID key
 */
import { useSyncExternalStore } from "react";
import { pushSubscribe, pushUnsubscribe } from "@workspace/api-client-react";
import { DEMO } from "@/lib/demo-flag";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const inIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true);
export const isIOS = () =>
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !(window as any).MSStream;
export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function registerServiceWorker() {
  if (DEMO || !import.meta.env.PROD || inIframe() || !("serviceWorker" in navigator)) return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        /* non-fatal */
      });
  });
}

/** "native" = browser prompt available · "ios" = show Share → Add to Home Screen · null = nothing to offer */
export function useInstallPrompt() {
  const canNative = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => !!deferred,
    () => false,
  );
  const mode: "native" | "ios" | null =
    isStandalone() || DEMO || inIframe() ? null : canNative ? "native" : isIOS() ? "ios" : null;
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === "accepted";
  };
  return { mode, install };
}

function b64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export type PushResult = "enabled" | "denied" | "unsupported" | "unavailable";

/** Must be called from a user gesture (iOS requires it, and it's the polite thing anyway). */
export async function enablePush(publicKey: string | null | undefined): Promise<PushResult> {
  if (!pushSupported()) return "unsupported";
  if (!publicKey) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(publicKey),
    }));
  await pushSubscribe(sub.toJSON());
  return "enabled";
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
