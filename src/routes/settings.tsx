import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { DashboardLayout, Panel } from "@/components/DashboardLayout";
import { scanStore, useScanStore } from "@/lib/scan-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Python Port Scanner" },
      {
        name: "description",
        content: "Set the default port range, socket timeout and scan options for the scanner.",
      },
      { property: "og:title", content: "Settings | Python Port Scanner" },
      {
        property: "og:description",
        content: "Scanner preferences: default port range, timeout and scan options.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings } = useScanStore();

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-5">
        <Panel title="Scanner Preferences" icon={SettingsIcon} description="Defaults used for new scans">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Default start port">
              <input
                type="number"
                min={1}
                max={65535}
                value={settings.defaultStart}
                onChange={(e) =>
                  scanStore.updateSettings({ defaultStart: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 outline-none focus:border-ring"
              />
            </Field>
            <Field label="Default end port">
              <input
                type="number"
                min={1}
                max={65535}
                value={settings.defaultEnd}
                onChange={(e) => scanStore.updateSettings({ defaultEnd: Number(e.target.value) })}
                className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 outline-none focus:border-ring"
              />
            </Field>
            <Field label="Socket timeout (s)">
              <input
                type="number"
                step="0.1"
                min={0.1}
                max={10}
                value={settings.timeout}
                onChange={(e) => scanStore.updateSettings({ timeout: Number(e.target.value) })}
                className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 outline-none focus:border-ring"
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Scan Options">
          <div className="space-y-3 text-sm">
            <Toggle
              label="Resolve domain names before scanning"
              checked={settings.resolveDomain}
              onChange={(v) => scanStore.updateSettings({ resolveDomain: v })}
            />
            <Toggle
              label="Detect service and version on open ports"
              checked={settings.detectServices}
              onChange={(v) => scanStore.updateSettings({ detectServices: v })}
            />
            <Toggle
              label="Verbose log output"
              checked={settings.verbose}
              onChange={(v) => scanStore.updateSettings({ verbose: v })}
            />
          </div>
        </Panel>

        <Panel title="Backend">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Scanning is performed by a real Python scanner running in a Django backend on{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                http://localhost:8000
              </code>
              .
            </p>
            <p>
              The scanner uses{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                socket.connect_ex()
              </code>{" "}
              (TCP) with concurrent threading for fast scans, and streams results via{" "}
              Server-Sent Events (SSE).
            </p>
            <p className="font-medium text-foreground">To start the backend:</p>
            <pre className="rounded-lg bg-secondary p-3 font-mono text-xs leading-relaxed">
              cd backend{"\n"}python manage.py runserver 8000
            </pre>
          </div>
        </Panel>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--primary)]"
      />
      <span>{label}</span>
    </label>
  );
}
