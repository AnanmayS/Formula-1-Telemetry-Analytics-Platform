import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { ReplayCanvas } from "@/components/ReplayCanvas";
import { CompoundBadge } from "@/components/f1/CompoundBadge";
import { Leaderboard } from "@/components/f1/Leaderboard";
import { QualifyingOverviewTable } from "@/components/f1/QualifyingOverviewTable";
import { ReplayControls, SPEEDS, type PlaybackSpeed } from "@/components/f1/ReplayControls";
import { TeamSwatch } from "@/components/f1/TeamSwatch";
import { TelemetryDrawer } from "@/components/f1/TelemetryDrawer";
import { WeatherCard } from "@/components/f1/WeatherCard";
import { formatLapTime, teamColor } from "@/lib/f1-visuals";
import { cn } from "@/lib/utils";
import type { DriverSummary, LeaderboardRow, ReplayCar, ReplayResponse, SessionSummary, TelemetryPoint, TelemetryResponse } from "@/types/f1";
import { formatSeconds, interpolatedFrame } from "@/utils/replay";

type QualifyingRound = "q1" | "q2" | "q3";

export function ReplayPage() {
  const [params] = useSearchParams();
  const season = Number(params.get("season") ?? 2024);
  const event = params.get("event") ?? "Monaco Grand Prix";
  const session = params.get("session") ?? "R";

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedQualifyingRound, setSelectedQualifyingRound] = useState<QualifyingRound | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setReplay(null);
    setSummary(null);
    setTelemetry(null);
    setSelected(null);
    setSelectedQualifyingRound(null);
    setTime(0);
    Promise.all([
      api.summary(season, event, session).catch(() => null),
      session === "Q"
        ? api.replay(season, event, session).catch(() => null)
        : api.replay(season, event, session),
    ])
      .then(([summaryPayload, replayPayload]) => {
        setSummary(summaryPayload);
        setReplay(replayPayload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load replay."));
  }, [season, event, session]);

  useEffect(() => {
    if (session !== "Q" || !summary?.drivers.length) return;
    const drivers = [...summary.drivers].sort((a, b) => (a.finishing_position ?? 999) - (b.finishing_position ?? 999));
    const driver = drivers.find((item) => item.abbreviation === selected) ?? drivers[0];
    if (!selected) setSelected(driver.abbreviation);
    const nextRound = preferredQualifyingRound(driver, selectedQualifyingRound);
    if (nextRound !== selectedQualifyingRound) setSelectedQualifyingRound(nextRound);
  }, [session, summary, selected, selectedQualifyingRound]);

  useEffect(() => {
    if (!selected) return;
    setTelemetry(null);
    const lap = session === "Q" && selectedQualifyingRound ? selectedQualifyingRound : "fastest";
    api.telemetry(season, event, session, selected, lap).then(setTelemetry).catch(() => setTelemetry(null));
  }, [season, event, session, selected, selectedQualifyingRound]);

  const qualifyingDuration = session === "Q" ? qualifyingPlaybackDuration(telemetry) : 0;
  const playbackDuration = session === "Q" ? qualifyingDuration : replay?.duration ?? 0;

  useEffect(() => {
    if (!playing || playbackDuration <= 0) return;
    let animationFrame = 0;
    let lastTick = performance.now();
    const activeDuration = playbackDuration;

    function tick(now: number) {
      const elapsedSeconds = (now - lastTick) / 1000;
      lastTick = now;
      setTime((current) => {
        const next = current + elapsedSeconds * speed;
        return next > activeDuration ? 0 : next;
      });
      animationFrame = window.requestAnimationFrame(tick);
    }

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [playing, speed, playbackDuration]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key === "ArrowLeft") setTime((current) => Math.max(0, current - 10));
      if (event.key === "ArrowRight" && playbackDuration > 0) setTime((current) => Math.min(playbackDuration, current + 10));
      if (event.key === "1") setSpeed(0.5);
      if (event.key === "2") setSpeed(1);
      if (event.key === "3") setSpeed(2);
      if (event.key === "4") setSpeed(4);
      if (event.key === "ArrowUp") setSpeed((value) => nextSpeed(value, 1));
      if (event.key === "ArrowDown") setSpeed((value) => nextSpeed(value, -1));
      if (event.key.toLowerCase() === "r") setTime(0);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playbackDuration]);

  const frame = useMemo(() => interpolatedFrame(replay?.frames ?? [], time), [replay, time]);
  const leaderboard = useMemo(() => rowsForFrame(frame, replay?.leaderboard ?? []), [frame, replay]);
  const selectedCar = useMemo(() => currentCarForDriver(frame?.cars ?? [], selected), [frame, selected]);
  const driverTeamMap = useMemo(() => teamMap(summary), [summary]);
  const inactiveDrivers = useMemo(() => inactiveDriverRows(summary, frame?.cars ?? []), [summary, frame]);
  const selectedRow = leaderboard.find((row) => row.driver === selected);
  const selectedIndex = leaderboard.findIndex((row) => row.driver === selected);
  const ahead = selectedIndex > 0 ? leaderboard[selectedIndex - 1].driver : null;
  const behind = selectedIndex >= 0 && selectedIndex < leaderboard.length - 1 ? leaderboard[selectedIndex + 1].driver : null;
  const weather = weatherSnapshot(summary);
  const recentLapTimes = telemetry?.lap_times
    .slice(-6)
    .map((lap) => lap.lap_time_seconds)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? [];

  useEffect(() => {
    writeRecentSession({ season, event, session });
  }, [season, event, session]);

  if (error) {
    return (
      <main className="min-h-screen bg-pitwall p-8 text-sm text-red-300">
        {error}
      </main>
    );
  }

  if (session === "Q" && summary) {
    return (
      <QualifyingReplayView
        season={season}
        event={event}
        session={session}
        summary={summary}
        replay={replay}
        telemetry={telemetry}
        selected={selected}
        selectedRound={selectedQualifyingRound}
        playing={playing}
        time={time}
        speed={speed}
        duration={playbackDuration}
        onSelectedChange={setSelected}
        onRoundChange={setSelectedQualifyingRound}
        onPlayingChange={setPlaying}
        onTimeChange={setTime}
        onSpeedChange={setSpeed}
      />
    );
  }

  if (!replay) {
    return <main className="min-h-screen bg-pitwall p-8 text-sm text-muted-foreground">Loading replay...</main>;
  }

  return (
    <main className="min-h-screen bg-pitwall">
      <section className="relative h-screen min-h-[640px] w-full overflow-hidden border-b border-border bg-black">
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-1.5 backdrop-blur">
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary font-mono text-[10px] font-bold text-primary-foreground">F1</span>
            <span className="font-mono text-xs">
              <span className="font-semibold">{event}</span>
              <span className="px-1.5 text-muted-foreground">/</span>
              <span className="text-muted-foreground">{season}</span>
              <span className="px-1.5 text-muted-foreground">/</span>
              <span className="text-primary">{session}</span>
            </span>
            <Link to="/" className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Session</Link>
            <Link to="/model" className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Model</Link>
          </div>
        </div>

        <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
          <HudMetric label="Lap" value={`${frame?.lap ?? "--"}/${summary?.total_laps ?? "--"}`} />
          <HudMetric label="Race time" value={formatSeconds(time)} />
          <HudMetric label="Speed" value={`${speed}x`} />
        </div>

        <div className="absolute bottom-40 left-3 top-24 z-20 flex w-[260px] flex-col gap-2 overflow-y-auto max-lg:hidden">
          <WeatherCard weather={weather} />
          {selectedCar ? (
            <div className="rounded-md border border-border bg-card/90 p-3 backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected driver</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-lg font-bold">{selectedCar.driver}</span>
                <span className="font-mono text-xs text-muted-foreground">P{selectedRow?.position ?? "--"}</span>
              </div>
              <TeamSwatch team={driverTeamMap[selectedCar.driver]} className="text-xs text-muted-foreground" />
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Mini label="Speed" value={formatMetric(selectedCar.speed)} />
                <Mini label="Gear" value={formatMetric(selectedCar.gear)} />
                <Mini label="DRS" value={formatDrs(selectedCar.drs)} />
              </div>
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-card/90 p-3 backdrop-blur">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Top 3</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {leaderboard.slice(0, 3).map((row) => (
                <button
                  key={row.driver}
                  onClick={() => setSelected(row.driver)}
                  className="flex flex-col items-start gap-0.5 rounded-sm border border-border bg-background/70 p-2 text-left transition-colors hover:border-primary"
                  style={{ borderLeft: `3px solid ${teamColor(driverTeamMap[row.driver])}` }}
                >
                  <span className="font-mono text-xs text-muted-foreground">P{row.position}</span>
                  <span className="font-mono text-sm font-semibold">{row.driver}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{formatGap(row)}</span>
                </button>
              ))}
            </div>
          </div>
          <InactiveDriverRail drivers={inactiveDrivers} />
        </div>

        <div className="absolute bottom-40 right-3 top-24 z-20 w-[300px] max-lg:hidden">
          <Leaderboard rows={leaderboard} selected={selected} onSelect={setSelected} className="h-full" />
        </div>

        <div className="absolute bottom-32 left-[292px] right-[332px] top-16 z-0 flex items-center justify-center max-lg:bottom-36 max-lg:left-3 max-lg:right-3 max-lg:top-24">
          <div className="h-full w-full">
            <ReplayCanvas replay={replay} frame={frame} selectedDriver={selected ?? ""} onSelectDriver={setSelected} />
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 z-20">
          <ReplayControls
            playing={playing}
            onPlayPause={() => setPlaying((value) => !value)}
            time={time}
            duration={replay.duration}
            onSeek={setTime}
            speed={speed}
            onSpeedChange={setSpeed}
            segments={replay.track_status_segments}
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <TelemetryDrawer
          car={selectedCar}
          team={driverTeamMap[selected ?? ""]}
          ahead={ahead}
          behind={behind}
          compound={selectedRow?.compound}
          stint={selectedRow?.stint}
          lapTimeSeconds={selectedRow?.lap_time_seconds}
          recentLapTimes={recentLapTimes}
        />

        <div className="mt-6">
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">Synced leaderboard</h3>
              <span className="font-mono text-[11px] text-muted-foreground">L{leaderboard[0]?.lap_number ?? 0}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Pos</th>
                    <th className="px-2 py-2 text-left font-medium">Driver</th>
                    <th className="px-2 py-2 text-left font-medium">Team</th>
                    <th className="px-2 py-2 text-right font-medium">Gap</th>
                    <th className="px-2 py-2 text-right font-medium">Last lap</th>
                    <th className="px-2 py-2 text-center font-medium">Tire</th>
                    <th className="px-4 py-2 text-right font-medium">Stint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leaderboard.map((row) => (
                    <tr
                      key={row.driver}
                      onClick={() => setSelected(row.driver)}
                      className={`cursor-pointer hover:bg-secondary/40 ${row.driver === selected ? "bg-primary/10" : ""}`}
                    >
                      <td className="px-4 py-1.5 font-mono text-muted-foreground tabular-nums">P{row.position}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold">{row.driver}</td>
                      <td className="px-2 py-1.5 text-muted-foreground"><TeamSwatch team={driverTeamMap[row.driver]} /></td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{formatGap(row)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatLapTime(row.lap_time_seconds)}</td>
                      <td className="px-2 py-1.5 text-center"><CompoundBadge compound={row.compound} /></td>
                      <td className="px-4 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{typeof row.stint === "number" ? `#${row.stint}` : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

type QualifyingReplayProps = {
  season: number;
  event: string;
  session: string;
  summary: SessionSummary;
  replay: ReplayResponse | null;
  telemetry: TelemetryResponse | null;
  selected: string | null;
  selectedRound: QualifyingRound | null;
  playing: boolean;
  time: number;
  speed: PlaybackSpeed;
  duration: number;
  onSelectedChange: (driver: string) => void;
  onRoundChange: (round: QualifyingRound) => void;
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (time: number) => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
};

function QualifyingReplayView({
  season,
  event,
  session,
  summary,
  replay,
  telemetry,
  selected,
  selectedRound,
  playing,
  time,
  speed,
  duration,
  onSelectedChange,
  onRoundChange,
  onPlayingChange,
  onTimeChange,
  onSpeedChange,
}: QualifyingReplayProps) {
  const drivers = useMemo(
    () => [...summary.drivers].sort((a, b) => (a.finishing_position ?? 999) - (b.finishing_position ?? 999)),
    [summary.drivers],
  );
  const selectedDriver = drivers.find((driver) => driver.abbreviation === selected) ?? drivers[0] ?? null;
  const bestTime = qualifyingRoundTime(selectedDriver, selectedRound) ?? bestQualifyingLapTime(selectedDriver);
  const stage = selectedDriver ? qualifyingStageLabel(selectedDriver) : "--";
  const weather = weatherSnapshot(summary);
  const safeDuration = Math.max(duration, bestTime ?? 0, 1);
  const points = telemetry?.points ?? [];
  const currentTelemetry = telemetryPointAtTime(points, Math.min(time, safeDuration));

  return (
    <main className="min-h-screen bg-pitwall">
      <section className="relative h-screen min-h-[660px] w-full overflow-hidden border-b border-border bg-black">
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-1.5 backdrop-blur">
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary font-mono text-[10px] font-bold text-primary-foreground">F1</span>
            <span className="font-mono text-xs">
              <span className="font-semibold">{event}</span>
              <span className="px-1.5 text-muted-foreground">/</span>
              <span className="text-muted-foreground">{season}</span>
              <span className="px-1.5 text-muted-foreground">/</span>
              <span className="text-primary">{session}</span>
            </span>
            <Link to="/" className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Session</Link>
            <Link to="/model" className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">Model</Link>
          </div>
        </div>

        <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
          <HudMetric label="Run time" value={formatSeconds(Math.min(time, safeDuration))} />
          <HudMetric label="Best lap" value={formatLapTime(bestTime)} />
          <HudMetric label="Speed" value={`${speed}x`} />
        </div>

        <div className="absolute bottom-40 left-3 top-24 z-20 flex w-[280px] flex-col gap-2 overflow-y-auto max-lg:hidden">
          <WeatherCard weather={weather} />
          {selectedDriver ? (
            <div className="rounded-md border border-border bg-card/90 p-3 backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected lap</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-lg font-bold">{selectedDriver.abbreviation}</span>
                <span className={cn("font-mono text-xs uppercase", qualifyingStageTone(stage))}>{selectedRound?.toUpperCase() ?? stage}</span>
              </div>
              <TeamSwatch team={selectedDriver.team_name} className="text-xs text-muted-foreground" />
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Mini label="Speed" value={formatMetric(currentTelemetry?.speed)} />
                <Mini label="Gear" value={formatMetric(currentTelemetry?.gear)} />
                <Mini label="DRS" value={formatDrs(currentTelemetry?.drs)} />
              </div>
              <QualifyingInputTrace points={points} time={Math.min(time, safeDuration)} />
              <QualifyingRoundSelector
                driver={selectedDriver}
                selectedRound={selectedRound}
                onSelect={(round) => {
                  onRoundChange(round);
                  onTimeChange(0);
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-40 right-3 top-24 z-20 w-[300px] max-lg:hidden">
          <QualifyingOrderPanel
            drivers={drivers}
            selected={selectedDriver?.abbreviation ?? null}
            selectedRound={selectedRound}
            onSelect={(driver, round) => {
              onSelectedChange(driver);
              onRoundChange(round);
              onTimeChange(0);
            }}
          />
        </div>

        <div className="absolute bottom-32 left-[312px] right-[332px] top-16 z-0 flex items-center justify-center max-lg:bottom-36 max-lg:left-3 max-lg:right-3 max-lg:top-24">
          <div className="h-full w-full">
            <QualifyingLapCanvas
              points={points}
              replayTrack={replay?.track ?? []}
              time={Math.min(time, safeDuration)}
              driver={selectedDriver?.abbreviation ?? telemetry?.driver ?? ""}
              team={selectedDriver?.team_name}
              onSeek={onTimeChange}
            />
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 z-20">
          <ReplayControls
            playing={playing}
            onPlayPause={() => onPlayingChange(!playing)}
            time={Math.min(time, safeDuration)}
            duration={safeDuration}
            onSeek={onTimeChange}
            speed={speed}
            onSpeedChange={onSpeedChange}
            segments={[]}
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <QualifyingOverviewTable drivers={drivers} />
      </section>
    </main>
  );
}

function QualifyingOrderPanel({
  drivers,
  selected,
  selectedRound,
  onSelect,
}: {
  drivers: DriverSummary[];
  selected: string | null;
  selectedRound: QualifyingRound | null;
  onSelect: (driver: string, round: QualifyingRound) => void;
}) {
  return (
    <aside className="h-full overflow-hidden rounded-md border border-border bg-card/90 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Qualifying order</h3>
        <span className="font-mono text-[10px] text-muted-foreground">Q</span>
      </div>
      <div className="h-[calc(100%-37px)] overflow-y-auto">
        {drivers.map((driver) => {
          const stage = qualifyingStageLabel(driver);
          const rounds = availableQualifyingRounds(driver);
          return (
            <div
              key={driver.abbreviation}
              className={cn(
                "border-b border-border/70 px-3 py-2 transition-colors hover:bg-secondary/40",
                selected === driver.abbreviation && "bg-primary/10",
              )}
            >
              <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{String(driver.finishing_position ?? "--").padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-semibold">{driver.abbreviation}</span>
                  <TeamSwatch team={driver.team_name} className="mt-0.5 text-[10px] text-muted-foreground" />
                </span>
                <span className={cn("text-right font-mono text-[9px] uppercase", qualifyingStageTone(stage))}>{stage}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {rounds.map((round) => (
                  <button
                    key={round}
                    type="button"
                    onClick={() => onSelect(driver.abbreviation, round)}
                    className={cn(
                      "rounded-sm border border-border bg-background/70 px-1.5 py-1 text-left transition-colors hover:border-primary",
                      selected === driver.abbreviation && selectedRound === round && "border-primary bg-primary/15",
                    )}
                  >
                    <span className="block font-mono text-[9px] uppercase text-muted-foreground">{round}</span>
                    <span className="block font-mono text-[10px] tabular-nums">{formatLapTime(qualifyingRoundTime(driver, round))}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function QualifyingRoundSelector({
  driver,
  selectedRound,
  onSelect,
}: {
  driver: DriverSummary;
  selectedRound: QualifyingRound | null;
  onSelect: (round: QualifyingRound) => void;
}) {
  const rounds = availableQualifyingRounds(driver);
  if (rounds.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {rounds.map((round) => (
        <button
          key={round}
          type="button"
          onClick={() => onSelect(round)}
          className={cn(
            "rounded-sm border border-border bg-background/70 px-2 py-1.5 text-left transition-colors hover:border-primary",
            selectedRound === round && "border-primary bg-primary/15",
          )}
        >
          <span className="block font-mono text-[9px] uppercase text-muted-foreground">{round}</span>
          <span className="block font-mono text-xs tabular-nums">{formatLapTime(qualifyingRoundTime(driver, round))}</span>
        </button>
      ))}
    </div>
  );
}

function QualifyingInputTrace({ points, time }: { points: TelemetryPoint[]; time: number }) {
  const trace = useMemo(() => qualifyingInputTrace(points, time), [points, time]);
  const current = telemetryPointAtTime(points, time);
  const throttle = normalizePercent(current?.throttle);
  const brake = normalizePercent(current?.brake);
  const cursorX = trace.cursorX ?? 0;

  return (
    <div className="mt-3 rounded-sm border border-border bg-background/65 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Throttle / Brake</span>
        <span className="font-mono text-[10px] tabular-nums">
          <span className="text-emerald-300">THR {throttle == null ? "--" : Math.round(throttle)}</span>
          <span className="px-1 text-muted-foreground">/</span>
          <span className="text-red-300">BRK {brake == null ? "--" : Math.round(brake)}</span>
        </span>
      </div>
      <div className="mt-2 h-24 overflow-hidden rounded-sm bg-black/35">
        <svg viewBox="0 0 260 96" preserveAspectRatio="none" className="h-full w-full">
          <path d="M0 24 H260 M0 48 H260 M0 72 H260" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <path d={`M${cursorX.toFixed(2)} 0 V96`} stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
          {trace.throttle.length > 1 ? (
            <polyline
              points={trace.throttle.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
              fill="none"
              stroke="#00ff41"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {trace.brake.length > 1 ? (
            <polyline
              points={trace.brake.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
              fill="none"
              stroke="#ff2d3d"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          <circle cx={cursorX} cy={trace.currentThrottleY ?? 94} r="2.5" fill="#00ff41" />
          <circle cx={cursorX} cy={trace.currentBrakeY ?? 94} r="2.5" fill="#ff2d3d" />
        </svg>
      </div>
    </div>
  );
}

function QualifyingLapCanvas({
  points,
  replayTrack,
  time,
  driver,
  team,
  onSeek,
}: {
  points: TelemetryPoint[];
  replayTrack: { x: number; y: number }[];
  time: number;
  driver: string;
  team?: string;
  onSeek: (time: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackPoints = useMemo(() => qualifyingTrackPoints(points, replayTrack), [points, replayTrack]);
  const bounds = useMemo(() => boundsFor(trackPoints), [trackPoints]);
  const currentPoint = useMemo(() => telemetryPointAtTime(points, time), [points, time]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    drawQualifyingBackground(ctx, width, height);
    drawQualifyingTrack(ctx, trackPoints, bounds, width, height);
    drawCompletedLap(ctx, points, time, bounds, width, height, teamColor(team));

    if (currentPoint && hasPosition(currentPoint)) {
      drawQualifyingMarker(ctx, currentPoint, driver, teamColor(team), bounds, width, height);
    }
  }, [bounds, currentPoint, driver, points, team, time, trackPoints]);

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || trackPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest: TelemetryPoint | null = null;
    let distance = Number.POSITIVE_INFINITY;
    trackPoints.forEach((point) => {
      const scaled = scaleQualifyingPoint(point.x, point.y, bounds, width, height);
      const hit = Math.hypot(scaled.x - x, scaled.y - y);
      if (hit < distance) {
        nearest = point;
        distance = hit;
      }
    });
    const nearestPoint = nearest as TelemetryPoint | null;
    if (nearestPoint && distance < 34 && Number.isFinite(nearestPoint.time)) onSeek(nearestPoint.time);
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="block h-full w-full"
    />
  );
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/90 px-3 py-1.5 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-background/60 px-1 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

type InactiveDriver = {
  abbreviation: string;
  team: string | undefined;
  status: string;
};

function InactiveDriverRail({ drivers }: { drivers: InactiveDriver[] }) {
  if (drivers.length === 0) return null;
  return (
    <aside className="max-h-44 overflow-y-auto rounded-md border border-red-500/30 bg-card/90 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300">Out / inactive</h3>
        <span className="font-mono text-[10px] text-muted-foreground">{drivers.length}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {drivers.map((driver) => (
          <div
            key={driver.abbreviation}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 rounded-sm border border-border bg-background/70 px-2 py-1.5"
            style={{ borderLeft: `3px solid ${teamColor(driver.team)}` }}
          >
            <span className="font-mono text-sm font-semibold">{driver.abbreviation}</span>
            <span className="truncate text-right text-[10px] uppercase tracking-wider text-red-200">{driver.status}</span>
            <span className="col-span-2 truncate text-[10px] text-muted-foreground">{driver.team ?? "--"}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function rowsForFrame(frame: { leaderboard?: LeaderboardRow[] } | null, fallbackRows: LeaderboardRow[]) {
  const source = frame?.leaderboard?.length ? frame.leaderboard : fallbackRows;
  return [...source].sort((a, b) => a.position - b.position).slice(0, 20);
}

function currentCarForDriver(cars: ReplayCar[], driver: string | null) {
  if (!driver) return null;
  return cars.find((car) => car.driver === driver) ?? null;
}

function inactiveDriverRows(summary: SessionSummary | null, cars: ReplayCar[]): InactiveDriver[] {
  const active = new Set(cars.map((car) => car.driver));
  return (summary?.drivers ?? [])
    .flatMap((driver) => {
      const status = normalizeDriverStatus(driver);
      const missingLiveCar = !active.has(driver.abbreviation);
      if (!isInactiveStatus(status) && !missingLiveCar) return [];
      return [{
        abbreviation: driver.abbreviation,
        team: driver.team_name,
        status: isInactiveStatus(status) ? status : "No live position",
      }];
    })
    .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
}

function normalizeDriverStatus(driver: DriverSummary) {
  const raw = driver.status?.trim();
  if (raw) return raw;
  return driver.finishing_position == null ? "Not classified" : "Running";
}

function isInactiveStatus(status: string) {
  const normalized = status.toLowerCase();
  if (
    normalized === "finished" ||
    normalized === "running" ||
    normalized.startsWith("+") ||
    normalized.includes("lap")
  ) {
    return false;
  }
  return [
    "dnf",
    "retired",
    "accident",
    "collision",
    "engine",
    "gearbox",
    "hydraulic",
    "electrical",
    "brake",
    "suspension",
    "transmission",
    "puncture",
    "overheating",
    "spun",
    "disqualified",
    "not classified",
    "withdrawn",
  ].some((term) => normalized.includes(term));
}

function teamMap(summary: SessionSummary | null) {
  const map: Record<string, string> = {};
  summary?.drivers.forEach((driver) => {
    map[driver.abbreviation] = driver.team_name ?? "";
  });
  return map;
}

function weatherSnapshot(summary: SessionSummary | null) {
  const first = summary?.weather?.[0] ?? null;
  if (!first) return null;
  return {
    track_temp: numberFromUnknown(first.TrackTemp),
    air_temp: numberFromUnknown(first.AirTemp),
    humidity: numberFromUnknown(first.Humidity),
    rainfall: first.Rainfall === true || first.Rainfall === 1 || first.Rainfall === "True",
  };
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function nextSpeed(current: PlaybackSpeed, direction: 1 | -1): PlaybackSpeed {
  const index = SPEEDS.indexOf(current);
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + direction))];
}

function formatMetric(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "--";
}

function formatDrs(value?: number) {
  return typeof value === "number" && [10, 12, 14].includes(Math.round(value)) ? "ON" : "--";
}

function formatGap(row: LeaderboardRow) {
  if (row.position === 1) return "LEADER";
  return typeof row.gap_to_leader === "number" && Number.isFinite(row.gap_to_leader) ? `+${formatGapDuration(row.gap_to_leader)}` : "--";
}

function formatGapDuration(value: number) {
  const totalMilliseconds = Math.max(0, Math.round(value * 1000));
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

const RECENT_SESSION_KEY = "f1_recent_session";

function writeRecentSession(value: { season: number; event: string; session: string }) {
  try {
    window.localStorage.setItem(RECENT_SESSION_KEY, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in private browser contexts.
  }
}

function qualifyingPlaybackDuration(telemetry: TelemetryResponse | null) {
  const pointDuration = Math.max(
    0,
    ...(telemetry?.points ?? [])
      .map((point) => point.time)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  if (pointDuration > 0) return Math.ceil(pointDuration);

  const fastestLap = Math.min(
    Number.POSITIVE_INFINITY,
    ...(telemetry?.lap_times ?? [])
      .map((lap) => lap.lap_time_seconds)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0),
  );
  return Number.isFinite(fastestLap) ? Math.ceil(fastestLap) : 0;
}

function bestQualifyingLapTime(driver: DriverSummary | null) {
  if (!driver) return undefined;
  if (driver.qualifying_stage === "Q3") return driver.q3_time_seconds ?? driver.q2_time_seconds ?? driver.q1_time_seconds;
  if (driver.qualifying_stage === "Q2") return driver.q2_time_seconds ?? driver.q1_time_seconds;
  if (driver.qualifying_stage === "Q1") return driver.q1_time_seconds;
  return driver.q3_time_seconds ?? driver.q2_time_seconds ?? driver.q1_time_seconds;
}

function availableQualifyingRounds(driver: DriverSummary | null): QualifyingRound[] {
  if (!driver) return [];
  return ([
    ["q1", driver.q1_time_seconds],
    ["q2", driver.q2_time_seconds],
    ["q3", driver.q3_time_seconds],
  ] as const).flatMap(([round, value]) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? [round] : []));
}

function qualifyingRoundTime(driver: DriverSummary | null, round: QualifyingRound | null) {
  if (!driver || !round) return undefined;
  if (round === "q1") return driver.q1_time_seconds;
  if (round === "q2") return driver.q2_time_seconds;
  return driver.q3_time_seconds;
}

function preferredQualifyingRound(driver: DriverSummary | null, current: QualifyingRound | null): QualifyingRound | null {
  const rounds = availableQualifyingRounds(driver);
  if (current && rounds.includes(current)) return current;
  return rounds[rounds.length - 1] ?? null;
}

function qualifyingStageLabel(driver: DriverSummary) {
  if (driver.qualifying_stage === "Q3") return "Q3";
  if (driver.qualifying_stage === "Q2") return "Out Q2";
  if (driver.qualifying_stage === "Q1") return "Out Q1";
  return driver.status ?? "No time";
}

function qualifyingStageTone(stage: string) {
  if (stage === "Q3") return "text-emerald-300";
  if (stage === "Out Q2") return "text-yellow-300";
  if (stage === "Out Q1") return "text-red-300";
  return "text-muted-foreground";
}

function hasPosition(point: TelemetryPoint): point is TelemetryPoint & { x: number; y: number } {
  return typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y);
}

function qualifyingTrackPoints(points: TelemetryPoint[], replayTrack: { x: number; y: number }[]) {
  const telemetryTrack = points
    .filter(hasPosition)
    .sort((a, b) => {
      const distanceA = numericValue(a.relative_distance) ?? numericValue(a.distance) ?? numericValue(a.time) ?? 0;
      const distanceB = numericValue(b.relative_distance) ?? numericValue(b.distance) ?? numericValue(b.time) ?? 0;
      return distanceA - distanceB;
    });
  if (telemetryTrack.length > 3) return telemetryTrack;
  return replayTrack
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point, index) => ({ ...point, time: index }));
}

function telemetryPointAtTime(points: TelemetryPoint[], time: number): TelemetryPoint | null {
  const positioned = points
    .filter(hasPosition)
    .filter((point) => typeof point.time === "number" && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  if (positioned.length === 0) return telemetryChannelsAtTime(points, time);
  if (time <= positioned[0].time) return { ...positioned[0], ...telemetryChannelsAtTime(points, time) };
  const last = positioned[positioned.length - 1];
  if (time >= last.time) return { ...last, ...telemetryChannelsAtTime(points, time) };

  for (let index = 1; index < positioned.length; index += 1) {
    const next = positioned[index];
    if (next.time < time) continue;
    const previous = positioned[index - 1];
    const span = Math.max(next.time - previous.time, 0.001);
    const t = (time - previous.time) / span;
    return { ...interpolateTelemetry(previous, next, t), ...telemetryChannelsAtTime(points, time) };
  }
  return { ...last, ...telemetryChannelsAtTime(points, time) };
}

function telemetryChannelsAtTime(points: TelemetryPoint[], time: number): TelemetryPoint | null {
  const sample: TelemetryPoint = { time };
  let hasChannel = false;
  for (const field of ["speed", "throttle", "brake", "rpm", "distance", "relative_distance"] as const) {
    const value = interpolatedChannel(points, time, field);
    if (value != null) {
      sample[field] = value;
      hasChannel = true;
    }
  }
  const gear = nearestChannel(points, time, "gear");
  if (gear != null) {
    sample.gear = Math.round(gear);
    hasChannel = true;
  }
  const drs = nearestChannel(points, time, "drs");
  if (drs != null) {
    sample.drs = Math.round(drs);
    hasChannel = true;
  }
  return hasChannel ? sample : null;
}

function interpolatedChannel(points: TelemetryPoint[], time: number, field: "speed" | "throttle" | "brake" | "rpm" | "distance" | "relative_distance") {
  const channel = points
    .map((point) => ({ time: numericValue(point.time), value: numericValue(point[field]) }))
    .filter((point): point is { time: number; value: number } => point.time !== undefined && point.value !== undefined)
    .sort((a, b) => a.time - b.time);
  if (channel.length === 0) return undefined;
  if (time <= channel[0].time) return channel[0].value;
  const last = channel[channel.length - 1];
  if (time >= last.time) return last.value;
  for (let index = 1; index < channel.length; index += 1) {
    const next = channel[index];
    if (next.time < time) continue;
    const previous = channel[index - 1];
    const span = Math.max(next.time - previous.time, 0.001);
    return previous.value + (next.value - previous.value) * ((time - previous.time) / span);
  }
  return last.value;
}

function nearestChannel(points: TelemetryPoint[], time: number, field: "gear" | "drs") {
  let nearest: number | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point) => {
    const pointTime = numericValue(point.time);
    const value = numericValue(point[field]);
    if (pointTime === undefined || value === undefined) return;
    const distance = Math.abs(pointTime - time);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = value;
    }
  });
  return nearest;
}

function interpolateTelemetry(a: TelemetryPoint & { x: number; y: number }, b: TelemetryPoint & { x: number; y: number }, t: number) {
  return {
    time: a.time + (b.time - a.time) * t,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    speed: interpolateOptional(a.speed, b.speed, t),
    throttle: interpolateOptional(a.throttle, b.throttle, t),
    brake: interpolateOptional(a.brake, b.brake, t),
    rpm: interpolateOptional(a.rpm, b.rpm, t),
    gear: typeof b.gear === "number" ? b.gear : a.gear,
    drs: typeof b.drs === "number" ? b.drs : a.drs,
    distance: interpolateOptional(a.distance, b.distance, t),
    relative_distance: interpolateOptional(a.relative_distance, b.relative_distance, t),
  };
}

function interpolateOptional(a: number | undefined, b: number | undefined, t: number) {
  if (typeof a === "number" && Number.isFinite(a) && typeof b === "number" && Number.isFinite(b)) return a + (b - a) * t;
  if (typeof b === "number" && Number.isFinite(b)) return b;
  if (typeof a === "number" && Number.isFinite(a)) return a;
  return undefined;
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

function qualifyingInputTrace(points: TelemetryPoint[], time: number) {
  const ordered = points
    .filter((point) => typeof point.time === "number" && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  if (ordered.length === 0) {
    return { throttle: [], brake: [], cursorX: 0, currentThrottleY: undefined, currentBrakeY: undefined };
  }

  const hasRelativeDistance = ordered.some((point) => typeof point.relative_distance === "number" && Number.isFinite(point.relative_distance));
  const maxTime = Math.max(1, ...ordered.map((point) => point.time));
  const elapsed = ordered.filter((point) => point.time <= time);
  const current = telemetryPointAtTime(points, time);
  const cursorX = traceX(current ?? elapsed[elapsed.length - 1] ?? ordered[0], hasRelativeDistance, maxTime);

  const throttle = elapsed.flatMap((point) => {
    const value = normalizePercent(point.throttle);
    return value == null ? [] : [{ x: traceX(point, hasRelativeDistance, maxTime), y: traceY(value) }];
  });
  const brake = elapsed.flatMap((point) => {
    const value = normalizePercent(point.brake);
    return value == null ? [] : [{ x: traceX(point, hasRelativeDistance, maxTime), y: traceY(value) }];
  });
  const currentThrottle = normalizePercent(current?.throttle);
  const currentBrake = normalizePercent(current?.brake);

  return {
    throttle,
    brake,
    cursorX,
    currentThrottleY: currentThrottle == null ? undefined : traceY(currentThrottle),
    currentBrakeY: currentBrake == null ? undefined : traceY(currentBrake),
  };
}

function traceX(point: TelemetryPoint, useRelativeDistance: boolean, maxTime: number) {
  const fraction = useRelativeDistance && typeof point.relative_distance === "number" && Number.isFinite(point.relative_distance)
    ? point.relative_distance
    : point.time / maxTime;
  return Math.max(0, Math.min(260, fraction * 260));
}

function traceY(percent: number) {
  return Math.max(4, Math.min(92, 92 - (percent / 100) * 86));
}

function boundsFor(points: { x: number; y: number }[]) {
  if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function scaleQualifyingPoint(x: number, y: number, bounds: ReturnType<typeof boundsFor>, width: number, height: number) {
  const pad = Math.max(42, Math.min(width, height) * 0.08);
  const rangeX = Math.max(bounds.maxX - bounds.minX, 1);
  const rangeY = Math.max(bounds.maxY - bounds.minY, 1);
  return {
    x: pad + ((x - bounds.minX) / rangeX) * (width - pad * 2),
    y: height - pad - ((y - bounds.minY) / rangeY) * (height - pad * 2),
  };
}

function drawQualifyingBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, Math.max(width, height) * 0.72);
  gradient.addColorStop(0, "#111318");
  gradient.addColorStop(0.55, "#050609");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 58) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 58) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawQualifyingTrack(
  ctx: CanvasRenderingContext2D,
  track: { x: number; y: number }[],
  bounds: ReturnType<typeof boundsFor>,
  width: number,
  height: number,
) {
  if (track.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 13px Inter, sans-serif";
    ctx.fillText("Select a driver with telemetry to draw the qualifying lap.", 28, 42);
    return;
  }
  drawQualifyingPolyline(ctx, track, bounds, width, height, {
    color: "rgba(255, 255, 255, 0.13)",
    width: 28,
    shadowBlur: 22,
    shadowColor: "rgba(255,255,255,0.18)",
  });
  drawQualifyingPolyline(ctx, track, bounds, width, height, { color: "#181c22", width: 20 });
  drawQualifyingPolyline(ctx, track, bounds, width, height, { color: "#d7d7d7", width: 4 });
  drawQualifyingPolyline(ctx, track, bounds, width, height, { color: "rgba(255,255,255,0.88)", width: 1.5 });
  drawQualifyingSector(ctx, track, 0.18, bounds, width, height);
  drawQualifyingSector(ctx, track, 0.46, bounds, width, height);
  drawQualifyingSector(ctx, track, 0.72, bounds, width, height);
  drawQualifyingFinishLine(ctx, track, bounds, width, height);
}

function drawQualifyingPolyline(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  bounds: ReturnType<typeof boundsFor>,
  width: number,
  height: number,
  style: { color: string; width: number; shadowBlur?: number; shadowColor?: string },
) {
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = style.shadowBlur ?? 0;
  ctx.shadowColor = style.shadowColor ?? "transparent";
  ctx.beginPath();
  points.forEach((point, index) => {
    const scaled = scaleQualifyingPoint(point.x, point.y, bounds, width, height);
    if (index === 0) ctx.moveTo(scaled.x, scaled.y);
    else ctx.lineTo(scaled.x, scaled.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawQualifyingSector(
  ctx: CanvasRenderingContext2D,
  track: { x: number; y: number }[],
  start: number,
  bounds: ReturnType<typeof boundsFor>,
  width: number,
  height: number,
) {
  const startIndex = Math.floor(track.length * start);
  const endIndex = Math.min(track.length - 1, startIndex + Math.floor(track.length * 0.08));
  if (endIndex <= startIndex) return;
  ctx.save();
  ctx.strokeStyle = "#00ff41";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.shadowColor = "#00ff41";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let index = startIndex; index <= endIndex; index += 1) {
    const scaled = scaleQualifyingPoint(track[index].x, track[index].y, bounds, width, height);
    if (index === startIndex) ctx.moveTo(scaled.x, scaled.y);
    else ctx.lineTo(scaled.x, scaled.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCompletedLap(
  ctx: CanvasRenderingContext2D,
  points: TelemetryPoint[],
  time: number,
  bounds: ReturnType<typeof boundsFor>,
  width: number,
  height: number,
  color: string,
) {
  const completed = points
    .filter(hasPosition)
    .filter((point) => typeof point.time === "number" && Number.isFinite(point.time) && point.time <= time)
    .sort((a, b) => a.time - b.time);
  if (completed.length < 2) return;
  drawQualifyingPolyline(ctx, completed, bounds, width, height, {
    color,
    width: 5,
    shadowBlur: 13,
    shadowColor: color,
  });
}

function drawQualifyingFinishLine(
  ctx: CanvasRenderingContext2D,
  track: { x: number; y: number }[],
  bounds: ReturnType<typeof boundsFor>,
  width: number,
  height: number,
) {
  if (track.length < 3) return;
  const first = scaleQualifyingPoint(track[0].x, track[0].y, bounds, width, height);
  const next = scaleQualifyingPoint(track[Math.min(3, track.length - 1)].x, track[Math.min(3, track.length - 1)].y, bounds, width, height);
  const dx = next.x - first.x;
  const dy = next.y - first.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(first.x - nx * 16, first.y - ny * 16);
  ctx.lineTo(first.x + nx * 16, first.y + ny * 16);
  ctx.stroke();
  ctx.restore();
}

function drawQualifyingMarker(
  ctx: CanvasRenderingContext2D,
  point: TelemetryPoint & { x: number; y: number },
  driver: string,
  color: string,
  bounds: ReturnType<typeof boundsFor>,
  width: number,
  height: number,
) {
  const scaled = scaleQualifyingPoint(point.x, point.y, bounds, width, height);
  ctx.save();
  ctx.translate(scaled.x, scaled.y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  roundedQualifyingRect(ctx, -9, -5, 18, 10, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  roundedQualifyingRect(ctx, 2, -2.5, 5, 5, 2);
  ctx.fill();
  ctx.restore();

  if (driver) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaled.x + 8, scaled.y - 8);
    ctx.lineTo(scaled.x + 25, scaled.y - 22);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    roundedQualifyingRect(ctx, scaled.x + 22, scaled.y - 36, 46, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 13px Inter, sans-serif";
    ctx.fillText(driver, scaled.x + 31, scaled.y - 20);
    ctx.restore();
  }
}

function roundedQualifyingRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
