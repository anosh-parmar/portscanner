import { Link, useRouterState } from "@tanstack/react-router";
import { Radar, Clock, FileText, Settings as SettingsIcon, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScanStore } from "@/lib/scan-store";

const nav = [
  { title: "Scan", url: "/", icon: Radar },
  { title: "History", url: "/history", icon: Clock },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { running } = useScanStore();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-sidebar px-4 py-3">
        <button
          className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Radar className="h-7 w-7 shrink-0 text-primary" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight">Python Port Scanner</h1>
          <p className="truncate text-xs text-muted-foreground">Scan • Analyze • Report</p>
        </div>
      </header>

      <div className="flex">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 pt-20 transition-transform lg:sticky lg:top-0 lg:h-[calc(100vh-61px)] lg:translate-x-0 lg:pt-3",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = pathname === item.url;
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-sidebar-border pt-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  running ? "bg-filtered animate-pulse" : "bg-open",
                )}
              />
              {running ? "Scanning (real)" : "Ready"}
            </p>
            <p className="mt-1 opacity-60">Python backend on :8000</p>
            <p className="mt-2">v2.0.0</p>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  children,
  className,
  action,
  description,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-sm",
        className,
      )}
    >
      {title && (
        <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" />}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{title}</h2>
              {description && (
                <p className="truncate text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: "open" | "closed" | "filtered" }) {
  const map = {
    open: "bg-open text-open",
    closed: "bg-closed text-closed",
    filtered: "bg-filtered text-filtered",
  } as const;
  return (
    <span className="inline-flex items-center gap-2 text-sm capitalize">
      <span className={cn("h-2.5 w-2.5 rounded-full", map[status].split(" ")[0])} />
      <span className={map[status].split(" ")[1]}>{status}</span>
    </span>
  );
}
