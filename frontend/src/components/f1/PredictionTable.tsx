import { cn } from "@/lib/utils";
import { TeamSwatch } from "./TeamSwatch";
import type { FinalGridRow } from "@/types/f1";

export function PredictionTable({ rows, className }: { rows: FinalGridRow[]; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">Final predicted grid</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{rows.length} drivers</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Pred. fin.</th>
              <th className="px-2 py-2 text-left font-medium">Driver</th>
              <th className="px-2 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 text-right font-medium">Start</th>
              <th className="px-2 py-2 text-right font-medium">Δ</th>
              <th className="px-4 py-2 text-right font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.driver} className="hover:bg-secondary/40">
                <td className="px-4 py-2 font-mono font-semibold tabular-nums">P{r.position}</td>
                <td className="px-2 py-2 font-mono font-semibold">{r.driver}</td>
                <td className="px-2 py-2 text-muted-foreground"><TeamSwatch team={r.team} /></td>
                <td className="px-2 py-2 text-right font-mono text-muted-foreground tabular-nums">
                  {typeof r.starting_position === "number" ? `P${r.starting_position}` : "--"}
                </td>
                <td className={cn(
                  "px-2 py-2 text-right font-mono tabular-nums",
                  r.predicted_position_delta > 0 && "text-emerald-400",
                  r.predicted_position_delta < 0 && "text-red-400",
                )}>
                  {r.predicted_position_delta > 0 ? `+${r.predicted_position_delta}` : r.predicted_position_delta}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="ml-auto flex w-32 items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-primary" style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                    </div>
                    <span className="w-9 text-right font-mono text-[11px] tabular-nums">{Math.round(r.confidence * 100)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
