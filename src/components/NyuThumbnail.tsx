// Animated line-art thumbnail for the NYU work card. Redraws the real product
// as a small device screen and plays a lateral navigation: the cursor selects a
// work order in the queue and its unified record opens in the detail pane — the
// "one place for the whole ticket" beat from "NYU WorkLink."
//
// Product-design basics: the app chrome — top bar, queue nav, pane divider — is
// PERSISTENT. The queue pane is a narrow rail of compact tickets; the record
// fills the wider right pane and never covers the divider or top bar. The inner
// UI is scaled to 80% inside the full-size device frame (breathing room), while
// the frame stays put. Its own product character: a brisk 4.2s ticket cadence
// with a crisp ease-out snap, out of step with Swiftly's slower rhythm. One
// forest focal: the record's "Open" status. Selection is a neutral wash.
import { ACCENT, STROKE, PAPER, HAIR, FAINT, WASH, CURSOR_SCALE, GROUP_SCALE, CursorArrow } from "./thumbnailArt";

const CSS = `
.nyt-select{opacity:1}
.nyt-record{transform:translateX(0)}
.nyt-cursor{transform:translate(80px,114px)}
@keyframes nyt-cur{0%,16%{transform:translate(244px,168px);opacity:0}20%{opacity:1}30%{transform:translate(80px,114px)}82%{transform:translate(80px,114px);opacity:1}90%{opacity:0}100%{transform:translate(80px,114px);opacity:0}}
@keyframes nyt-sel{0%,26%{opacity:0}32%{opacity:1}86%{opacity:1}94%{opacity:0}100%{opacity:0}}
@keyframes nyt-rec{0%,32%{opacity:0;transform:translateX(14px);filter:blur(2px)}46%{opacity:1;transform:translateX(0);filter:blur(0)}86%{opacity:1;transform:translateX(0);filter:blur(0)}94%{opacity:0;filter:blur(2px)}100%{opacity:0}}
@keyframes nyt-fld{0%,37%{opacity:0;transform:translateY(4px)}51%{opacity:1;transform:translateY(0)}86%{opacity:1}94%{opacity:0}100%{opacity:0}}
@media (prefers-reduced-motion: no-preference){
  .work-media--thumbnail[data-playing="true"] .nyt-cursor{animation:nyt-cur 4.2s cubic-bezier(.6,0,.3,1) infinite}
  .work-media--thumbnail[data-playing="true"] .nyt-select{animation:nyt-sel 4.2s ease infinite}
  .work-media--thumbnail[data-playing="true"] .nyt-record{animation:nyt-rec 4.2s cubic-bezier(.16,1,.2,1) infinite}
  .work-media--thumbnail[data-playing="true"] .nyt-field{animation:nyt-fld 4.2s cubic-bezier(.16,1,.2,1) infinite}
}
`;

const QUEUE = [98, 116, 134];
const FIELDS = [
  { ly: 104, vy: 112, vh: 11, lw: 24, d: "0s" },
  { ly: 130, vy: 138, vh: 11, lw: 28, d: "0.09s" },
  { ly: 158, vy: 166, vh: 20, lw: 22, d: "0.18s" },
];

export function NyuThumbnail() {
  return (
    <svg
      viewBox="0 0 320 240"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Selecting a work order in the queue opens its unified record."
    >
      <style>{CSS}</style>
      <defs>
        <clipPath id="nyt-clip">
          <rect x="58" y="48" width="204" height="144" rx="9" />
        </clipPath>
      </defs>

      {/* device frame — same box as the Swiftly card, stays put */}
      <rect x="58" y="48" width="204" height="144" rx="9" fill={PAPER} stroke={HAIR} />

      <g clipPath="url(#nyt-clip)">
        {/* inner UI scaled to 80% inside the full-size frame */}
        <g transform={`translate(160 120) scale(${GROUP_SCALE}) translate(-160 -120)`}>
          {/* PERSISTENT chrome: top bar + narrow-queue divider */}
          <rect x="52" y="58" width="34" height="6" rx="3" fill={STROKE} />
          <line x1="40" y1="72" x2="280" y2="72" stroke={HAIR} />
          <line x1="110" y1="72" x2="110" y2="190" stroke={HAIR} />

          {/* left: narrow queue rail of compact tickets */}
          <rect x="48" y="84" width="22" height="4" rx="2" fill={FAINT} />
          {QUEUE.map((y) => (
            <g key={y}>
              <rect x="48" y={y} width="56" height="13" rx="3" fill="none" stroke={HAIR} />
              <circle cx="56" cy={y + 6.5} r="2" fill={FAINT} />
              <rect x="64" y={y + 4.5} width="30" height="4" rx="2" fill={FAINT} />
            </g>
          ))}
          {/* selected ticket — neutral wash, no side-stripe */}
          <g className="nyt-select">
            <rect x="47" y="115" width="58" height="15" rx="3" fill={WASH} />
            <circle cx="56" cy="122.5" r="2" fill={STROKE} />
            <rect x="64" y="120.5" width="30" height="4" rx="2" fill={STROKE} />
          </g>

          {/* right content pane: empty detail (faint), under the record */}
          <rect x="156" y="120" width="76" height="5" rx="2.5" fill={HAIR} />
          <rect x="166" y="132" width="56" height="5" rx="2.5" fill={HAIR} />

          {/* right content pane: unified record — opens without covering chrome */}
          <g className="nyt-record">
            <rect x="111" y="73" width="169" height="117" fill={PAPER} />
            <rect x="123" y="86" width="48" height="6" rx="3" fill={STROKE} />
            {/* the one forest focal: "Open" status */}
            <rect x="238" y="84" width="36" height="12" rx="6" fill={ACCENT} />
            <circle cx="246" cy="90" r="2" fill={PAPER} />
            <rect x="251" y="87.5" width="16" height="5" rx="2.5" fill={PAPER} />
            {/* fields — settle in, staggered */}
            {FIELDS.map((f) => (
              <g className="nyt-field" style={{ animationDelay: f.d }} key={f.ly}>
                <rect x="123" y={f.ly} width={f.lw} height="5" rx="2.5" fill={FAINT} />
                <rect x="123" y={f.vy} width="140" height={f.vh} rx="3" fill="none" stroke={HAIR} />
              </g>
            ))}
          </g>

          {/* cursor — hovers the selected ticket; divides by the group scale so
              it nets the same on-screen half size as the Swiftly cursor */}
          <g className="nyt-cursor">
            <CursorArrow scale={CURSOR_SCALE / GROUP_SCALE} />
          </g>
        </g>
      </g>
    </svg>
  );
}
