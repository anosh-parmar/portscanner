import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Clock } from "lucide-react";
import { DashboardLayout, Panel } from "@/components/DashboardLayout";
import { ResultsTable } from "@/components/ResultsTable";
import { useScanStore } from "@/lib/scan-store";
import { formatDuration, summarize } from "@/lib/scanner";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Scan History | Python Port Scanner" },
      {
        name: "description",
        content: "Browse previous port scans with target, date, open port count and duration.",
      },
      { property: "og:title", content: "Scan History | Python Port Scanner" },
      {
        property: "og:description",
        content: "Previous port scan records with open port counts and durations.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { history } = useScanStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = history.find((h) => h.id === openId) ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <Panel title="Scan History" icon={Clock} description="Previous scan records">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Target</th>
                  <th className="px-4 py-3 text-left font-medium">Date / Time</th>
                  <th className="px-4 py-3 text-left font-medium">Port Range</th>
                  <th className="px-4 py-3 text-left font-medium">Open Ports</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-right font-medium">Results</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-4 py-3">{h.target}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(h.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {h.startPort} - {h.endPort}
                    </td>
                    <td className="px-4 py-3 text-open">{summarize(h.results).open}</td>
                    <td className="px-4 py-3">{formatDuration(h.durationSeconds)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setOpenId(openId === h.id ? null : h.id)}
                        className="text-primary hover:underline"
                      >
                        {openId === h.id ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {selected && (
          <Panel title={`Results — ${selected.target}`}>
            <ResultsTable results={selected.results} />
          </Panel>
        )}
      </div>
    </DashboardLayout>
  );
}
