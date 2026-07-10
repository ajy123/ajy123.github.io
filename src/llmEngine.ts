// In-browser LLM via WebLLM (WebGPU). No backend, no API key: the model runs
// locally on the visitor's device. The engine loads once, either from landing
// preload or first chat send, and is reused across every cursor-chat thread.
import type {
  WebWorkerMLCEngine,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

// Small model chosen for reliable first load: ~0.35GB, fewer shards to fetch,
// so a flaky download is less likely to fail. Swap up to
// "Llama-3.2-1B-Instruct-q4f16_1-MLC" (~0.7GB) or "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
// if answer quality matters more than load time.
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const MODEL_DOWNLOAD_MB = 350;

// Re-init this many times on a failed load. Each retry resumes from shards
// already cached in the browser, so a dropped connection self-heals.
const MAX_INIT_RETRIES = 3;

export type { InitProgressReport };

let enginePromise: Promise<WebWorkerMLCEngine> | null = null;
let ready = false;

// Latest init-progress report, fanned out to any subscribed UI. The engine only
// accepts a single initProgressCallback at creation, so we broadcast it here.
const progressListeners = new Set<(report: InitProgressReport) => void>();
let lastProgress: InitProgressReport | null = null;

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function isEngineReady(): boolean {
  return ready;
}

export function preloadEngine(): Promise<void> {
  if (!isWebGPUAvailable()) {
    return Promise.reject(new Error("WebGPU is not available"));
  }

  if (import.meta.env.DEV) {
    const testResponse = (
      window as unknown as { __cursorChatTestResponse?: unknown }
    ).__cursorChatTestResponse;
    // Deterministic browser verification without fetching the model. The
    // direct DEV guard lets Rollup remove this branch from production.
    if (typeof testResponse === "string") {
      if (ready) return Promise.resolve();
      const progress = {
        progress: 0.42,
        text: "loading deterministic test model",
        timeElapsed: 0,
      } as InitProgressReport;
      lastProgress = progress;
      progressListeners.forEach((fn) => fn(progress));
      return new Promise((resolve) => {
        window.setTimeout(() => {
          ready = true;
          (
            window as unknown as { __cursorChatTestReadyAt?: number }
          ).__cursorChatTestReadyAt = performance.now();
          const complete = { ...progress, progress: 1, text: "test model ready" };
          lastProgress = complete;
          progressListeners.forEach((fn) => fn(complete));
          resolve();
        }, 400);
      });
    }
  }

  // Resolve only after getEngine has completed initialization and marked the
  // shared engine ready. Callers that fire-and-forget this preload own handling
  // its rejection because the chat's Retry path surfaces load failures.
  return getEngine().then(() => undefined);
}

export function onInitProgress(fn: (report: InitProgressReport) => void): () => void {
  progressListeners.add(fn);
  if (lastProgress) fn(lastProgress);
  return () => progressListeners.delete(fn);
}

// Dev-only test hook: lets verification scripts (CDP, no WebGPU in headless
// Chrome) drive the same progress fan-out the real engine warmup uses.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__devFireInitProgress = (
    report: InitProgressReport,
    markReady?: boolean,
  ) => {
    lastProgress = report;
    if (markReady) ready = true;
    progressListeners.forEach((fn) => fn(report));
  };
}

// One init attempt: fresh worker, dynamic-imported runtime, races against a
// worker-error rejection so a dead worker fails loud instead of hanging.
async function createEngineOnce(): Promise<WebWorkerMLCEngine> {
  const worker = new Worker(new URL("./llmWorker.ts", import.meta.url), {
    type: "module",
  });

  const workerFailed = new Promise<never>((_, reject) => {
    worker.onerror = (event) => {
      reject(new Error(`Worker failed: ${event.message || "load error"}`));
    };
  });

  // Dynamic import keeps the ~6MB WebLLM runtime out of the main bundle until
  // the app intentionally boots the engine.
  const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");

  try {
    return await Promise.race([
      CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (report) => {
          lastProgress = report;
          progressListeners.forEach((fn) => fn(report));
        },
      }),
      workerFailed,
    ]);
  } catch (error) {
    worker.terminate(); // drop the dead worker before the next attempt
    throw error;
  }
}

function getEngine(): Promise<WebWorkerMLCEngine> {
  if (!enginePromise) {
    console.info("[cursor-chat] booting engine", MODEL_ID);

    enginePromise = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_INIT_RETRIES; attempt++) {
        try {
          const engine = await createEngineOnce();
          ready = true;
          console.info("[cursor-chat] engine ready");
          return engine;
        } catch (error) {
          lastError = error;
          console.warn(
            `[cursor-chat] engine init attempt ${attempt}/${MAX_INIT_RETRIES} failed`,
            error,
          );
        }
      }
      console.error("[cursor-chat] engine init failed", lastError);
      enginePromise = null; // allow a later manual Retry to start fresh
      throw lastError;
    })();
  }

  return enginePromise;
}

// Serialize generations: the engine handles one request at a time, so two
// threads sending near-simultaneously must queue, not interleave.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

class AbortError extends DOMException {
  constructor() {
    super("Generation aborted", "AbortError");
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// Loads the engine if needed (progress flows through onInitProgress), then
// streams a completion. onToken receives the full accumulated text each step.
export function streamChat(
  messages: ChatCompletionMessageParam[],
  onToken: (full: string) => void,
  signal: AbortSignal,
): Promise<string> {
  if (import.meta.env.DEV) {
    const testResponse = (
      window as unknown as { __cursorChatTestResponse?: unknown }
    ).__cursorChatTestResponse;
    if (typeof testResponse === "string") {
      return enqueue(async () => {
        let full = "";
        for (const part of testResponse.split(/(\s+)/)) {
          if (signal.aborted) throw new AbortError();
          full += part;
          onToken(full);
          await new Promise((resolve) => window.setTimeout(resolve, 12));
        }
        return full;
      });
    }
  }

  return enqueue(async () => {
    if (signal.aborted) throw new AbortError();

    const engine = await getEngine();
    if (signal.aborted) throw new AbortError();

    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.6,
    });

    let full = "";
    for await (const chunk of chunks) {
      if (signal.aborted) {
        await engine.interruptGenerate();
        throw new AbortError();
      }
      full += chunk.choices[0]?.delta?.content ?? "";
      onToken(full);
    }

    return full;
  });
}
