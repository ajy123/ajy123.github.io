import { useEffect, useRef, useState } from "react";
import {
  isEngineReady,
  isWebGPUAvailable,
  onInitProgress,
  type InitProgressReport,
} from "../llmEngine";

const FLUSH_MS = 300;

type ReportLike = Partial<InitProgressReport> & {
  text?: string;
  progress?: number;
};

export type EngineTelemetry = {
  progress: number;
  ready: boolean;
  lines: string[];
  webgpu: boolean;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function truncate(text: string, max = 48) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function parseInitReport(report: ReportLike): string {
  try {
    const text = typeof report.text === "string" ? report.text : "";
    const progress =
      typeof report.progress === "number" ? clamp01(report.progress) : 0;
    const shard = text.match(/cache\[(\d+)\/(\d+)\]/i);
    const fetched = text.match(/(\d+(?:\.\d+)?)\s*MB fetched/i);
    const percent = text.match(/(\d+)% completed/i);
    const elapsed = text.match(/(\d+)\s*secs elapsed/i);
    const parts: string[] = [];

    if (shard) parts.push(`shard ${shard[1]}/${shard[2]}`);
    if (fetched) parts.push(`${fetched[1]}MB`);
    if (percent) parts.push(`${percent[1]}%`);
    if (elapsed) parts.push(`${elapsed[1]}s`);

    if (parts.length > 0) return parts.join(" · ");
    if (text.trim()) return truncate(text);
    return `fetching model — ${Math.round(progress * 100)}%`;
  } catch {
    return "fetching model";
  }
}

export function useEngineTelemetry(
  enabled: boolean,
  lineCap = 5,
): EngineTelemetry {
  const webgpu = isWebGPUAvailable();
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(() => isEngineReady());
  const [lines, setLines] = useState<string[]>(() =>
    webgpu ? [] : ["no local model on this device — the rest works fine"],
  );
  const ringRef = useRef<string[]>([]);
  const lastFlushRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !webgpu) return;

    const flush = () => {
      flushTimerRef.current = null;
      lastFlushRef.current = performance.now();
      setLines([...ringRef.current]);
    };

    const enqueueLine = (line: string) => {
      const last = ringRef.current[ringRef.current.length - 1];
      if (line === last) return;

      ringRef.current = [...ringRef.current, line].slice(-lineCap);
      const elapsed = performance.now() - lastFlushRef.current;
      if (elapsed >= FLUSH_MS) {
        flush();
        return;
      }

      if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(flush, FLUSH_MS - elapsed);
      }
    };

    const unsubscribe = onInitProgress((report) => {
      setProgress(clamp01(report.progress));
      setReady(isEngineReady());
      enqueueLine(parseInitReport(report));
    });

    return () => {
      unsubscribe();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [enabled, lineCap, webgpu]);

  useEffect(() => {
    if (!enabled || !webgpu || ready) return;

    const interval = window.setInterval(() => {
      setReady(isEngineReady());
    }, 500);

    return () => window.clearInterval(interval);
  }, [enabled, ready, webgpu]);

  useEffect(() => {
    if (webgpu) return;
    setLines(["no local model on this device — the rest works fine"]);
  }, [webgpu]);

  return { progress, ready, lines, webgpu };
}
