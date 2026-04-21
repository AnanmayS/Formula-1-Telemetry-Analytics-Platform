import type { LeaderboardRow, ReplayCar, TelemetryResponse } from "../types/f1";

type Props = {
  telemetry: TelemetryResponse | null;
  currentCar?: ReplayCar | null;
  leaderboardRows?: LeaderboardRow[];
  currentLap?: number;
  loading: boolean;
  onClose?: () => void;
};

type PedalTone = "throttle" | "brake";

export function DriverTelemetryPanel({
  telemetry,
  currentCar,
  leaderboardRows = [],
  currentLap,
  loading,
  onClose,
}: Props) {
  const driver = telemetry?.driver ?? currentCar?.driver ?? "Select driver";
  const throttle = normalizePercent(currentCar?.throttle);
  const brake = normalizeBrake(currentCar?.brake);
  const gaps = gapsForDriver(leaderboardRows, driver);
  const lapNumber = Math.round(currentCar?.lap ?? currentLap ?? 0);
  const currentLapInfo = telemetry?.lap_times.find((lap) => lap.lap === lapNumber);
  const recentLaps = telemetry?.lap_times.slice(-6) ?? [];

  return (
    <div className="panel telemetryPanel pitWallTelemetry">
      <div className="pitWallHeader">
        <div>
          <span>Selected Driver</span>
          <strong>{driver}</strong>
        </div>
        {onClose ? (
          <button className="iconButton" aria-label="Close telemetry panel" onClick={onClose}>
            X
          </button>
        ) : null}
      </div>

      <div className="pitWallBody">
        <section className="pitTelemetryRows" aria-label="Current driver telemetry">
          <TelemetryLine label="Speed" value={formatNumber(currentCar?.speed, " km/h", 0)} />
          <TelemetryLine label="Gear" value={formatGear(currentCar?.gear)} />
          <TelemetryLine label="RPM" value={formatNumber(currentCar?.rpm, "", 0)} />
          <TelemetryLine label="DRS" value={formatDrs(currentCar?.drs)} />
          <TelemetryLine label="Lap" value={lapNumber > 0 ? String(lapNumber) : "--"} />
          <TelemetryLine label="Status" value={currentCar?.track_status_label ?? "Normal"} />
        </section>

        <section className="verticalPedals" aria-label="Throttle and brake">
          <VerticalPedal label="THR" value={throttle} tone="throttle" />
          <VerticalPedal label="BRK" value={brake} tone="brake" />
        </section>
      </div>

      <section className="gapRows" aria-label="Nearby cars">
        <TelemetryLine label="Ahead" value={gaps.ahead} />
        <TelemetryLine label="Behind" value={gaps.behind} />
      </section>

      <section className="currentStint">
        <div>
          <span>Current Tire</span>
          <strong>{currentLapInfo?.compound ?? gaps.compound ?? "--"}</strong>
        </div>
        <div>
          <span>Stint</span>
          <strong>{formatNullableNumber(currentLapInfo?.stint ?? gaps.stint)}</strong>
        </div>
        <div>
          <span>Lap Time</span>
          <strong>{formatNumber(currentLapInfo?.lap_time_seconds ?? gaps.lapTime, "s", 2)}</strong>
        </div>
      </section>

      {loading ? <p className="muted">Loading lap and tire history...</p> : null}

      {!loading && recentLaps.length ? (
        <div className="lapChips stintStrip">
          {recentLaps.map((lap) => (
            <span key={lap.lap}>
              L{lap.lap}: {lap.lap_time_seconds?.toFixed(2) ?? "--"}s {lap.compound ?? ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TelemetryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="pitTelemetryLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VerticalPedal({ label, value, tone }: { label: string; value?: number; tone: PedalTone }) {
  const height = typeof value === "number" ? value : 0;
  return (
    <div className="verticalPedal">
      <div className="verticalPedalTrack">
        <span className={`verticalPedalFill ${tone}`} style={{ height: `${height}%` }} />
      </div>
      <strong>{typeof value === "number" ? `${Math.round(value)}%` : "--"}</strong>
      <span>{label}</span>
    </div>
  );
}

function gapsForDriver(rows: LeaderboardRow[], driver: string) {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((row) => row.driver === driver);
  if (index === -1) {
    return { ahead: "--", behind: "--", compound: undefined, stint: undefined, lapTime: undefined };
  }
  const current = ordered[index];
  const ahead = ordered[index - 1];
  const behind = ordered[index + 1];
  return {
    ahead: ahead ? `${ahead.driver} P${ahead.position}` : "Leader",
    behind: behind ? `${behind.driver} P${behind.position}` : "Last car",
    compound: current.compound,
    stint: current.stint,
    lapTime: current.lap_time_seconds,
  };
}

function formatNumber(value: number | undefined, suffix: string, decimals: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(decimals)}${suffix}` : "--";
}

function formatNullableNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "--";
}

function formatGear(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  if (value <= 0) return "N";
  return String(Math.round(value));
}

function formatDrs(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const drs = Math.round(value);
  if ([10, 12, 14].includes(drs)) return "ON";
  if (drs === 8) return "AVAIL";
  return drs > 0 ? "ON" : "OFF";
}

function normalizePercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

function normalizeBrake(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const percent = value <= 1 ? value * 100 : value;
  return normalizePercent(percent);
}
