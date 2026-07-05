import { useEffect, useRef } from "react";

// Pixelated comet-trail cursor effect (à la thebrowser.company). A fixed,
// click-through canvas overlay draws grid-snapped 5px blue squares at the
// pointer; each frame fades every square ~4% so a continuous stroke reads as a
// bright head fading to a faint tail. Pure React + Canvas 2D, no deps.

const GRID = 5; // CSS px — square size and lattice step
const COLOR = "13, 81, 255"; // rgb() channels for #0D51FF, hue never varies
const FADE = 0.96; // per-frame alpha multiplier (~1s to vanish)
const MIN_ALPHA = 0.02; // cull threshold

type Particle = { gridX: number; gridY: number; alpha: number };

export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;
    const particles: Particle[] = [];
    let frame = 0;

    // Backing store at device resolution; CSS box stays at viewport size so the
    // squares render crisp. The context is scaled to draw in CSS pixels.
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (event: MouseEvent) => {
      // Snap to a fixed 5px lattice rather than sitting exactly under cursor.
      const gridX = Math.round(event.clientX / GRID) * GRID;
      const gridY = Math.round(event.clientY / GRID) * GRID;
      particles.push({ gridX, gridY, alpha: 1 });
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.alpha *= FADE;
        if (p.alpha < MIN_ALPHA) {
          particles.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(${COLOR}, ${p.alpha})`;
        ctx.fillRect(p.gridX, p.gridY, GRID, GRID);
      }

      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1000,
        imageRendering: "pixelated",
      }}
    />
  );
}
