import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Radar,
  Play,
  Square,
  ListChecks,
  PieChart,
  Network,
  ScrollText,
  ClipboardList,
  AlertCircle,
  Wifi,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DashboardLayout, Panel } from "@/components/DashboardLayout";
import { ResultsTable } from "@/components/ResultsTable";
import { PortStatusChart, TopServices } from "@/components/PortStatusChart";
import { scanStore, useScanStore } from "@/lib/scan-store";
import { formatDuration, summarize } from "@/lib/scanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scan Dashboard | Python Port Scanner" },
      {
        name: "description",
        content:
          "Run TCP port scans against an IP or domain and review open, closed and filtered ports in a live dashboard.",
      },
      { property: "og:title", content: "Scan Dashboard | Python Port Scanner" },
      {
        property: "og:description",
        content:
          "Configure a target, port range and scan type, then review port status, services and logs.",
      },
    ],
  }),
  component: ScanPage,
});

const RANGES = [
  { label: "1 - 1024 (well-known)", start: 1, end: 1024 },
  { label: "1 - 10000", start: 1, end: 10000 },
  { label: "1 - 65535 (all)", start: 1, end: 65535 },
];

function ScanPage() {
  const { running, cancelling, progress, progressScanned, progressTotal, current, logs, settings, backendError } =
    useScanStore();
  const [target, setTarget] = useState("127.0.0.1");
  const [rangeIdx, setRangeIdx] = useState(0);
  const [scanType, setScanType] = useState<"TCP" | "UDP">("TCP");
  const [resolveDomain, setResolveDomain] = useState(settings.resolveDomain);
  const [detectServices, setDetectServices] = useState(settings.detectServices);
  const [verbose, setVerbose] = useState(settings.verbose);

  const results = current?.results ?? [];
  const s = summarize(results);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const range = RANGES[rangeIdx] ?? RANGES[0]!;
    if (!target.trim()) return;
    void scanStore.start({
      target: target.trim().slice(0, 253),
      startPort: range.start,
      endPort: range.end,
      scanType,
      resolveDomain,
      detectServices,
      verbose,
      timeout: settings.timeout,
    });
  };

  const handleCancel = () => {
    void scanStore.cancel();
  };

  const statusLabel = (() => {
    if (cancelling) return "Cancelling...";
    if (running) {
      if (current?.status === "starting") return "Starting scanner...";
      return "Scanning...";
    }
    if (current?.status === "cancelled") return "Cancelled";
    if (current?.status === "error") return "Error";
    return "Ready";
  })();

  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {/* Backend error banner */}
          {backendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Backend error</p>
                <p className="mt-1 text-xs opacity-80">{backendError}</p>
                <p className="mt-2 text-xs opacity-60">
                  Make sure the Django server is running:{" "}
                  <code className="rounded bg-red-500/20 px-1">
                    cd backend &amp;&amp; python manage.py runserver 8000
                  </code>
                </p>
                <button
                  onClick={() => scanStore.clearBackendError()}
                  className="mt-2 text-xs underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <Panel
            title="New Scan"
            description="Scan a target IP address or domain for open TCP ports"
            icon={Radar}
          >
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
                <label className="block text-sm">
                  <span className="mb-2 block text-muted-foreground">
                    Target (IP Address or Domain)
                  </span>
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    maxLength={253}
                    required
                    disabled={running}
                    className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-foreground outline-none focus:border-ring disabled:opacity-50"
                    placeholder="127.0.0.1 or example.com"
                    id="scan-target"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-2 block text-muted-foreground">Port Range</span>
                  <select
                    value={rangeIdx}
                    onChange={(e) => setRangeIdx(Number(e.target.value))}
                    disabled={running}
                    className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-foreground outline-none focus:border-ring disabled:opacity-50"
                    id="scan-port-range"
                  >
                    {RANGES.map((r, i) => (
                      <option key={r.label} value={i}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-2 block text-muted-foreground">Scan Type</span>
                  <select
                    value={scanType}
                    onChange={(e) => setScanType(e.target.value as "TCP" | "UDP")}
                    disabled={running}
                    className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-foreground outline-none focus:border-ring disabled:opacity-50"
                    id="scan-type"
                  >
                    <option value="TCP">TCP</option>
                    <option value="UDP">UDP (uses TCP sockets)</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Check
                  id="opt-resolve"
                  label="Resolve domain (if needed)"
                  checked={resolveDomain}
                  onChange={setResolveDomain}
                  disabled={running}
                />
                <Check
                  id="opt-services"
                  label="Detect services"
                  checked={detectServices}
                  onChange={setDetectServices}
                  disabled={running}
                />
                <Check
                  id="opt-verbose"
                  label="Enable verbose output"
                  checked={verbose}
                  onChange={(v) => {
                    setVerbose(v);
                    scanStore.updateSettings({ verbose: v });
                  }}
                  disabled={running}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={running}
                  id="btn-start-scan"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  <Play className="h-4 w-4" />
                  {running ? statusLabel : "Start Scan"}
                </button>

                {running && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    id="btn-stop-scan"
                    className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <Square className="h-4 w-4" />
                    {cancelling ? "Stopping..." : "Stop Scan"}
                  </button>
                )}
              </div>

              {running && (
                <div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {cancelling
                      ? "Cancelling scan..."
                      : progressTotal > 0
                        ? `Probing ports... ${progressScanned.toLocaleString()} / ${progressTotal.toLocaleString()} (${Math.round(progress)}%)`
                        : "Starting scanner..."}
                  </p>
                </div>
              )}

              {current?.status === "error" && current.error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Scan failed: {current.error}</span>
                </div>
              )}
            </form>
          </Panel>

          <Panel
            title="Scan Results"
            icon={ListChecks}
            action={
              current && current.ip !== "..." && (
                <p className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  Target: {current.target} ({current.ip}) &nbsp;|&nbsp; Scan Time:{" "}
                  {formatDuration(current.durationSeconds)}
                  {current.status === "scanning" && (
                    <span className="ml-2 inline-flex items-center gap-1 text-primary">
                      <Wifi className="h-3 w-3 animate-pulse" />
                      Live
                    </span>
                  )}
                </p>
              )
            }
          >
            <ResultsTable results={results} scanning={running} />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Scan Summary" icon={ClipboardList}>
            <dl className="space-y-2.5 text-sm">
              <Row
                label="Target"
                value={current && current.ip !== "..." ? `${current.target} (${current.ip})` : "-"}
              />
              <Row label="Status" value={current?.status ?? "-"} />
              <Row label="Scan Type" value={current?.scanType ?? "-"} />
              <Row
                label="Port Range"
                value={current ? `${current.startPort} – ${current.endPort}` : "-"}
              />
              <Row
                label="Duration"
                value={current ? formatDuration(current.durationSeconds) : "-"}
              />
              <Row
                label="Total Ports"
                value={current ? String(current.endPort - current.startPort + 1) : "-"}
              />
              <Row
                label="Scanned"
                value={running ? `${progressScanned.toLocaleString()} / ${progressTotal.toLocaleString()}` : (current ? String(current.endPort - current.startPort + 1) : "-")}
              />
              <Row label="Open Ports" value={String(s.open)} />
              <Row label="Closed Ports" value={running ? "scanning..." : String(progressTotal > 0 ? progressTotal - s.open : "-")} />
            </dl>
          </Panel>

          <Panel title="Port Status" icon={PieChart}>
            <PortStatusChart results={results} />
          </Panel>

          <Panel title="Top Services" icon={Network}>
            <TopServices results={results} />
          </Panel>

          <Panel
            title="Recent Logs"
            icon={ScrollText}
            action={
              <Link to="/reports" className="shrink-0 text-xs text-primary hover:underline">
                View All
              </Link>
            }
          >
            <ul className="space-y-2 font-mono text-xs">
              {logs.slice(-10).map((l, i) => (
                <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                  <span className="text-muted-foreground">{l.time}</span>
                  <span className="break-words">{l.message}</span>
                </li>
              ))}
              {logs.length === 0 && (
                <li className="text-muted-foreground">No logs yet. Start a scan.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}

function Check({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-[var(--primary)] disabled:opacity-50"
      />
      <span>{label}</span>
    </label>
  );
}
