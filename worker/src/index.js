// Cloudflare Worker: OpenAI chat proxy for the portfolio cursor chat.
// Holds the API key server-side (set via `wrangler secret put OPENAI_API_KEY`
// or dashboard → Settings → Variables and Secrets), locks CORS to the site,
// validates input, and applies a light per-IP rate limit.

const ALLOWED_ORIGINS = ["https://ajy123.github.io"];
// Vite dev/preview servers during local development, including LAN device
// testing (the dev scripts bind --host 0.0.0.0).
const DEV_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Complexity-routed models. The client sends a tier hint; anything but a
// known tier name falls back to "quick", so the endpoint never trusts a raw
// model string and requests from older cached bundles (no tier field) keep
// working.
const TIERS = {
  quick: { model: "gpt-4o-mini", maxTokens: 512 },
  deep: { model: "gpt-4o", maxTokens: 1024 },
};
const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 24000;
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

// The Origin check is not authentication (curl can spoof it), so pin the
// system prompt: only the site's own persona may pass, which stops the
// endpoint being scripted as a general-purpose proxy with a custom persona.
// MUST stay byte-identical to CHAT_SYSTEM_PREFIX in src/CursorChat.tsx — a
// DEV assertion in the client's buildMessages() catches drift on that side.
const SYSTEM_PREFIX =
  "You are a concise assistant embedded directly in Joanna Yen's portfolio website.";

// Sliding window per IP. Per-isolate memory, so not a global guarantee, but
// enough to blunt a curl loop; the hard backstop is the OpenAI spend limit.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const hits = new Map();

function originAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN.test(origin);
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function jsonError(status, error, origin) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json" },
  });
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length > MAX_MESSAGES) return false;
  let totalChars = 0;
  for (const [index, message] of messages.entries()) {
    if (typeof message?.content !== "string") return false;
    if (!ALLOWED_ROLES.has(message?.role)) return false;
    // System messages: first position only, site persona only.
    if (
      message.role === "system" &&
      (index !== 0 || !message.content.startsWith(SYSTEM_PREFIX))
    ) {
      return false;
    }
    totalChars += message.content.length;
  }
  return totalChars <= MAX_TOTAL_CHARS;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") ?? "";

    if (request.method === "OPTIONS") {
      if (!originAllowed(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!originAllowed(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (request.method !== "POST") {
      // With CORS headers so a browser caller sees the 405, not an opaque
      // CORS failure.
      return new Response("POST only", {
        status: 405,
        headers: corsHeaders(origin),
      });
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const now = Date.now();
    // Bound the map: sweep idle IPs occasionally so wide scans can't grow
    // isolate memory for the isolate's lifetime.
    if (hits.size > 1000) {
      for (const [key, times] of hits) {
        if (now - times[times.length - 1] >= RATE_WINDOW_MS) hits.delete(key);
      }
    }
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      return jsonError(429, "rate_limited", origin);
    }
    recent.push(now);
    hits.set(ip, recent);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "invalid_json", origin);
    }
    if (!validMessages(body?.messages)) {
      return jsonError(400, "invalid_messages", origin);
    }

    // Explicit comparison, not TIERS[body.tier]: an object lookup would let
    // keys like "constructor" resolve truthy and reach upstream malformed.
    const tier = body?.tier === "deep" ? TIERS.deep : TIERS.quick;

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: tier.model,
        messages: body.messages,
        stream: true,
        temperature: 0.1,
        max_tokens: tier.maxTokens,
      }),
    });

    if (!upstream.ok) {
      console.error("openai upstream error", upstream.status, await upstream.text());
      return jsonError(502, `upstream_failed_${upstream.status}`, origin);
    }

    // Pipe OpenAI's SSE stream straight through to the browser.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      },
    });
  },
};
