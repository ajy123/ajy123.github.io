// Cursor-chat backend client. Streams completions from the Cloudflare Worker
// proxy (which holds the OpenAI key); replaces the old in-browser WebLLM
// engine, so there is no model download, consent gate, or WebGPU requirement.

const CHAT_ENDPOINT =
  import.meta.env.VITE_CHAT_ENDPOINT ??
  "https://worker-portfolio.lty207.workers.dev/";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// Carries the HTTP status so the UI can give status-specific guidance
// (a 429 should say "wait", not "retry now").
export class ChatRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

class AbortError extends DOMException {
  constructor() {
    super("Generation aborted", "AbortError");
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
  error?: { message?: string };
};

// Streams a completion. onToken receives the full accumulated text each step.
export function streamChat(
  messages: ChatMessage[],
  onToken: (full: string) => void,
  signal: AbortSignal,
): Promise<string> {
  if (import.meta.env.DEV) {
    const testResponse = (
      window as unknown as { __cursorChatTestResponse?: unknown }
    ).__cursorChatTestResponse;
    // Deterministic browser verification without hitting the worker. The
    // direct DEV guard lets Rollup remove this branch from production.
    if (typeof testResponse === "string") {
      return (async () => {
        let full = "";
        for (const part of testResponse.split(/(\s+)/)) {
          if (signal.aborted) throw new AbortError();
          full += part;
          onToken(full);
          await new Promise((resolve) => window.setTimeout(resolve, 12));
        }
        return full;
      })();
    }
  }

  return (async () => {
    if (signal.aborted) throw new AbortError();

    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new ChatRequestError(
        `Chat request failed: ${response.status}`,
        response.status,
      );
    }

    // OpenAI-style SSE: lines of `data: {json}` ending with `data: [DONE]`.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    const consumeLine = (line: string) => {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!data || !line.startsWith("data:") || data === "[DONE]") return;
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        return; // partial or non-JSON keepalive line
      }
      // OpenAI can deliver failures as an in-stream error event after a 200
      // (e.g. mid-stream upstream errors) — surface them instead of quietly
      // finishing with whatever text arrived.
      if (chunk.error) {
        throw new ChatRequestError(
          chunk.error.message ?? "Upstream error event in stream",
        );
      }
      full += chunk.choices?.[0]?.delta?.content ?? "";
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        const before = full.length;
        for (const line of lines) consumeLine(line);
        // Skip no-op notifications (keepalives, role-only deltas) so the UI
        // doesn't re-render for chunks that changed nothing.
        if (full.length > before) onToken(full);
      }
      // Flush: a stream cut mid-event can leave a final unterminated line.
      buffer += decoder.decode();
      if (buffer) consumeLine(buffer);
    } finally {
      reader.releaseLock();
    }

    // A 200 stream that produced no text (e.g. content-filter stop) is a
    // failure the visitor should see, not an empty "done" bubble.
    if (!full) {
      throw new ChatRequestError("Stream ended with no content");
    }

    return full;
  })();
}
