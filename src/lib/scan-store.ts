/**
 * scan-store.ts — Real scan state management connected to the Django backend.
 *
 * Architecture:
 *   Frontend  →  POST /api/scan/start/  →  Django backend
 *   Frontend  ←  GET  /api/scan/:id/stream/  (SSE)  ←  Django backend
 *   Frontend  →  POST /api/scan/:id/cancel/  →  Django backend
 *
 * NO fake timers. NO Math.random(). NO hardcoded results.
 * All data comes from the Python scanner via SSE events.
 */

import { useSyncExternalStore } from "react";
import {
  clockNow,
  type LogEntry,
  type PortResult,
  type ScanOptions,
  type ScanRecord,
} from "./scanner";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Django backend URL — adjust if running on a different port */
const API_BASE =
  typeof window !== "undefined"
    ? (import.meta.env["VITE_API_URL"] ?? "http://localhost:8000/api")
    : "http://localhost:8000/api";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ScannerState {
  running: boolean;
  cancelling: boolean;
  progress: number; // 0-100
  progressScanned: number;
  progressTotal: number;
  current: ScanRecord | null;
  logs: LogEntry[];
  history: ScanRecord[];
  backendError: string | null;
  settings: {
    defaultStart: number;
    defaultEnd: number;
    timeout: number;
    resolveDomain: boolean;
    detectServices: boolean;
    verbose: boolean;
  };
}

let state: ScannerState = {
  running: false,
  cancelling: false,
  progress: 0,
  progressScanned: 0,
  progressTotal: 0,
  current: null,
  logs: [],
  history: [],
  backendError: null,
  settings: {
    defaultStart: 1,
    defaultEnd: 1024,
    timeout: 0.5,
    resolveDomain: true,
    detectServices: true,
    verbose: false,
  },
};

const listeners = new Set<() => void>();

