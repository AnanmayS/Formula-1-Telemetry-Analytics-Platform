import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  className?: string;
}

const TONE = {
  default: "text-foreground",
  good: "text-emerald-400",
  warn: "text-yellow-300",
  bad: "text-red-400",
} as const;

export function MetricCard({ label, value, hint, tone = "default", className }: Props) {
  return (
    <div className={cn("rounded-md border border-border bg-card p-4", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1.5 font-mono text-2xl font-semibold tabular-nums", TONE[tone])}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
