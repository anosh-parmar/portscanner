/**
 * scanner.ts — Pure type definitions and utility functions.
 *
 * The scanning logic is NO LONGER here. Scanning is done by the
 * Django Python backend at http://localhost:8000/api/.
 *
 * This file only provides:
 *   - TypeScript interfaces used by the frontend components
 *   - Pure utility functions (summarize, formatDuration, etc.)
 */

export type PortStatus = "open" | "closed" | "filtered";

export interface PortResult {
  port: number;
  status: PortStatus;
  service: string;
  version: string;
}

export interface ScanOptions {
  target: string;
  startPort: number;
  endPort: number;
  scanType: "TCP" | "UDP";
  resolveDomain: boolean;
  detectServices: boolean;
  verbose: boolean;
  timeout?: number;
}

export interface ScanRecord {
  id: string;
  target: string;
  ip: string;
  scanType: string;
  startPort: number;
  endPort: number;
  startedAt: string;
  durationSeconds: number;
  results: PortResult[];
  logs: LogEntry[];
  status: "starting" | "scanning" | "completed" | "cancelled" | "error";
  error?: string;
}

export interface LogEntry {
  time: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Utility functions (these are pure — no side effects)
// ---------------------------------------------------------------------------

export function summarize(results: PortResult[]) {
  const open = results.filter((r) => r.status === "open").length;
  const closed = results.filter((r) => r.status === "closed").length;
  const filtered = results.filter((r) => r.status === "filtered").length;
  return { open, closed, filtered, total: results.length };
}

export function formatDuration(seconds: number): string {
  if (seconds == null || isNaN(seconds)) return "--:--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function clockNow(): string {
  return new Date().toTimeString().slice(0, 8);
}
