import { cn } from "@/lib/utils";
import { CompoundBadge } from "./CompoundBadge";
import { TeamSwatch } from "./TeamSwatch";
import { TrackStatusBadge } from "./TrackStatusBadge";
import { formatLapTime } from "@/lib/f1-visuals";
import type { ReplayCar } from "@/types/f1";

interface Props {
  car: ReplayCar | null;
  team: string;
  ahead: string | null;
  behind: string | null;
  compound?: string;
  stint?: number;
  lapTimeSeconds?: number;
  recentLapTimes: number[];
  className?: string;
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex h-full flex-col items-center gap-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="relative h-32 w-3 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("absolute bottom-0 left-0 right-0 transition-[height]", color)}
          style={{ height: `${Math.round(value * 100)}%` }}
        />
      </div>
      <div className="font-mono text-[10px] tabular-nums">{Math.round(value * 100)}%</div>
    </div>
  );
}

function Stat({ label, value, mono = true, accent }: { label: string; value: React.ReactNode; mono?: boolean; accent?: string }) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold", mono && "font-mono tabular-nums", accent)}>{value}</div>
    </div>
  );
}

export function TelemetryDrawer({
  car, team, ahead, behind, compound, stint, lapTimeSeconds, recentLapTimes, className,
}: Props) {
  if (!car) {
    return (
      <div className={cn("rounded-md border border-border bg-card/95 p-4 text-xs text-muted-foreground backdrop-blur", className)}>
        Select a driver to view telemetry.
      </div>
    );
  }
  return (
    <div className={cn("rounded-md border border-border bg-card/95 backdrop-blur", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold tracking-tight">{car.driver}</span>
          <TeamSwatch team={team} />
        </div>
        <TrackStatusBadge status={car.track_status} label={car.track_status_label} />
      </div>

      <div className="grid grid-cols-12 gap-4 p-4">
        {/* Bars */}
        <div className="col-span-3 flex justify-around">
          <Bar label="THR" value={asPercent(car.throttle)} color="bg-emerald-400" />
          <Bar label="BRK" value={asPercent(car.brake)} color="bg-red-500" />
        </div>

        {/* Numeric stats */}
        <div className="col-span-6 grid grid-cols-3 gap-x-4 gap-y-3">
          <Stat label="Speed" value={formatNumber(car.speed, " km/h", 0)} />
          <Stat label="Gear" value={formatGear(car.gear)} />
          <Stat label="RPM" value={formatNumber(car.rpm, "", 0)} />
          <Stat label="DRS" value={formatDrs(car.drs)} accent={isDrsOpen(car.drs) ? "text-emerald-400" : ""} />
          <Stat label="Lap" value={Math.round(car.lap ?? 0) || "--"} />
          <Stat label="Lap time" value={formatLapTime(lapTimeSeconds)} />
        </div>

        {/* Side stack */}
        <div className="col-span-3 flex flex-col gap-2 border-l border-border pl-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Ahead</span>
            <span className="font-mono font-semibold">{ahead ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Behind</span>
            <span className="font-mono font-semibold">{behind ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tire</span>
            <span className="flex items-center gap-1.5"><CompoundBadge compound={compound} /><span className="font-mono">{compound ?? "--"}</span></span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Stint</span>
            <span className="font-mono">{typeof stint === "number" ? `#${stint}` : "--"}</span>
          </div>
        </div>

        {/* Recent laps */}
        <div className="col-span-12 flex items-center gap-1.5 border-t border-border pt-3">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent laps</span>
          <div className="flex flex-wrap gap-1.5">
            {recentLapTimes.map((t, i) => (
              <span key={i} className="rounded-sm border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums">
                {formatLapTime(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function asPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function formatNumber(value: number | undefined, suffix: string, decimals: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(decimals)}${suffix}` : "--";
}

function formatGear(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value <= 0 ? "N" : Math.round(value);
}

function isDrsOpen(value?: number) {
  return typeof value === "number" && [10, 12, 14].includes(Math.round(value));
}

function formatDrs(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  if (isDrsOpen(value)) return "OPEN";
  return value > 0 ? "AVAIL" : "--";
}
