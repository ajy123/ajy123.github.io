// Reveal plumbing for the in-essay figures.
//
// Two facts about where these figures live drive the whole thing:
//
// 1. They render inside .essay-dialog-panel, which is its OWN scroll
//    container. A default IntersectionObserver watches the viewport, and the
//    whole panel is already in the viewport, so every figure would fire at
//    open. The observer has to take the panel as its root.
// 2. An essay's first section visual is promoted to the dialog hero, so it is
//    already on screen when the dialog opens — it never scrolls into view. The
//    panel is also overflow:hidden until EssayDialog's 360ms isScrollReady
//    gate, so a hero that animates before that plays behind a panel still
//    morphing from the card. Both cases are handled by only arming the
//    observer once `ready` flips: a hero is intersecting immediately and fires
//    on the same tick, a body figure waits to be scrolled to.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export type FigureRevealState = "out" | "in" | "done" | "static";

export const EssayFigureContext = createContext<{
  root: HTMLElement | null;
  ready: boolean;
}>({ root: null, ready: false });

/** Drives the `data-reveal` attribute a figure's entrance CSS keys off.
 *
 * The ref must land on an HTML element, never on the <svg> itself: Chrome's
 * IntersectionObserver silently never reports an SVG target, so the figure
 * stays at "out" forever and renders blank. The two svg-only figures are
 * wrapped in a div for exactly this reason.
 *
 * "out" = pre-entrance, "in" = play it, "done" = entrance over, "static" =
 * reduced motion, skip straight to the rest state (which is what the figure
 * ships as today).
 *
 * "done" exists so the entrance rules stop applying once they have played.
 * While they apply, any hover rule that sets the `animation` shorthand
 * replaces the entrance animation and its fill — which blanked the drawn
 * glyphs on hover, and made them redraw from nothing on every mouse-out. */
export function useFigureReveal<T extends Element>() {
  const { root, ready } = useContext(EssayFigureContext);
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [settled, setSettled] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (revealed || !ready) return;

    const node = ref.current;
    if (!node) return;

    if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      // Half the figure is enough: the tall ones (the pipeline is 175 units
      // against a 640 viewBox) would otherwise need most of the panel's
      // height before a single stroke moved.
      { root, threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, root, prefersReducedMotion, revealed]);

  // Must outlast the longest entrance on any figure, or the switch to "done"
  // pulls the animation rule out from under one still running and it snaps.
  // The longest is the coverage grid's last gap mark: it lands at 1560ms, then
  // flashes twice — 1560 + 420 + (2 x 520) = 3020ms. One timer covers all four
  // rather than each figure declaring its own length.
  useEffect(() => {
    if (!revealed || settled) return;

    const timer = window.setTimeout(() => setSettled(true), 3200);
    return () => window.clearTimeout(timer);
  }, [revealed, settled]);

  const state: FigureRevealState = prefersReducedMotion
    ? "static"
    : !revealed
      ? "out"
      : settled
        ? "done"
        : "in";

  return { ref, state };
}

/** Hover/focus isolation, shared by the pipeline's stations and the
 * triptych's cards. Pointer for mice, focus for keyboards, tap for touch.
 *
 * The pointer handlers ignore anything that is not a mouse: a touch fires
 * pointerenter and then click on the same tap, so an unguarded pair would set
 * the station and immediately toggle it back off. */
export function useActiveIndex() {
  const [active, setActive] = useState<number | null>(null);
  // A mouse has already set this target on pointerenter by the time its click
  // lands, so a toggling click would switch it straight back off under a
  // stationary pointer. Only a pointer that cannot hover gets the toggle.
  const lastPointerType = useRef<string>("mouse");

  const clearIf = (index: number) =>
    setActive((current) => (current === index ? null : current));

  const bind = (index: number) => ({
    onPointerDown: (event: { pointerType?: string }) => {
      lastPointerType.current = event.pointerType ?? "mouse";
    },
    onPointerEnter: (event: { pointerType?: string }) => {
      if (event.pointerType === "mouse") setActive(index);
    },
    onPointerLeave: (event: { pointerType?: string }) => {
      if (event.pointerType === "mouse") clearIf(index);
    },
    onFocus: () => setActive(index),
    onBlur: () => clearIf(index),
    onClick: () => {
      if (lastPointerType.current === "mouse") {
        setActive(index);
        return;
      }
      setActive((current) => (current === index ? null : index));
    },
    // These carry role="button", so Enter and Space have to do what the role
    // promises. Space is also the panel's scroll key, hence preventDefault.
    onKeyDown: (event: {
      key: string;
      preventDefault: () => void;
    }) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setActive((current) => (current === index ? null : index));
    },
  });

  return { active, setActive, bind };
}
