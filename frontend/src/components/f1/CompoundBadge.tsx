import { cn } from "@/lib/utils";
import { normalizeCompound } from "@/lib/f1-visuals";

const STYLES: Record<string, { bg: string; fg: string; ring: string; letter: string }> = {
  SOFT:   { bg: "bg-red-500/15",   fg: "text-red-400",    ring: "ring-red-500/40",    letter: "S" },
  MEDIUM: { bg: "bg-yellow-400/15", fg: "text-yellow-300", ring: "ring-yellow-400/40", letter: "M" },
  HARD:   { bg: "bg-white/10",     fg: "text-white",      ring: "ring-white/40",      letter: "H" },
  INTER:  { bg: "bg-emerald-500/15", fg: "text-emerald-300", ring: "ring-emerald-500/40", letter: "I" },
  WET:    { bg: "bg-blue-500/15",  fg: "text-blue-300",   ring: "ring-blue-500/40",   letter: "W" },
  UNKNOWN: { bg: "bg-secondary", fg: "text-muted-foreground", ring: "ring-border", letter: "-" },
};

export function CompoundBadge({ compound, className }: { compound?: string | null; className?: string }) {
  const normalized = normalizeCompound(compound);
  const s = STYLES[normalized] ?? STYLES.UNKNOWN;
  return (
    <span
      title={compound ?? "Unknown compound"}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full ring-1 font-mono text-[10px] font-bold",
        s.bg, s.fg, s.ring, className,
      )}
    >
      {s.letter}
    </span>
  );
}
