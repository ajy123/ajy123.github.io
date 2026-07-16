// PostHog analytics (US cloud). The project token is a public write-only key,
// safe to ship in the client bundle. Pageviews/clicks come from autocapture;
// chat interactions are captured explicitly via the helpers below.
//
// The SDK (~90KB gzip) is dynamic-imported on first idle so it never blocks
// first paint. Events captured before it loads queue up and flush on init.
import type { PostHog } from "posthog-js";

const POSTHOG_KEY = "phc_m7Ft63KR75rxrb94WKN9kRW4uEqg5RY942iwZwKvV67e";

let client: PostHog | null = null;
let disabled = false;
const pending: Array<[string, Record<string, unknown>]> = [];

function capture(event: string, properties: Record<string, unknown>): void {
  if (disabled) return;
  if (client) {
    client.capture(event, properties);
  } else {
    pending.push([event, properties]);
  }
}

export function initAnalytics(): void {
  // Keep dev sessions out of the production dashboard.
  if (import.meta.env.DEV) {
    disabled = true;
    return;
  }

  const load = () => {
    import("posthog-js")
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          api_host: "https://us.i.posthog.com",
          defaults: "2025-05-24",
          // Anonymous visitors stay anonymous (cheaper events, no profiles
          // for a portfolio site's traffic).
          person_profiles: "identified_only",
        });
        client = posthog;
        for (const [event, properties] of pending) {
          posthog.capture(event, properties);
        }
        pending.length = 0;
      })
      .catch(() => {
        // Chunk failed to load (offline, stale hash after a redeploy):
        // analytics is lost for this session — stop queueing into the void.
        disabled = true;
        pending.length = 0;
      });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 4000 });
  } else {
    // Safari < 16 has no requestIdleCallback.
    window.setTimeout(load, 1500);
  }
}

export type ChatQuerySource = "typed" | "suggested" | "retry";

export function trackChatQuery(
  query: string,
  source: ChatQuerySource,
  zone?: string,
): void {
  capture("chat_query", { query, source, zone });
}

export function trackChatResponse(
  outcome: "done" | "error",
  durationMs: number,
  status?: number,
): void {
  capture("chat_response", { outcome, duration_ms: durationMs, status });
}

// first_touch = the visitor's first role pick this session (the intent
// signal, never overwritten by a later toggle). switch = a later change —
// it revises the view, not the intent — with switchCount incrementing each
// time. A dismiss of the ask logs nothing; it's not a signal either way.
export type AudienceRoleTrigger = "first_touch" | "switch";

export function trackAudienceRole(
  role: string,
  { trigger, switchCount }: { trigger: AudienceRoleTrigger; switchCount: number },
): void {
  capture("audience_role", { role, trigger, switchCount });
}
