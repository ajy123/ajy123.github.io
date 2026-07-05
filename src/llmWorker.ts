// Web Worker host for the WebLLM engine. Keeps model inference off the main
// thread so the page stays responsive while tokens generate.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
