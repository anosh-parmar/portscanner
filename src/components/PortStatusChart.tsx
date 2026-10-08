import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { PortResult } from "@/lib/scanner";
import { summarize } from "@/lib/scanner";

export function PortStatusChart({ results }: { results: PortResult[] }) {
  const { open, closed, filtered, total } = summarize(results);
  const data = [
    { name: "Open", value: open, color: "var(--open)" },
    { name: "Closed", value: closed, color: "var(--closed)" },
    { name: "Filtered", value: filtered, color: "var(--filtered)" },
  ];
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[140px] w-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={total ? data : [{ name: "Empty", value: 1, color: "var(--muted)" }]}
              dataKey="value"
              innerRadius={44}
              outerRadius={68}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              paddingAngle={2}
            >
              {(total ? data : [{ color: "var(--muted)" }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{total}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
      <ul className="space-y-3 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {d.value} ({pct(d.value)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopServices({ results }: { results: PortResult[] }) {
  const counts = new Map<string, number>();
  results
    .filter((r) => r.status === "open")
    .forEach((r) => counts.set(r.service, (counts.get(r.service) ?? 0) + 1));
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r[1]));

  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No open services detected.</p>;

  return (
    <ul className="space-y-3 text-sm">
      {rows.map(([service, count]) => (
        <li key={service} className="grid grid-cols-[70px_minmax(0,1fr)_24px] items-center gap-3">
          <span className="truncate">{service}</span>
          <span className="h-2 rounded-full bg-secondary">
            <span
              className="block h-2 rounded-full bg-primary"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </span>
          <span className="text-right text-muted-foreground">{count}</span>
        </li>
      ))}
    </ul>
  );
}
