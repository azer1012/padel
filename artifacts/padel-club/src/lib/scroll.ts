let cancelPending: (() => void) | null = null;

/** Stops a scroll to a section that is still settling (another choice was made). */
export function cancelSectionScroll() {
  cancelPending?.();
  cancelPending = null;
}

/**
 * Scrolls to a section of the page once it is drawn. What is above a section can
 * still grow while the page loads (live matches, photos), so it aims again when the
 * page has settled; already in place, aiming again does nothing. One at a time: a new
 * call, `cancelSectionScroll()` or the visitor scrolling by hand stops the previous one.
 */
export function scrollToSection(id: string, behavior: ScrollBehavior = "smooth") {
  cancelSectionScroll();
  const timers: number[] = [];
  let frame = 0;
  let tries = 0;
  const cancel = () => {
    cancelAnimationFrame(frame);
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchmove", cancel);
    if (cancelPending === cancel) cancelPending = null;
  };
  const start = () => {
    const section = document.getElementById(id);
    if (!section) {
      if (tries++ < 60) frame = requestAnimationFrame(start);
      return;
    }
    const land = () => section.scrollIntoView({ behavior, block: "start" });
    land();
    timers.push(window.setTimeout(land, 700), window.setTimeout(land, 1600));
    timers.push(window.setTimeout(cancel, 1700));
  };
  window.addEventListener("wheel", cancel, { passive: true });
  window.addEventListener("touchmove", cancel, { passive: true });
  frame = requestAnimationFrame(start);
  cancelPending = cancel;
  return cancel;
}
