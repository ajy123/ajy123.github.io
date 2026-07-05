import { useEffect, useState } from "react";

/**
 * Last-30-days GitHub contributions heatmap for the left rail. Purely additive:
 * fetches a public JSON endpoint at mount, draws the cells in the site's grey
 * ramp, and links to the profile. Makes ZERO engine/splash calls; on any fetch
 * failure it renders null so the rail is unaffected.
 */
type ContribDay = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
type ContribResponse = {
  total: { lastYear: number };
  contributions: ContribDay[];
};

// Free, no-token public mirror of the GitHub contributions calendar.
const ENDPOINT = "https://github-contributions-api.jogruber.de/v4";
const WINDOW_DAYS = 30;

// Local-date "YYYY-MM-DD" (not toISOString, which is UTC and can skew a day).
function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// External-link cue — same glyph as the rail's ArrowIcon, inlined to avoid a
// circular import with main.tsx.
function LinkArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function ContribGraph({ user }: { user: string }) {
  const [days, setDays] = useState<ContribDay[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        // Fetch by calendar YEAR, not ?y=last: the rolling endpoint caches hard
        // and goes stale for low-activity accounts. A year fetch also returns
        // future dates (→ Dec 31, all zero), so we filter to today then take the
        // trailing window. Pull the previous year too when the 30-day window
        // crosses the Jan boundary.
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
          const res = await fetch(`${ENDPOINT}/${user}?y=${y}`, {
            signal: ctrl.signal,
          });
          if (!res.ok) return;
          const data: ContribResponse = await res.json();
          if (Array.isArray(data.contributions)) {
            all.push(...data.contributions);
          }
        }

        // Drop future-dated cells, then keep the trailing WINDOW_DAYS up to today.
        const window = all
          .filter((d) => d.date <= todayStr)
          .slice(-WINDOW_DAYS);
        if (window.length) setDays(window);
      } catch {
        // network error / abort — leave days null, block stays absent.
      }
    })();
    return () => ctrl.abort();
  }, [user]);

  if (!days || !days.length) return null;

  // One tile per day for the past 7 days (end-aligned: rightmost = today),
  // shaded by the API's native contribution level. Left-pad if the account has
  // fewer than 7 days of history in the window.
  const WINDOW = 7;
  const last7 = days.slice(-WINDOW);
  const tiles: (ContribDay | null)[] = [
    ...Array(Math.max(0, WINDOW - last7.length)).fill(null),
    ...last7,
  ];
  const sum = last7.reduce((acc, d) => acc + d.count, 0);
  const activeDays = last7.filter((d) => d.count > 0).length;

  return (
    <div className="contrib">
      <span className="contrib-head">
        <span className="contrib-label">GitHub</span>
        <a
          className="contrib-link"
          href={`https://github.com/${user}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`GitHub: ${sum} contributions in the last 7 days. Opens profile in a new tab.`}
        >
          <LinkArrow />
        </a>
        <span className="contrib-slot">
          <span className="contrib-weeks" aria-hidden="true">
            {tiles.map((d, i) => (
              <span
                key={i}
                className="contrib-cell"
                data-level={d ? d.level : 0}
                title={d ? `${d.count} on ${d.date}` : "no data"}
              />
            ))}
          </span>
          <span className="contrib-count">
            {activeDays}/7 active · {sum} total
          </span>
        </span>
      </span>
    </div>
  );
}
