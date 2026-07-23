// Animated line-art thumbnail for the Swiftly work card. Redraws the real
// product as a small device screen (~75% of the card) and plays the support
// moment as a sequence: the flagged device pulses on its own (something's
// wrong) → the cursor arrives and hovers it → click → its detail opens.
//
// Product-design basics: one PERSISTENT global nav (title + tabs + rule) across
// both screens — the detail has no second nav, just the timeseries. The dot
// dashboard is centered in the panel (equal margins). Motion personality is
// its own: an unhurried monitoring cadence (5.6s, soft easing), deliberately
// out of step with NYU's brisker rhythm so the two read as separate products.
// Loops beside the video cards; reset crossfades; paused / reduced-motion
// settles on the matrix with the device found. One forest exception.
const ACCENT = "#174C3A";
const STROKE = "#171717";
const PAPER = "#FAF9F5";
const HAIR = "rgba(23,23,23,0.14)";
const FAINT = "rgba(23,23,23,0.28)";

const CSS = `
.swt-alert{opacity:0;transform-box:fill-box;transform-origin:center}
.swt-flag{transform-box:fill-box;transform-origin:center}
.swt-cursor{transform:translate(201px,121px)}
.swt-detail{opacity:0;transform-origin:160px 132px}
.swt-bar{transform-box:fill-box;transform-origin:50% 100%}
@keyframes swt-alert{0%{opacity:0;transform:scale(.6)}3%{opacity:.5}10%{opacity:0;transform:scale(2.4)}10.001%{transform:scale(.6)}13%{opacity:.42}20%{opacity:0;transform:scale(2.1)}100%{opacity:0}}
@keyframes swt-flag{0%{transform:scale(1)}3%{transform:scale(1.24)}8%{transform:scale(1.04)}13%{transform:scale(1.15)}19%{transform:scale(1)}33%{transform:scale(1)}36%{transform:scale(.66)}41%{transform:scale(1)}100%{transform:scale(1)}}
@keyframes swt-cur{0%,16%{transform:translate(246px,176px);opacity:0}20%{opacity:1}33%{transform:translate(201px,121px)}42%{transform:translate(201px,121px);opacity:1}47%{opacity:0}100%{transform:translate(201px,121px);opacity:0}}
@keyframes swt-det{0%,37%{opacity:0;transform:scale(.93);filter:blur(2px)}49%{opacity:1;transform:scale(1);filter:blur(0)}86%{opacity:1;transform:scale(1);filter:blur(0)}95%{opacity:0;filter:blur(2px)}100%{opacity:0}}
@keyframes swt-bar{0%,41%{transform:scaleY(0)}55%{transform:scaleY(1)}86%{transform:scaleY(1)}94%{transform:scaleY(0)}100%{transform:scaleY(0)}}
@media (prefers-reduced-motion: no-preference){
  .work-media--thumbnail[data-playing="true"] .swt-alert{animation:swt-alert 5.6s cubic-bezier(.12,.8,.3,1) infinite}
  .work-media--thumbnail[data-playing="true"] .swt-flag{animation:swt-flag 5.6s cubic-bezier(.3,.85,.35,1) infinite}
  .work-media--thumbnail[data-playing="true"] .swt-cursor{animation:swt-cur 5.6s cubic-bezier(.55,0,.35,1) infinite}
  .work-media--thumbnail[data-playing="true"] .swt-detail{animation:swt-det 5.6s cubic-bezier(.3,.9,.3,1) infinite}
  .work-media--thumbnail[data-playing="true"] .swt-bar{animation:swt-bar 5.6s cubic-bezier(.22,1,.36,1) infinite}
}
`;

// centered dot dashboard
const COLS = [124, 148, 172, 196, 220];
const ROWS = [98, 116, 134, 152, 170];
const RINGS: Array<[number, number]> = [];
for (const y of ROWS) {
  for (const x of COLS) {
    if (!(x === 196 && y === 116)) RINGS.push([x, y]);
  }
}
// timeseries spans the content margin (76 -> 248), fills the freed detail area
const BAR_H = [40, 56, 32, 72, 52, 76, 38];
const BAR_W = 16;
const BAR_STEP = (248 - 76 - BAR_W) / (BAR_H.length - 1);
const BASELINE = 180;

export function SwiftlyThumbnail() {
  return (
    <svg
      viewBox="0 0 320 240"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="A device flags itself in the monitoring matrix, then its detail view opens."
    >
      <style>{CSS}</style>
      <defs>
        <clipPath id="swt-clip">
          <rect x="58" y="48" width="204" height="144" rx="9" />
        </clipPath>
      </defs>

      {/* device frame */}
      <rect x="58" y="48" width="204" height="144" rx="9" fill={PAPER} stroke={HAIR} />

      <g clipPath="url(#swt-clip)">
        {/* PERSISTENT global nav — title + rule only, across both screens */}
        <rect x="74" y="62" width="44" height="6" rx="3" fill={STROKE} />
        <line x1="66" y1="82" x2="254" y2="82" stroke={HAIR} />

        {/* Screen A content — the centered dot dashboard */}
        <g>
          {ROWS.map((y, i) => (
            <rect key={y} x="98" y={y - 2} width="12" height="4" rx="2" fill={i === 1 ? STROKE : FAINT} />
          ))}
          <g fill="none" stroke={FAINT}>
            {RINGS.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
            ))}
          </g>
          {/* the exception: pulses (alert), then holds */}
          <circle className="swt-alert" cx="196" cy="116" r="6" fill="none" stroke={ACCENT} />
          <circle className="swt-flag" cx="196" cy="116" r="3.8" fill={ACCENT} />
        </g>

        {/* Screen B content — device detail: just the timeseries, no second nav */}
        <g className="swt-detail">
          <rect x="58" y="83" width="204" height="109" fill={PAPER} />
          {BAR_H.map((h, i) => (
            <rect
              key={i}
              className="swt-bar"
              style={{ animationDelay: `${i * 0.05}s` }}
              x={76 + i * BAR_STEP}
              y={BASELINE - h}
              width={BAR_W}
              height={h}
              rx="1.5"
              fill={ACCENT}
              opacity="0.85"
            />
          ))}
          <line x1="76" y1={BASELINE} x2="248" y2={BASELINE} stroke={HAIR} />
        </g>
      </g>

      {/* cursor — arrives after the pulse, hovers the flagged device (half size) */}
      <g className="swt-cursor">
        <path
          d="M0 0 L0 15 L4.2 10.8 L7 16.5 L9.4 15.4 L6.6 9.7 L12 9.4 Z"
          transform="scale(0.5)"
          fill={STROKE}
          stroke={PAPER}
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}
