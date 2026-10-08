import { StatusBadge } from "./DashboardLayout";
import type { PortResult } from "@/lib/scanner";

export function ResultsTable({
  results,
  scanning = false,
}: {
  results: PortResult[];
  scanning?: boolean;
}) {
  if (results.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {scanning
          ? "Scanning in progress — open ports will appear here as they are discovered..."
          : "No ports in this range responded yet. Start a scan to see results."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-secondary text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Port</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Service</th>
            <th className="px-4 py-3 text-left font-medium">Version</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.port} className="border-t border-border hover:bg-accent/40">
              <td className="px-4 py-3 font-mono">{r.port}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3">{r.service}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.version || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {scanning && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Scan in progress — table updates as open ports are discovered.
        </p>
      )}
    </div>
  );
}
