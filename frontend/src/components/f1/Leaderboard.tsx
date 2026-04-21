import { cn } from "@/lib/utils";
import { CompoundBadge } from "./CompoundBadge";
import { formatLapTime } from "@/lib/f1-visuals";
import type { LeaderboardRow } from "@/types/f1";

interface Props {
  rows: LeaderboardRow[];
  selected: string | null;
  onSelect?: (driver: string) => void;
  className?: string;
  compact?: boolean;
}

export function Leaderboard({ rows, selected, onSelect, className, compact }: Props) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-md border border-border bg-card/95 backdrop-blur", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Live leaderboard
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground">L{rows[0]?.lap_number ?? 0}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const isSel = r.driver === selected;
              return (
                <tr
                  key={r.driver}
                  onClick={() => onSelect?.(r.driver)}
                  className={cn(
                    "cursor-pointer text-sm transition-colors hover:bg-secondary/60",
                    isSel && "bg-primary/10",
                  )}
                >
                  <td className="w-8 py-1.5 pl-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                    {String(r.position).padStart(2, "0")}
                  </td>
                  <td className="py-1.5 font-mono text-sm font-semibold">{r.driver}</td>
                  {!compact && (
                    <td className="py-1.5 pl-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatGap(r)}
                    </td>
                  )}
                  <td className="py-1.5 pr-1 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                    {formatLapTime(r.lap_time_seconds)}
                  </td>
                  <td className="w-10 py-1.5 pr-3 text-right">
                    <CompoundBadge compound={r.compound} />
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

function formatGap(row: LeaderboardRow) {
  if (row.position === 1) return "LEADER";
  return typeof row.gap_to_leader === "number" && Number.isFinite(row.gap_to_leader)
    ? `+${formatGapDuration(row.gap_to_leader)}`
    : "--";
}

function formatGapDuration(value: number) {
  const totalMilliseconds = Math.max(0, Math.round(value * 1000));
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}
