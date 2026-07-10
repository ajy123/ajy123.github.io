import { useEffect, useRef } from "react";

const CURSOR_TRAIL_DEFAULTS = {
  pixelSize: 10,
  fadeMs: 250,
  maxAlpha: 0.5,
  wandererCount: 0,
  pathLength: 24,
  stepMs: 155,
  spawnIntervalMs: 1500,
  turnChance: 0.3,
};

type Cell = {
  x: number;
  y: number;
  fadeStart: number;
};

type Trail = {
  id: number;
  path: GridPoint[];
  currentIndex: number;
  lastStampedIndex: number;
  startTime: number;
};

type GridPoint = {
  x: number;
  y: number;
};

const DIRECTIONS: GridPoint[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function keyFor(cell: GridPoint) {
  return `${cell.x}-${cell.y}`;
}

function randomInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

function readCellColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
    "#f44800"
  );
}

function directionIndexFor(direction: GridPoint) {
  return DIRECTIONS.findIndex(
    (candidate) => candidate.x === direction.x && candidate.y === direction.y,
  );
}

export function CursorTrail({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const {
      pixelSize: configuredPixelSize,
      fadeMs: configuredFadeMs,
      maxAlpha: configuredMaxAlpha,
      wandererCount: configuredWandererCount,
      pathLength: configuredPathLength,
      stepMs: configuredStepMs,
      spawnIntervalMs: configuredSpawnIntervalMs,
      turnChance: configuredTurnChance,
    } = CURSOR_TRAIL_DEFAULTS;
    const pixelSize = Math.max(1, Math.round(configuredPixelSize));
    const fadeMs = Math.max(1, configuredFadeMs);
    const maxAlpha = clamp(configuredMaxAlpha, 0.05, 1);
    const targetWandererCount = clamp(Math.round(configuredWandererCount), 0, 8);
    const pathLength = Math.max(1, Math.round(configuredPathLength));
    const stepMs = Math.max(1, configuredStepMs);
    const spawnIntervalMs = Math.max(100, configuredSpawnIntervalMs);
    const turnChance = clamp(configuredTurnChance, 0, 1);

    let dpr = window.devicePixelRatio || 1;
    let rafId: number | null = null;
    let tickerId: number | null = null;
    let maintenanceId: number | null = null;
    let nextTrailId = 1;
    let pendingSpawnCount = 0;
    let gridColumns = 1;
    let gridRows = 1;
    let cellColor = readCellColor();
    const cells = new Map<string, Cell>();
    const trails: Trail[] = [];
    const spawnTimers = new Set<number>();
    const pointerQuery = window.matchMedia("(pointer: fine)");

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const { innerWidth: width, innerHeight: height } = window;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gridColumns = Math.max(1, Math.ceil(width / pixelSize));
      gridRows = Math.max(1, Math.ceil(height / pixelSize));
    };

    const stopRender = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const render = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.fillStyle = cellColor;

      for (const [key, cell] of cells) {
        const progress = (now - cell.fadeStart) / fadeMs;
        const easedProgress = progress * progress * progress;
        const alpha = maxAlpha * (1 - easedProgress);

        if (alpha <= 0) {
          cells.delete(key);
          continue;
        }

        ctx.globalAlpha = alpha;
        const x = cell.x * pixelSize;
        const y = cell.y * pixelSize;
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }

      ctx.globalAlpha = 1;

      if (cells.size > 0) {
        rafId = window.requestAnimationFrame(render);
      } else {
        rafId = null;
      }
    };

    const startRender = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    const stampCell = (cell: GridPoint, now = performance.now()) => {
      cells.set(keyFor(cell), { ...cell, fadeStart: now });
      startRender();
    };

    const buildAvoidSet = () => {
      const avoid = new Set<string>();
      for (const trail of trails) {
        for (const cell of trail.path) avoid.add(keyFor(cell));
      }
      return avoid;
    };

    const buildPath = (startCell?: GridPoint, avoid = new Set<string>()) => {
      const start = startCell ?? {
        x: randomInt(gridColumns),
        y: randomInt(gridRows),
      };
      const path: GridPoint[] = [{ ...start }];
      let current = { ...start };
      let directionIndex = randomInt(DIRECTIONS.length);

      for (let i = 1; i < pathLength; i += 1) {
        if (Math.random() < turnChance) {
          directionIndex =
            (directionIndex + (Math.random() < 0.5 ? -1 : 1) + DIRECTIONS.length) %
            DIRECTIONS.length;
        }

        let direction = DIRECTIONS[directionIndex];
        let next = {
          x: current.x + direction.x,
          y: current.y + direction.y,
        };

        if (next.x < 0 || next.x >= gridColumns) {
          direction = { ...direction, x: direction.x * -1 };
          next.x = clamp(current.x + direction.x, 0, gridColumns - 1);
        }

        if (next.y < 0 || next.y >= gridRows) {
          direction = { ...direction, y: direction.y * -1 };
          next.y = clamp(current.y + direction.y, 0, gridRows - 1);
        }

        const reflectedIndex = directionIndexFor(direction);
        if (reflectedIndex >= 0) directionIndex = reflectedIndex;

        if (avoid.has(keyFor(next))) {
          let foundAlternative = false;
          for (let offset = 1; offset < DIRECTIONS.length; offset += 1) {
            const candidateIndex = (directionIndex + offset) % DIRECTIONS.length;
            const candidateDirection = DIRECTIONS[candidateIndex];
            const candidate = {
              x: clamp(current.x + candidateDirection.x, 0, gridColumns - 1),
              y: clamp(current.y + candidateDirection.y, 0, gridRows - 1),
            };

            if (!avoid.has(keyFor(candidate))) {
              directionIndex = candidateIndex;
              next = candidate;
              foundAlternative = true;
              break;
            }
          }

          if (!foundAlternative) continue;
        }

        path.push(next);
        avoid.add(keyFor(next));
        current = next;
      }

      return path;
    };

    const spawnTrail = (jitterMs = 0) => {
      if (suspended || targetWandererCount <= 0) return;

      pendingSpawnCount += 1;
      const timerId = window.setTimeout(() => {
        spawnTimers.delete(timerId);
        pendingSpawnCount = Math.max(0, pendingSpawnCount - 1);

        if (suspended || trails.length >= targetWandererCount) return;

        const path = buildPath(undefined, buildAvoidSet());
        trails.push({
          id: nextTrailId,
          path,
          currentIndex: -1,
          lastStampedIndex: -1,
          startTime: performance.now(),
        });
        nextTrailId += 1;
      }, jitterMs);

      spawnTimers.add(timerId);
    };

    const advanceTrails = () => {
      if (suspended) return;

      const now = performance.now();
      for (let trailIndex = trails.length - 1; trailIndex >= 0; trailIndex -= 1) {
        const trail = trails[trailIndex];
        const nextIndex = Math.min(
          trail.path.length - 1,
          Math.floor((now - trail.startTime) / stepMs),
        );

        for (
          let pathIndex = trail.lastStampedIndex + 1;
          pathIndex <= nextIndex;
          pathIndex += 1
        ) {
          const cell = trail.path[pathIndex];
          if (cell) stampCell(cell, now);
        }

        trail.currentIndex = nextIndex;
        trail.lastStampedIndex = Math.max(trail.lastStampedIndex, nextIndex);

        if (trail.currentIndex >= trail.path.length - 1) {
          trails.splice(trailIndex, 1);
        }
      }
    };

    const maintainTrails = () => {
      if (suspended) return;

      while (trails.length + pendingSpawnCount < targetWandererCount) {
        spawnTrail(Math.random() * 400);
      }
    };

    const onMove = (event: MouseEvent) => {
      if (suspended) return;
      stampCell({
        x: Math.floor(event.clientX / pixelSize),
        y: Math.floor(event.clientY / pixelSize),
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || suspended) return;

      const missingTrails = Math.max(
        0,
        targetWandererCount - trails.length - pendingSpawnCount,
      );
      for (let i = 0; i < missingTrails; i += 1) {
        spawnTrail(Math.random() * 800);
      }
    };
    const themeObserver = new MutationObserver(() => {
      cellColor = readCellColor();
      if (cells.size > 0) startRender();
    });

    resize();

    if (suspended) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      return () => undefined;
    }

    if (pointerQuery.matches) {
      window.addEventListener("mousemove", onMove, { passive: true });
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });

    if (targetWandererCount > 0) {
      maintainTrails();
      tickerId = window.setInterval(advanceTrails, 60);
      maintenanceId = window.setInterval(
        maintainTrails,
        Math.max(100, spawnIntervalMs / 3),
      );
    }

    /*
     * Presence hook: wandererCount is the integration point for later. A future
     * usePresence() can return a visitor count from Firebase RTDB heartbeat or a
     * tiny KV endpoint, then feed clamp(count, 1, 8) into this dial.
     */

    return () => {
      stopRender();
      if (tickerId !== null) window.clearInterval(tickerId);
      if (maintenanceId !== null) window.clearInterval(maintenanceId);
      for (const timerId of spawnTimers) window.clearTimeout(timerId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      themeObserver.disconnect();
      cells.clear();
      trails.length = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, [suspended]);

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
