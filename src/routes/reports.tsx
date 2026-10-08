import { createFileRoute } from "@tanstack/react-router";
import { FileText, Download, ScrollText } from "lucide-react";
import { DashboardLayout, Panel } from "@/components/DashboardLayout";
import { useScanStore } from "@/lib/scan-store";
import { formatDuration, summarize, type ScanRecord } from "@/lib/scanner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports | Python Port Scanner" },
      {
        name: "description",
        content: "Export port scan reports as CSV or JSON and review the full scan log output.",
      },
      { property: "og:title", content: "Reports | Python Port Scanner" },
      {
        property: "og:description",
        content: "Downloadable CSV and JSON reports for every completed port scan.",
      },
    ],
  }),
  component: ReportsPage,
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(record: ScanRecord) {
  const rows = [
    ["port", "status", "service", "version"],
    ...record.results.map((r) => [r.port, r.status, r.service, r.version]),
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

function ReportsPage() {
  const { history, logs } = useScanStore();

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <Panel title="Reports" icon={FileText} description="Export completed scans">
          <ul className="space-y-3">
            {history.map((h) => {
              const s = summarize(h.results);
              const base = `scan-${h.target}-${h.id.slice(0, 8)}`;
              return (
                <li
                  key={h.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-border bg-secondary/40 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {h.target} ({h.ip})
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(h.startedAt).toLocaleString()} • {h.scanType} • ports{" "}
                      {h.startPort}-{h.endPort} • {s.open} open •{" "}
                      {formatDuration(h.durationSeconds)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => download(`${base}.csv`, toCsv(h), "text/csv")}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <Download className="h-4 w-4" /> CSV
                    </button>
                    <button
                      onClick={() =>
                        download(`${base}.json`, JSON.stringify(h, null, 2), "application/json")
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <Download className="h-4 w-4" /> JSON
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Full Log Output" icon={ScrollText}>
          <ul className="space-y-2 font-mono text-xs">
            {logs.map((l, i) => (
              <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                <span className="text-muted-foreground">{l.time}</span>
                <span className="break-words">{l.message}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </DashboardLayout>
  );
}
