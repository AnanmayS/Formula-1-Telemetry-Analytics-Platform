import { cn } from "@/lib/utils";
import { normalizeTrackStatus } from "@/lib/f1-visuals";
import type { TrackStatusSegment } from "@/types/f1";

const SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type PlaybackSpeed = (typeof SPEEDS)[number];

const STATUS_COLOR: Record<string, string> = {
  green:  "bg-emerald-500/70",
  yellow: "bg-yellow-400/80",
  sc:     "bg-amber-500/80",
  vsc:    "bg-orange-500/80",
  red:    "bg-red-500/90",
};

interface Props {
  playing: boolean;
  onPlayPause: () => void;
  time: number;
  duration: number;
  onSeek: (t: number) => void;
  speed: PlaybackSpeed;
  onSpeedChange: (s: PlaybackSpeed) => void;
  segments: TrackStatusSegment[];
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ReplayControls({
  playing, onPlayPause, time, duration, onSeek, speed, onSpeedChange, segments,
}: Props) {
  return (
    <div className="rounded-md border border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlayPause}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>
          )}
        </button>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{fmt(time)}</span> / {fmt(duration)}
        </div>

        <div className="relative mx-2 flex-1">
          {/* Status segments */}
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
            {segments.map((seg, i) => (
              <div
                key={i}
                title={seg.label}
                className={cn("absolute h-full", STATUS_COLOR[normalizeTrackStatus(seg.status, seg.kind)] ?? "bg-secondary")}
                style={{
                  left: `${duration > 0 ? (seg.start / duration) * 100 : 0}%`,
                  width: `${duration > 0 ? ((seg.end - seg.start) / duration) * 100 : 0}%`
                }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={time}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="relative z-10 h-1.5 w-full cursor-pointer appearance-none bg-transparent
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow"
            aria-label="Seek"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={cn(
                "rounded-sm px-2 py-1 font-mono text-[11px] transition-colors",
                s === speed
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Compact legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
        {[
          ["green", "Green"], ["yellow", "Yellow"], ["sc", "SC"], ["vsc", "VSC"], ["red", "Red"],
        ].map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-3 rounded-sm", STATUS_COLOR[k] ?? "")} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export { SPEEDS };
