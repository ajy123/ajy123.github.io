import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import {
  ContextualAskHint,
  DEFAULT_CONTEXTUAL_ASK_HINT_DIALS,
  type ContextualAskHintDials,
} from "./ContextualAskHint";

export function ContextualAskHintWithDials() {
  const params = useDialKit(
    "Contextual Ask Hint",
    {
      dwellMs: [DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.dwellMs, 0, 1200, 10],
      offsetX: [DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.offsetX, -80, 120, 1],
      offsetY: [DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.offsetY, -80, 120, 1],
      expandDelayMs: [
        DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.expandDelayMs,
        0,
        900,
        10,
      ],
      pinSize: [DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.pinSize, 14, 32, 1],
      hintMaxWidth: [DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.hintMaxWidth, 160, 320, 1],
      scrambleDurMs: [
        DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.scrambleDurMs,
        0,
        2000,
        25,
      ],
      scrambleSpeed: [
        DEFAULT_CONTEXTUAL_ASK_HINT_DIALS.scrambleSpeed,
        0.01,
        0.12,
        0.005,
      ],
    },
    {
      id: "contextual-ask-hint",
      persist: {
        key: "joanna-contextual-ask-hint-dials",
      },
    },
  );

  const dials: ContextualAskHintDials = {
    ...DEFAULT_CONTEXTUAL_ASK_HINT_DIALS,
    dwellMs: params.dwellMs,
    offsetX: params.offsetX,
    offsetY: params.offsetY,
    expandDelayMs: params.expandDelayMs,
    pinSize: params.pinSize,
    hintMaxWidth: params.hintMaxWidth,
    scrambleDurMs: params.scrambleDurMs,
    scrambleSpeed: params.scrambleSpeed,
  };

  return (
    <>
      <ContextualAskHint dials={dials} />
      <DialRoot position="top-right" defaultOpen={false} />
    </>
  );
}
