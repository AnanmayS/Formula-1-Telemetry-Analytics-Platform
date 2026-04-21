import { formatLapTime } from "@/lib/f1-visuals";
import { cn } from "@/lib/utils";
import type { DriverSummary } from "@/types/f1";
import { TeamSwatch } from "./TeamSwatch";

type Props = {
  drivers: DriverSummary[];
  className?: string;
};

export function QualifyingOverviewTable({ drivers, className }: Props) {
  const sorted = [...drivers].sort((a, b) => (a.finishing_position ?? 999) - (b.finishing_position ?? 999));

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">Qualifying Overview</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{drivers.length} drivers</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Pos</th>
              <th className="px-2 py-2 text-left font-medium">Driver</th>
              <th className="px-2 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 text-right font-medium">Out / Stage</th>
              <th className="px-2 py-2 text-right font-medium">Lap Time</th>
              <th className="px-2 py-2 text-right font-medium">Q1</th>
              <th className="px-2 py-2 text-right font-medium">Q2</th>
              <th className="px-4 py-2 text-right font-medium">Q3</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((driver) => {
              const stage = qualifyingStage(driver);
              return (
                <tr key={driver.abbreviation} className="hover:bg-secondary/40">
                  <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums">
                    {typeof driver.finishing_position === "number" ? `P${driver.finishing_position}` : "--"}
                  </td>
                  <td className="px-2 py-2 font-mono font-semibold">{driver.abbreviation}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    <TeamSwatch team={driver.team_name} />
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono text-xs uppercase", stageTone(stage))}>{stage}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums">
                    {formatLapTime(stageLapTime(driver))}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-muted-foreground tabular-nums">
                    <QualifyingLap value={driver.q1_time_seconds} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-muted-foreground tabular-nums">
                    <QualifyingLap value={driver.q2_time_seconds} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground tabular-nums">
                    <QualifyingLap value={driver.q3_time_seconds} />
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

function QualifyingLap({ value }: { value?: number }) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return <span className="text-border"> </span>;
  }
  return <>{formatLapTime(value)}</>;
}

function qualifyingStage(driver: DriverSummary) {
  const stage = driver.qualifying_stage;
  if (stage === "Q3") return "Q3";
  if (stage === "Q2") return "Out Q2";
  if (stage === "Q1") return "Out Q1";
  return driver.status ?? "No time";
}

function stageLapTime(driver: DriverSummary) {
  if (driver.qualifying_stage === "Q3") return driver.q3_time_seconds;
  if (driver.qualifying_stage === "Q2") return driver.q2_time_seconds;
  if (driver.qualifying_stage === "Q1") return driver.q1_time_seconds;
  return undefined;
}

function stageTone(stage: string) {
  if (stage === "Q3") return "text-emerald-300";
  if (stage === "Out Q2") return "text-yellow-300";
  if (stage === "Out Q1") return "text-red-300";
  return "text-muted-foreground";
}
