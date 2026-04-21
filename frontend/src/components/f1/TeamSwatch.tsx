import { cn } from "@/lib/utils";
import { teamColor } from "@/lib/f1-visuals";

interface Props {
  label?: string;
  team?: string | null;
  className?: string;
}

export function TeamSwatch({ label, team, className }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="h-3 w-1 rounded-sm"
        style={{ backgroundColor: teamColor(team) }}
      />
      <span className="truncate">{label ?? team ?? "--"}</span>
    </span>
  );
}
