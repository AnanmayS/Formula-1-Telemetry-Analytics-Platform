import { teamColor } from "@/lib/f1-visuals";
import type { DriverSummary } from "@/types/f1";

export function DriverTile({ driver }: { driver: DriverSummary }) {
  const color = teamColor(driver.team_name);
  return (
    <div className="group relative overflow-hidden rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/50">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center justify-between pl-2">
        <div>
          <div className="font-mono text-lg font-bold tracking-tight">{driver.abbreviation}</div>
          <div className="truncate text-[11px] text-muted-foreground">{driver.team_name ?? "--"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Grid → Fin</div>
          <div className="font-mono text-sm tabular-nums">
            <span className="text-muted-foreground">P{driver.grid_position ?? "—"}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="font-semibold text-foreground">
              {driver.finishing_position ?? "DNF"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DriverTileGrid({ drivers }: { drivers: DriverSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {drivers.map((d) => (
        <DriverTile key={d.abbreviation} driver={d} />
      ))}
    </div>
  );
}