function set(patch: Partial<ScannerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function log(message: string) {
  set({ logs: [...state.logs, { time: clockNow(), message }].slice(-100) });
}

// ---------------------------------------------------------------------------
// Active SSE connection management
// ---------------------------------------------------------------------------

let activeScanId: string | null = null;
let activeEventSource: EventSource | null = null;

function closeEventSource() {
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
}

// ---------------------------------------------------------------------------
// SSE event handlers
// ---------------------------------------------------------------------------

function handleSseEvent(scanId: string, event: MessageEvent) {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(event.data as string) as Record<string, unknown>;
  } catch {
    return;
  }

  const type = data["type"] as string;

  switch (type) {
    case "connected": {
      log(`Connected to scan stream (id: ${scanId.slice(0, 8)}...)`);
      break;
    }

    case "info": {
      const ip = data["ip"] as string;
      const target = data["target"] as string;
      log(`Resolved ${target} → ${ip}`);
      // Initialise the current scan record
      const newRecord: ScanRecord = {
        id: scanId,
        target,
        ip,
        scanType: "TCP",
        startPort: state.current?.startPort ?? 1,
        endPort: state.current?.endPort ?? 1024,
        startedAt: new Date().toISOString(),
        durationSeconds: 0,
        results: [],
        logs: state.logs,
        status: "scanning",
      };
      set({ current: newRecord, running: true });
      break;
    }

    case "progress": {
      const scanned = (data["scanned"] as number) ?? 0;
      const total = (data["total"] as number) ?? 1;
      const pct = total > 0 ? Math.min(100, (scanned / total) * 100) : 0;
      set({ progress: pct, progressScanned: scanned, progressTotal: total });
      break;
    }

    case "result": {
      // A real open port discovered by the Python scanner
      const port = data["port"] as number;
      const service = (data["service"] as string) ?? "unknown";
      if (state.settings.verbose) {
        log(`Port ${port} OPEN (${service})`);
      }
      const portResult: PortResult = {
        port,
        status: "open",
        service,
        version: "-",
      };
      const updatedResults = [...(state.current?.results ?? []), portResult].sort(
        (a, b) => a.port - b.port,
      );
      if (state.current) {
        set({
          current: {
            ...state.current,
            results: updatedResults,
            logs: state.logs,
          },
        });
      }
      break;
    }

    case "complete": {
      const open = (data["open"] as number) ?? 0;
      const closed = (data["closed"] as number) ?? 0;
      const total = (data["total"] as number) ?? 0;
      const duration = (data["duration"] as number) ?? 0;
      log(
        `Scan completed — ${open} open, ${closed} closed, ${total} total ports. Duration: ${duration.toFixed(1)}s`,
      );
      if (state.current) {
        const completed: ScanRecord = {
          ...state.current,
          durationSeconds: duration,
          logs: state.logs,
          status: "completed",
        };
        set({
          running: false,
          cancelling: false,
          progress: 100,
          current: completed,
          history: [completed, ...state.history],
        });
      } else {
        set({ running: false, cancelling: false, progress: 100 });
      }
      closeEventSource();
      break;
    }

    case "cancelled": {
      log("Scan cancelled.");
      if (state.current) {
        const cancelled: ScanRecord = {
          ...state.current,
          durationSeconds:
            (Date.now() - new Date(state.current.startedAt).getTime()) / 1000,
          logs: state.logs,
          status: "cancelled",
        };
        set({
          running: false,
          cancelling: false,
          current: cancelled,
          history: [cancelled, ...state.history],
        });
      } else {
        set({ running: false, cancelling: false });
      }
      closeEventSource();
      break;
    }

    case "error": {
      const message = (data["message"] as string) ?? "Unknown scanner error";
      log(`Error: ${message}`);
      if (state.current) {
        const errRecord: ScanRecord = {
          ...state.current,
          durationSeconds:
            (Date.now() - new Date(state.current.startedAt).getTime()) / 1000,
          logs: state.logs,
          status: "error",
          error: message,
        };
        set({
          running: false,
          cancelling: false,
          current: errRecord,
          backendError: message,
        });
      } else {
        set({ running: false, cancelling: false, backendError: message });
      }
      closeEventSource();
      break;
    }

    case "done": {
      // Sentinel from server — stream ended
      closeEventSource();
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const scanStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  get: () => state,

  updateSettings(patch: Partial<ScannerState["settings"]>) {
    set({ settings: { ...state.settings, ...patch } });
  },

  async start(options: ScanOptions) {
    if (state.running) return;

    // Reset state
    set({
      running: true,
      cancelling: false,
      progress: 0,
      progressScanned: 0,
      progressTotal: options.endPort - options.startPort + 1,
      backendError: null,
      logs: [],
      current: {
        id: "pending",
        target: options.target,
        ip: "...",
        scanType: options.scanType,
        startPort: options.startPort,
        endPort: options.endPort,
        startedAt: new Date().toISOString(),
        durationSeconds: 0,
        results: [],
        logs: [],
        status: "starting",
      },
    });

    log(`Starting ${options.scanType} scan of ${options.target} (ports ${options.startPort}-${options.endPort})...`);

    // 1) Call Django API to start the scan
    let scanId: string;
    try {
      const res = await fetch(`${API_BASE}/scan/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: options.target,
          startPort: options.startPort,
          endPort: options.endPort,
          timeout: state.settings.timeout,
        }),
      });

      const json = (await res.json()) as { scanId?: string; error?: string };

      if (!res.ok || !json.scanId) {
        const errMsg = json.error ?? `HTTP ${res.status}`;
        log(`Backend error: ${errMsg}`);
        set({ running: false, backendError: errMsg });
        return;
      }

      scanId = json.scanId;
      activeScanId = scanId;
      log(`Scan started (id: ${scanId.slice(0, 8)}...)`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Cannot connect to backend. Is the Django server running on port 8000?";
      log(`Connection error: ${message}`);
      set({ running: false, backendError: message });
      return;
    }

    // 2) Open SSE stream for real-time events
    closeEventSource(); // close any stale stream
    const es = new EventSource(`${API_BASE}/scan/${scanId}/stream/`);
    activeEventSource = es;

    es.onmessage = (e) => handleSseEvent(scanId, e);

    es.onerror = () => {
      // If scan is done the server closes the connection — this is normal
      if (state.running) {
        log("SSE connection lost. Scan may still be running on the server.");
        set({ running: false, backendError: "Lost connection to backend" });
      }
      closeEventSource();
    };
  },

  async cancel() {
    if (!activeScanId || !state.running) return;
    set({ cancelling: true });
    log("Requesting scan cancellation...");
    try {
      await fetch(`${API_BASE}/scan/${activeScanId}/cancel/`, { method: "POST" });
    } catch {
      log("Failed to send cancel request — closing stream locally.");
      set({ running: false, cancelling: false });
      closeEventSource();
    }
  },

  clearBackendError() {
    set({ backendError: null });
  },
};

export function useScanStore(): ScannerState {
  return useSyncExternalStore(scanStore.subscribe, scanStore.get, scanStore.get);
}
