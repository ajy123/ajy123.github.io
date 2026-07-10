import { type CSSProperties } from "react";
import type { KeyDials } from "./SiteLogo";

/**
 * Direction A — "The Key". A paper keyboard keycap, drawn in the site's own
 * keycap language (see .intro-key--paper / .cursor-chat-send in index.css and
 * their dark twins): warm paper face, hairline, inset top highlight. NO
 * --accent — the intro keycap owns the orange; the logo key is paper so that
 * moment stays special.
 *
 * Two layers: a STATIC edge/shadow wall + a moving cap. Only `transform`
 * animates on the cap. Press mechanics live in CSS (.site-logo:active …) so a
 * real key travel plays for pointer, touch AND native keyboard activation
 * (Enter/Space) with no JS key handler: asymmetric timing (fast press-down,
 * springy release) comes from the :active transition overriding the base one.
 *
 * Single-page site → the logo need not link home, so the toggle-vs-home
 * collision that dogs most logo-toggles does not apply here.
 *
 * Art only; the wrapping <button> in SiteLogo carries all switch semantics.
 */
export function KeyLogo({ dials }: { dials: KeyDials }) {
  const style = {
    // --keylogo-travel is provided once by the wrapping .site-logo button
    // (SiteLogo), so it is intentionally not redeclared here.
    "--keylogo-press-ms": `${dials.pressMs}ms`,
    "--keylogo-release-ms": `${dials.releaseMs}ms`,
    "--keylogo-radius": `${dials.radius}px`,
    "--keylogo-legend": `${dials.legend}px`,
  } as CSSProperties;

  return (
    <span className="keylogo" style={style} aria-hidden="true">
      <span className="keylogo-edge" />
      <span className="keylogo-cap">
        <span className="keylogo-face">
          {/* Legend top-left: mechanical-keyboard convention — reads "keycap". */}
          <span className="keylogo-legend">JY</span>
        </span>
      </span>
    </span>
  );
}
