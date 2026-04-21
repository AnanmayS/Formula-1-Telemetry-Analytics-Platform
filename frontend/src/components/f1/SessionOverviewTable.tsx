import { cn } from "@/lib/utils";
import { TeamSwatch } from "./TeamSwatch";
import type { DriverSummary } from "@/types/f1";

interface Props {
  drivers: DriverSummary[];
  className?: string;
}

function delta(d: DriverSummary) {
  if (isDidNotStart(d) || d.grid_position == null || d.finishing_position == null) return null;
  return d.grid_position - d.finishing_position;
}

export function SessionOverviewTable({ drivers, className }: Props) {
  const sorted = [...drivers].sort(
    (a, b) =>
      (a.finishing_position ?? 99) - (b.finishing_position ?? 99),
  );
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">Session Overview</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{drivers.length} drivers</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Start</th>
              <th className="px-2 py-2 text-left font-medium">Driver</th>
              <th className="px-2 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 text-right font-medium">Finish</th>
              <th className="px-2 py-2 text-right font-medium">Δ</th>
              <th className="px-4 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((d) => {
              const dlt = delta(d);
              return (
                <tr key={d.abbreviation} className="hover:bg-secondary/40">
                  <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums">
                    {formatStart(d)}
                  </td>
                  <td className="px-2 py-2 font-mono font-semibold">{d.abbreviation}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    <TeamSwatch team={d.team_name} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums">
                    {formatFinish(d)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      dlt != null && dlt > 0 && "text-emerald-400",
                      dlt != null && dlt < 0 && "text-red-400",
                      (dlt == null || dlt === 0) && "text-muted-foreground",
                    )}
                  >
                    {dlt == null ? "—" : dlt > 0 ? `+${dlt}` : dlt}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                    {d.status ?? "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatStart(driver: DriverSummary) {
  if (isDidNotStart(driver)) return "DNS";
  return typeof driver.grid_position === "number" ? `P${driver.grid_position}` : "DNS";
}

function formatFinish(driver: DriverSummary) {
  if (typeof driver.finishing_position === "number") return driver.finishing_position;
  return isDidNotStart(driver) ? "DNS" : "DNF";
}

function isDidNotStart(driver: DriverSummary) {
  const status = driver.status?.toLowerCase() ?? "";
  return (
    status.includes("did not start") ||
    status.includes("not started") ||
    status.includes("dns") ||
    status.includes("withdrew") ||
    status.includes("withdrawn") ||
    driver.grid_position == null
  );
}
