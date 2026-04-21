import { cn } from "@/lib/utils";
import { TeamSwatch } from "./TeamSwatch";
import type { PredictionCardData } from "@/types/f1";

const CLASS_STYLE: Record<string, string> = {
  Gain: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Lose: "bg-red-500/15 text-red-300 ring-red-500/30",
  Flat: "bg-secondary text-muted-foreground ring-border",
};

export function PredictionCard({ row }: { row: PredictionCardData }) {
  const classLabel = row.predicted_class > 0 ? "Gain" : row.predicted_class < 0 ? "Lose" : "Flat";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-secondary font-mono text-xs font-bold">
            P{row.predicted_finishing_position ?? "--"}
          </span>
          <span className="font-mono text-base font-semibold">{row.driver}</span>
        </div>
        <span
          className={cn(
            "rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1",
            CLASS_STYLE[classLabel],
          )}
        >
          {classLabel}
        </span>
      </div>
      <TeamSwatch team={row.team} className="text-xs text-muted-foreground" />

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-2 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Start</div>
          <div className="font-mono text-sm tabular-nums">{typeof row.starting_position === "number" ? `P${row.starting_position}` : "--"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Finish</div>
          <div className="font-mono text-sm tabular-nums">{typeof row.predicted_finishing_position === "number" ? `P${row.predicted_finishing_position}` : "--"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Δ</div>
          <div
            className={cn(
              "font-mono text-sm tabular-nums",
              row.predicted_position_delta > 0 && "text-emerald-400",
              row.predicted_position_delta < 0 && "text-red-400",
            )}
          >
            {row.predicted_position_delta > 0 ? `+${row.predicted_position_delta}` : row.predicted_position_delta}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Bar label="Gain prob." value={row.probability_gain} color="bg-emerald-400" />
        <Bar label="Confidence" value={row.confidence} color="bg-primary" />
      </div>

      <div className="border-t border-border pt-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Top features</div>
        <ul className="mt-1 space-y-0.5">
          {row.top_contributing_features.map((f) => (
            <li key={f.feature} className="flex items-center justify-between text-[11px]">
              <span className="truncate font-mono text-muted-foreground">{f.feature}</span>
              <span className="font-mono tabular-nums">{f.score.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full", color)} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}
