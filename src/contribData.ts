import { useEffect, useState } from "react";

/**
 * Shared GitHub-contributions data path. Both the rail's ContribGraph and the
 * GridLogo mark read the *same* trailing-window activity through this hook, so
 * the page fetches the public endpoint at most once per user (module-level
 * cache + in-flight dedupe) — the logo never fetches twice. On any failure the
 * hook returns null and every consumer falls back gracefully.
 */
export type ContribDay = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

type ContribResponse = {
  total: { lastYear: number };
  contributions: ContribDay[];
};

// Free, no-token public mirror of the GitHub contributions calendar.
const ENDPOINT = "https://github-contributions-api.jogruber.de/v4";
const WINDOW_DAYS = 30;

const cache = new Map<string, ContribDay[]>();
const inflight = new Map<string, Promise<ContribDay[] | null>>();

// Local-date "YYYY-MM-DD" (not toISOString, which is UTC and can skew a day).
function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function fetchWindow(user: string): Promise<ContribDay[] | null> {
  try {
    // Fetch by calendar YEAR, not ?y=last: the rolling endpoint caches hard and
    // goes stale for low-activity accounts. A year fetch also returns future
    // dates (→ Dec 31, all zero), so we filter to today then take the trailing
    // window. Pull the previous year too when the window crosses the Jan
    // boundary.
    const now = new Date();
    const todayStr = ymd(now);
    const back = new Date(now);
    back.setDate(back.getDate() - (WINDOW_DAYS - 1));
    const years =
      back.getFullYear() === now.getFullYear()
        ? [now.getFullYear()]
        : [back.getFullYear(), now.getFullYear()];

    const all: ContribDay[] = [];
    for (const y of years) {
      const res = await fetch(`${ENDPOINT}/${user}?y=${y}`);
      if (!res.ok) return null;
      const data: ContribResponse = await res.json();
      if (Array.isArray(data.contributions)) {
        all.push(...data.contributions);
      }
    }

    // Drop future-dated cells, then keep the trailing WINDOW_DAYS up to today.
    const window = all.filter((d) => d.date <= todayStr).slice(-WINDOW_DAYS);
    return window.length ? window : null;
  } catch {
    // network error / abort — signal absence, consumers fall back.
    return null;
  }
}

/** Trailing 30-day contribution window for `user`, or null until/if it loads. */
export function useContribDays(user: string): ContribDay[] | null {
  const [days, setDays] = useState<ContribDay[] | null>(
    () => cache.get(user) ?? null,
  );

  useEffect(() => {
    const cached = cache.get(user);
    if (cached) {
      setDays(cached);
      return;
    }

    let active = true;
    let promise = inflight.get(user);
    if (!promise) {
      promise = fetchWindow(user);
      inflight.set(user, promise);
    }

    promise
      .then((res) => {
        inflight.delete(user);
        if (res) cache.set(user, res);
        if (active && res) setDays(res);
      })
      .catch(() => {
        inflight.delete(user);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return days;
}
