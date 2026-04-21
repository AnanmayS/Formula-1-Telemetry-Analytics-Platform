import { formatSeconds } from "../utils/replay";
import type { TrackStatusSegment } from "../types/f1";

type Props = {
  playing: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  segments?: TrackStatusSegment[];
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (time: number) => void;
  onSpeedChange: (speed: number) => void;
};

export function ReplayControls({
  playing,
  currentTime,
  duration,
  speed,
  segments = [],
  onPlayingChange,
  onTimeChange,
  onSpeedChange
}: Props) {
  return (
    <div className="controls">
      <button className="primaryButton" onClick={() => onPlayingChange(!playing)}>
        {playing ? "Pause" : "Play"}
      </button>
      <span className="timeText">{formatSeconds(currentTime)}</span>
      <div className="replayTimeline">
        <div className="statusSegments" aria-hidden="true">
          {segments.map((segment, index) => {
            const left = duration > 0 ? (segment.start / duration) * 100 : 0;
            const width = duration > 0 ? ((segment.end - segment.start) / duration) * 100 : 0;
            return (
              <span
                key={`${segment.kind}-${segment.start}-${index}`}
                className={`statusSegment status-${segment.kind}`}
                style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0.2, width)}%`, background: segment.color }}
                title={`${segment.label}: ${formatSeconds(segment.start)}-${formatSeconds(segment.end)}`}
              />
            );
          })}
        </div>
        <input
          aria-label="Replay time"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          value={currentTime}
          onChange={(event) => onTimeChange(Number(event.target.value))}
        />
      </div>
      <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))}>
        {[0.5, 1, 2, 4, 8].map((item) => (
          <option key={item} value={item}>
            {item}x
          </option>
        ))}
      </select>
      <div className="statusLegend" aria-label="Track status legend">
        <span><i className="legendDot normal" /> Normal</span>
        <span><i className="legendDot safety" /> SC</span>
        <span><i className="legendDot yellow" /> Yellow</span>
        <span><i className="legendDot vsc" /> VSC</span>
      </div>
    </div>
  );
}
