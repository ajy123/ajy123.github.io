// The audience role, in one place. Both CursorChat (which stamps it onto the
// captured context and branches the system prompt on it) and askContext (which
// picks the home page's chip set from it) need this read, and keeping two
// copies in sync is exactly the drift this module exists to prevent.
//
// The role is link-driven only — `?audience=` on a shared URL. There is no
// in-page picker: the "here for hiring / exploring" row was removed, so nothing
// but a link ever sets this.
import { trackAudienceRole } from "./analytics";

export const AUDIENCE_PRESETS = {
  recruiter: "recruiter",
  "product-design": "product design",
} as const;

export type AudienceRole = (typeof AUDIENCE_PRESETS)[keyof typeof AUDIENCE_PRESETS];

const AUDIENCE_ROLE_KEY = "ask-audience-role";
const AUDIENCE_ROLE_LOGGED_KEY = "ask-audience-role-logged";

function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
}

/** The first role seen this session is the "intent" signal and must never be
 * overwritten by a later page's read; this flag is the one-shot gate. */
function markFirstTouchLoggedOnce(role: AudienceRole): void {
  if (sessionGet(AUDIENCE_ROLE_LOGGED_KEY) === "1") return;
  sessionSet(AUDIENCE_ROLE_LOGGED_KEY, "1");
  trackAudienceRole(role, { trigger: "first_touch", switchCount: 0 });
}

export function getAudienceRole(): AudienceRole | undefined {
  if (typeof window === "undefined") return undefined;

  const audience = new URLSearchParams(window.location.search)
    .get("audience")
    ?.trim()
    .toLowerCase();

  if (audience) {
    const role = AUDIENCE_PRESETS[audience as keyof typeof AUDIENCE_PRESETS];
    if (role) {
      // Persist so the role outlives the param. Without this a recruiter link
      // to `/?audience=recruiter` loses its role the moment the reader clicks
      // through to /deeli/, which carries no param of its own.
      sessionSet(AUDIENCE_ROLE_KEY, audience);
      markFirstTouchLoggedOnce(role);
    }
    return role;
  }

  const stored = sessionGet(AUDIENCE_ROLE_KEY)?.trim().toLowerCase();
  if (!stored) return undefined;
  return AUDIENCE_PRESETS[stored as keyof typeof AUDIENCE_PRESETS];
}
