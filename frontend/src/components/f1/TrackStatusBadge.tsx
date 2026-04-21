import { cn } from "@/lib/utils";
import { normalizeTrackStatus } from "@/lib/f1-visuals";

const MAP: Record<string, { dot: string; label: string }> = {
  green:  { dot: "bg-emerald-400", label: "GREEN" },
  yellow: { dot: "bg-yellow-300",  label: "YELLOW" },
  sc:     { dot: "bg-amber-400",   label: "SC" },
  vsc:    { dot: "bg-orange-400",  label: "VSC" },
  red:    { dot: "bg-red-500",     label: "RED" },
};

export function TrackStatusBadge({ status, label, className }: { status?: string | null; label?: string; className?: string }) {
  const m = MAP[normalizeTrackStatus(status)] ?? MAP.green;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border border-border bg-background/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {label ?? m.label}
    </span>
  );
}
