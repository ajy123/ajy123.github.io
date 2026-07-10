import { useSyncExternalStore } from "react";

/**
 * Mechanical key click for the composer's send keycap — synthesized in
 * WebAudio, zero asset bytes. Two layers, like a real switch: a bandpassed
 * noise tick (the switch leaf) over a short low "thock" (the case). Quiet by
 * design — feedback, not fanfare. A small random detune per press keeps rapid
 * sends reading as keystrokes rather than a looped sample.
 *
 * Call ONLY from inside a user gesture (click / Enter): the shared
 * AudioContext is created lazily on the first press, which is what satisfies
 * autoplay policies. Every failure is swallowed — sound is garnish and must
 * never break the send path.
 *
 * Muteable: unsolicited audio needs an opt-out (crit: office/library). The
 * preference persists in localStorage and is exposed as a store + hook so the
 * chat topbar can render a toggle. Deliberately NOT tied to
 * prefers-reduced-motion — that's motion, not audio.
 */

const MUTE_KEY = "chat-sound";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return false;
  }
}

let muted = readMuted();
const muteListeners = new Set<() => void>();

export function getKeyClickMuted(): boolean {
  return muted;
}

export function setKeyClickMuted(next: boolean): void {
  if (next === muted) return;
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "off" : "on");
  } catch {
    // storage denied — preference still holds for this session.
  }
  muteListeners.forEach((listener) => listener());
}

export function useKeyClickMuted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      muteListeners.add(listener);
      return () => {
        muteListeners.delete(listener);
      };
    },
    getKeyClickMuted,
    () => false,
  );
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function playKeyClick(): void {
  if (muted) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) {
      ctx = new Ctor();
      // One master gain for the whole click — a single knob for level.
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (!master) return;
    // resume() rejection is async — it escapes the try/catch below, so it
    // needs its own swallow.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const t = ctx.currentTime;
    const detune = 0.94 + Math.random() * 0.12;

    // Switch tick: ~18ms of noise through a wide bandpass around 2.2kHz.
    // Low Q on purpose — a narrow band reads as a tuned beep, a real click is
    // a broadband transient.
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 0.02),
        ctx.sampleRate,
      );
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.playbackRate.value = detune;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2200 * detune;
    band.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.09, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

    // Case thock: a short sine dropping 170→90Hz under the tick.
    const thock = ctx.createOscillator();
    thock.type = "sine";
    thock.frequency.setValueAtTime(170 * detune, t);
    thock.frequency.exponentialRampToValueAtTime(90, t + 0.06);
    const thockGain = ctx.createGain();
    thockGain.gain.setValueAtTime(0.11, t);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);

    noise.connect(band).connect(noiseGain).connect(master);
    thock.connect(thockGain).connect(master);
    noise.start(t);
    thock.start(t);
    noise.stop(t + 0.03);
    thock.stop(t + 0.08);
  } catch {
    // Audio unavailable/blocked — send continues silently.
  }
}
