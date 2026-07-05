import { type RefObject, useEffect, useRef } from "react";

/**
 * matter.js footer toy. Keeps the real footer DOM (links stay accessible + the
 * assembled state IS the `current` design) and drives each piece's transform
 * from a rigid body: on mount everything drops + piles under gravity; as the
 * cursor nears the footer a spring "magnet" reels each body back to its home,
 * scattering again when the cursor leaves.
 *
 * Granularity is PER-CHARACTER: every text label is split into inline-block
 * glyph spans (one body each) so the words shatter into letters, and the GitHub
 * heatmap tiles (`.contrib-cell`) join the pile too. Splitting is fully reverted
 * on teardown (original innerHTML restored), so it's additive — touches nothing
 * but the targeted nodes' inline transform. matter.js is dynamically imported so
 * it only downloads when this (the physics variant) is mounted. Renders null.
 */
type PhysicsDials = {
  gravity: number;
  magnetRadius: number;
  stiffness: number;
  bounce: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
// Converts the stiffness dial into a per-frame spring force scale that reads
// well against matter's default gravity at pixel scale.
const SPRING_SCALE = 0.0006;
// Tiny glyphs (an "i", a stray comma) tunnel through the ground at speed, so
// give every body a collision floor size even though the visual is the real box.
const MIN_BODY_W = 6;
const MIN_BODY_H = 8;

export function PhysicsFooter({
  bodyRef,
  dials,
}: {
  bodyRef: RefObject<HTMLDivElement | null>;
  dials: PhysicsDials;
}) {
  // Live dial mirror so tuning sliders take effect without rebuilding the world.
  const dialsRef = useRef(dials);
  dialsRef.current = dials;

  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let teardown = () => {};

    (async () => {
      const Matter = (await import("matter-js")).default;
      if (cancelled || !bodyRef.current) return;

      type Item = {
        el: HTMLElement | SVGElement;
        body: Matter.Body;
        home: { cx: number; cy: number };
      };

      const build = () => {
        // 1. Shatter every text label into per-character inline-block spans so
        //    the words fall apart letter by letter. innerHTML is saved for a
        //    clean restore on teardown (keeps this additive + StrictMode-safe).
        const restores: (() => void)[] = [];
        const charEls: HTMLElement[] = [];
        const splitEls = [
          ...container.querySelectorAll<HTMLElement>(
            ".contrib-label, .contrib-count, .rail-link-label, .rail-link-sub",
          ),
          ...container.querySelectorAll<HTMLElement>(":scope > p"),
        ];
        for (const parent of splitEls) {
          const original = parent.innerHTML;
          restores.push(() => {
            parent.innerHTML = original;
          });
          const text = parent.textContent ?? "";
          parent.textContent = "";
          for (const ch of text) {
            const s = document.createElement("span");
            s.className = "phys-char";
            s.textContent = ch;
            s.style.display = "inline-block";
            s.style.whiteSpace = "pre"; // keep spaces' width
            parent.appendChild(s);
            charEls.push(s);
          }
        }

        // 2. Whole-body pieces: the link arrows + every populated heatmap tile
        //    (skip the transparent leading-pad cells — nothing to see fall).
        const wholeEls: (HTMLElement | SVGElement)[] = [
          ...container.querySelectorAll<SVGElement>(".rail-link svg, .contrib-head svg"),
          ...container.querySelectorAll<HTMLElement>(
            ".contrib-cell:not(.contrib-cell--pad)",
          ),
        ];

        const els: (HTMLElement | SVGElement)[] = [...charEls, ...wholeEls];
        if (!els.length) {
          restores.forEach((r) => r());
          return;
        }

        // Home boxes in CONTAINER-LOCAL coords — measuring both rects cancels any
        // shared ancestor transform (the Reveal slide-in), so homes are stable.
        // Measured AFTER splitting so the inline-block reflow is already settled.
        const measureHomes = () => {
          const cb = container.getBoundingClientRect();
          return els.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              cx: r.left - cb.left + r.width / 2,
              cy: r.top - cb.top + r.height / 2,
              w: r.width,
              h: r.height,
            };
          });
        };

        let homes = measureHomes();
        const engine = Matter.Engine.create();
        engine.gravity.y = dialsRef.current.gravity;

        const items: Item[] = els.map((el, i) => {
          const h = homes[i];
          const body = Matter.Bodies.rectangle(
            h.cx,
            h.cy,
            Math.max(h.w, MIN_BODY_W),
            Math.max(h.h, MIN_BODY_H),
            {
              restitution: dialsRef.current.bounce,
              frictionAir: 0.05,
              friction: 0.4,
            },
          );
          return { el, body, home: { cx: h.cx, cy: h.cy } };
        });

        const makeBounds = () => {
          const w = container.clientWidth;
          const hgt = container.clientHeight;
          return [
            Matter.Bodies.rectangle(w / 2, hgt + 24, w * 3, 48, { isStatic: true }),
            Matter.Bodies.rectangle(-24, hgt / 2, 48, hgt * 3, { isStatic: true }),
            Matter.Bodies.rectangle(w + 24, hgt / 2, 48, hgt * 3, { isStatic: true }),
          ];
        };
        let bounds = makeBounds();
        Matter.Composite.add(engine.world, [...items.map((it) => it.body), ...bounds]);

        // Kick each body sideways + spinning on load so the letters tumble and
        // scatter as they drop, instead of just compressing straight down.
        items.forEach(({ body }) => {
          Matter.Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 9,
            y: 1 + Math.random() * 2,
          });
          Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.25);
        });

        const pointer = { x: -1e4, y: -1e4 };
        const onMove = (e: PointerEvent) => {
          pointer.x = e.clientX;
          pointer.y = e.clientY;
        };
        window.addEventListener("pointermove", onMove, { passive: true });

        const onResize = () => {
          homes = measureHomes();
          items.forEach((it, i) => (it.home = { cx: homes[i].cx, cy: homes[i].cy }));
          Matter.Composite.remove(engine.world, bounds);
          bounds = makeBounds();
          Matter.Composite.add(engine.world, bounds);
        };
        window.addEventListener("resize", onResize, { passive: true });

        items.forEach((it) => (it.el.style.willChange = "transform"));

        let raf = 0;
        const tick = () => {
          const d = dialsRef.current;
          engine.gravity.y = d.gravity;

          // Cursor → footer distance (0 when inside the footer box).
          const fb = container.getBoundingClientRect();
          const dx = Math.max(fb.left - pointer.x, 0, pointer.x - fb.right);
          const dy = Math.max(fb.top - pointer.y, 0, pointer.y - fb.bottom);
          const prox = clamp01(1 - Math.hypot(dx, dy) / d.magnetRadius);

          for (const it of items) {
            const b = it.body;
            if (prox > 0.98) {
              // Cursor over the footer → snap to the exact assembled (current) layout.
              Matter.Body.setPosition(b, { x: it.home.cx, y: it.home.cy });
              Matter.Body.setVelocity(b, { x: 0, y: 0 });
              Matter.Body.setAngularVelocity(b, 0);
              Matter.Body.setAngle(b, 0);
            } else {
              const k = d.stiffness * prox * SPRING_SCALE * b.mass;
              Matter.Body.applyForce(b, b.position, {
                x: (it.home.cx - b.position.x) * k,
                y: (it.home.cy - b.position.y) * k,
              });
            }
          }

          Matter.Engine.update(engine, 1000 / 60);

          for (const it of items) {
            const b = it.body;
            it.el.style.transform = `translate(${(b.position.x - it.home.cx).toFixed(2)}px, ${(
              b.position.y - it.home.cy
            ).toFixed(2)}px) rotate(${b.angle.toFixed(3)}rad)`;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        teardown = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("resize", onResize);
          Matter.Composite.clear(engine.world, false);
          Matter.Engine.clear(engine);
          // Reset whole-body transforms; the char spans are discarded wholesale
          // by the innerHTML restore below.
          items.forEach((it) => {
            it.el.style.transform = "";
            it.el.style.willChange = "";
          });
          restores.forEach((r) => r());
        };
      };

      // The GitHub block (ContribGraph) renders async after its fetch, so wait
      // for its head to exist before measuring — otherwise the GitHub text/tiles
      // aren't captured and there's nothing up top to drop.
      if (container.querySelector(".contrib-head")) {
        build();
      } else {
        const mo = new MutationObserver(() => {
          if (cancelled || container.querySelector(".contrib-head")) {
            mo.disconnect();
            if (!cancelled) build();
          }
        });
        mo.observe(container, { childList: true, subtree: true });
        teardown = () => mo.disconnect();
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [bodyRef]);

  return null;
}
