// The portal/backdrop/stage/panel half of the essay dialog. Lifted out of
// main.tsx's EssayPracticeCard so the same dialog — copy, behavior, CSS — can
// be reused by the /deeli/ case study, which has no card to morph from.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import type { EssayItem } from "../essays/types";

function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.hasAttribute("disabled"));
}

export function EssayDialog({
  item,
  open,
  onClose,
  layoutIdPrefix,
}: {
  item: EssayItem;
  open: boolean;
  onClose: () => void;
  /** Card-morph mode passes a layoutId; standalone (deeli) omits it and the
   * panel fades/scales in instead of morphing from a trigger. */
  layoutIdPrefix?: string;
}) {
  const [isScrollReady, setIsScrollReady] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Captured on open rather than passed in as a prop, so this works whether
  // the trigger is the landing card (a motion.div) or the deeli case-study's
  // plain <a> link — whatever had focus when the dialog opened gets it back.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Read through a ref so the effect below can depend on `open` alone. The
  // landing card re-renders while the dialog is open (it tracks its own hover
  // state), which hands us a fresh onClose identity; if that re-ran the
  // effect, it would recapture previouslyFocusedRef as the dialog panel and
  // drop focus to <body> on close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const prefersReducedMotion = useReducedMotion();
  const dialogId = `essay-dialog-${item.id}`;
  const dialogTitleId = `essay-dialog-title-${item.id}`;
  const dialogDescriptionId = `essay-dialog-description-${item.id}`;

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.setTimeout(() => {
        previouslyFocusedRef.current?.focus();
      }, 0);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setIsScrollReady(false);
      // AnimatePresence freezes the exiting panel's props, so the
      // data-scroll-ready attribute never updates during the close morph;
      // hide overflow directly on the still-mounted node instead.
      if (dialogRef.current) dialogRef.current.style.overflow = "hidden";
      return;
    }

    if (dialogRef.current) dialogRef.current.style.overflow = "";

    if (prefersReducedMotion) {
      setIsScrollReady(true);
      return;
    }

    setIsScrollReady(false);
    const scrollGate = window.setTimeout(() => {
      setIsScrollReady(true);
    }, 360);

    return () => {
      window.clearTimeout(scrollGate);
    };
  }, [open, prefersReducedMotion]);

  const modalEnterTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const };
  const modalExitTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };
  const backdropEnterTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };
  const backdropExitTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.15, ease: [0.23, 1, 0.32, 1] as const };
  const contentInitial = prefersReducedMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: 12 };
  const contentTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.24, delay: 0.08, ease: [0.23, 1, 0.32, 1] as const };
  const contentExitTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const };

  const panelLayoutId = layoutIdPrefix
    ? `${layoutIdPrefix}-panel-${item.id}`
    : undefined;
  const visualLayoutId = layoutIdPrefix
    ? `${layoutIdPrefix}-visual-${item.id}`
    : undefined;

  // Standalone mode has no trigger to morph from, so the panel fades/scales
  // in on its own instead of relying on a layoutId match.
  const standaloneMotionProps = panelLayoutId
    ? {}
    : {
        initial: prefersReducedMotion
          ? { opacity: 1, scale: 1 }
          : { opacity: 0, scale: 0.97 },
        animate: { opacity: 1, scale: 1 },
        exit: {
          opacity: prefersReducedMotion ? 1 : 0,
          scale: prefersReducedMotion ? 1 : 0.97,
          transition: modalExitTransition,
        },
      };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key={`${item.id}-backdrop`}
          aria-hidden="true"
          className="essay-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: backdropExitTransition,
          }}
          transition={backdropEnterTransition}
        />
      ) : null}
      {open ? (
        <motion.div
          key={`${item.id}-stage`}
          className="essay-dialog-stage"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: backdropExitTransition,
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          transition={backdropEnterTransition}
        >
          <motion.article
            ref={dialogRef}
            aria-describedby={dialogDescriptionId}
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="essay-dialog-panel"
            data-scroll-ready={isScrollReady}
            id={dialogId}
            layoutId={panelLayoutId}
            role="dialog"
            tabIndex={-1}
            transition={modalEnterTransition}
            {...standaloneMotionProps}
          >
            <button
              ref={closeRef}
              aria-label="Close essay"
              className="essay-dialog-close"
              onClick={onClose}
              type="button"
            >
              <CloseGlyph />
            </button>

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="essay-dialog-header"
              exit={{
                opacity: prefersReducedMotion ? 1 : 0,
                y: 0,
                transition: contentExitTransition,
              }}
              initial={contentInitial}
              transition={contentTransition}
            >
              <p className="card-eyebrow">
                {item.year} · {item.eyebrow}
              </p>
              <h2
                className="essay-dialog-title"
                id={dialogTitleId}
              >
                {item.title}
              </h2>
              <p className="essay-dialog-meta">{item.role}</p>
              <p className="essay-dialog-dek">{item.dek}</p>
            </motion.div>

            <motion.div
              className="essay-dialog-hero"
              layoutId={visualLayoutId}
              transition={modalEnterTransition}
            >
              <item.thumbnail interactive={false} />
            </motion.div>

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="essay-dialog-body"
              exit={{
                opacity: prefersReducedMotion ? 1 : 0,
                y: 0,
                transition: contentExitTransition,
              }}
              id={dialogDescriptionId}
              initial={contentInitial}
              transition={contentTransition}
            >
              {item.sections.map((section) => (
                <section
                  className="essay-dialog-section"
                  key={section.heading}
                >
                  <h3>{section.heading}</h3>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.visual ? (
                    <figure className="essay-dialog-figure">
                      {section.visual}
                      {section.visualCaption ? (
                        <figcaption className="essay-figure-caption">
                          {section.visualCaption}
                        </figcaption>
                      ) : null}
                    </figure>
                  ) : null}
                </section>
              ))}
              <p className="essay-dialog-takeaway">{item.takeaway}</p>
            </motion.div>
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
