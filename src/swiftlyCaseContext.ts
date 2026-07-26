// Case-study grounding for the cursor-chat model on /swiftly/. Injected after
// SITE_CONTEXT (see buildMessages in CursorChat.tsx) so chat answers on the
// case-study page stay grounded in the Swiftly project's real facts, not just
// whatever text happens to be under the cursor.
//
// Hard budget: <= 3500 characters for the SWIFTLY_CASE_CONTEXT string value.
// The worker caps the whole request at 24,000 chars shared with SITE_CONTEXT
// (~1.5k), zone contextText (<=2200), and 40-message history — this digest
// must leave room for all of that.
//
// Source of truth: the deck-verified merged case-study draft. Every claim
// below traces to a deck slide — never invent a number not listed here.
// Team is listed by role only; do not add names not already public.
export const SWIFTLY_CASE_CONTEXT: string = [
  `Swiftly case study — grounding facts (published copy is authoritative; never invent a number not listed here):`,
  `- Product: a 0-to-1 device-status monitoring dashboard for Swiftly, a transit data platform. Role: product designer, cross-functional team of 5 (PM, TPM, eng manager, engineer). Timeline: May-June 2022.`,
  `- Problem: transit agencies had no reliable way to see which in-service vehicle devices were failing. IT depended on a daily paper maintenance report bus operators filled out by hand, spread across multiple platforms. Many small/medium agencies had no formal report at all — outages traveled by word of mouth. Swiftly's Client Success team fielded almost 40% of their time on device-issue inbound. Investigating a single device issue took 30+ hours.`,
  `- User framing (verbatim project quote): "As an IT at Capmetro, I want to feel confident that I know which in-service vehicle devices require my attention so that we can troubleshoot quickly without interrupting services and have better data for future prediction."`,
  `- Findings that changed direction: mapping how device data traveled through an agency surfaced two constraints — (1) agency size varies widely, many run no formal reporting process at all; (2) back-end diagnostic depth is limited, the team only knew a device had failed, not why. Together these pushed the design toward a real-time, triage-first status view rather than "a better report."`,
  `- Thesis: if IT can see device status transparently in one place, they will investigate and troubleshoot with more confidence, and stop routing that work through Client Success.`,
  `- Shipped decisions: (1) one live view replacing the daily paper report; (2) triage-first information hierarchy — verbatim rationale: "We considered the common F-shaped reading pattern for English-speaking users. The first column prioritizes task triage, with the vehicle's in-service status being the most critical element."; (3) a color legend over icon-only status, weighed against visual complexity for a fast-scanning ops audience; (4) hover to monitor, click to investigate — framed as "Should we prioritize monitoring or investigating?", hover won so glanceable status stays the default and going deeper is optional.`,
  `- Impact: device investigation time fell from 30+ hours to 12-24 hours. Device-issue inbound to the internal team dropped 20%. These are two DIFFERENT cross-functional measurements: investigation time is IT's end-to-end metric per device issue; the inbound drop is Client Success's volume metric. The deck also phrases the first as "investigation time reduced by 20%" — that is the conservative bound of the same 30+ to ~24-hour improvement, not the inbound number. The internal goal of under 12 hours was NOT met — an honest miss that taught the team a single investigation-time target measured the wrong thing, since agencies triage differently. Beyond metrics: improved organizational scalability, and the team credited the project with shifting its working culture from engineering-led to design-led.`,
  `- Learnings: measure the right thing (a one-size-fits-all target hid real variation between agencies); look beyond the existing interface, invest in micro-interactions, hold the design to WCAG accessibility standards; always ask what the consequence is of not solving something right now.`,
  `- Never say "user-tested" — this project was validated through crit and internal design review, not usability testing with end users.`,
].join("\n");

if (import.meta.env.DEV && SWIFTLY_CASE_CONTEXT.length > 3500) {
  // eslint-disable-next-line no-console
  console.error(
    `SWIFTLY_CASE_CONTEXT is ${SWIFTLY_CASE_CONTEXT.length} chars, over the 3500-char budget. Trim before shipping.`,
  );
}
