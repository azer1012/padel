import { useEffect } from "react";

/**
 * Browsers without scroll-driven animations: one shared IntersectionObserver
 * marks [data-reveal] elements when they enter (CSS handles the rest).
 */
export function useRevealFallback() {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: view()")) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute("data-in", "");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const scan = () =>
      document.querySelectorAll("[data-reveal]:not([data-in])").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
