import { useDialKit } from "dialkit";
import {
  CursorTrail,
  DEFAULT_CURSOR_TRAIL_DIALS,
  type CursorTrailDials,
} from "./CursorTrail";

export function CursorTrailWithDials({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const params = useDialKit(
    "Cursor Trail",
    {
      pixelSize: [DEFAULT_CURSOR_TRAIL_DIALS.pixelSize, 6, 48, 1],
      fadeMs: [DEFAULT_CURSOR_TRAIL_DIALS.fadeMs, 100, 2400, 25],
      maxAlpha: [DEFAULT_CURSOR_TRAIL_DIALS.maxAlpha, 0.05, 1, 0.05],
      wandererCount: [DEFAULT_CURSOR_TRAIL_DIALS.wandererCount, 0, 8, 1],
      pathLength: [DEFAULT_CURSOR_TRAIL_DIALS.pathLength, 8, 80, 1],
      stepMs: [DEFAULT_CURSOR_TRAIL_DIALS.stepMs, 50, 400, 5],
      spawnIntervalMs: [
        DEFAULT_CURSOR_TRAIL_DIALS.spawnIntervalMs,
        400,
        5000,
        100,
      ],
      turnChance: [DEFAULT_CURSOR_TRAIL_DIALS.turnChance, 0, 1, 0.05],
    },
    {
      id: "cursor-trail",
      persist: {
        key: "joanna-cursor-trail-dials-v2",
      },
    },
  );

  const dials: CursorTrailDials = {
    ...DEFAULT_CURSOR_TRAIL_DIALS,
    pixelSize: params.pixelSize,
    fadeMs: params.fadeMs,
    maxAlpha: params.maxAlpha,
    wandererCount: params.wandererCount,
    pathLength: params.pathLength,
    stepMs: params.stepMs,
    spawnIntervalMs: params.spawnIntervalMs,
    turnChance: params.turnChance,
  };

  return <CursorTrail dials={dials} suspended={suspended} />;
}
