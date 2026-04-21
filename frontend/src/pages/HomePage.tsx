import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { MetricCard } from "@/components/f1/MetricCard";
import { QualifyingOverviewTable } from "@/components/f1/QualifyingOverviewTable";
import { SessionOverviewTable } from "@/components/f1/SessionOverviewTable";
import { SessionSelector, type SessionSelectorValue } from "@/components/f1/SessionSelector";
import { cn } from "@/lib/utils";
import type { SessionSummary } from "@/types/f1";

const PRIMARY_BTN =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-progress disabled:opacity-60";
const GHOST_BTN =
  "inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-progress disabled:opacity-60";

export function HomePage() {
  const [sel, setSelState] = useState<SessionSelectorValue>(() => readRecentSession());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [status, setStatus] = useState<{ kind: "info" | "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<number | null>(null);

  const setSel = (next: SessionSelectorValue) => {
    setSelState(next);
    writeRecentSession(next);
  };

  const loadSummary = async () => {
    setLoading(true);
    setStatus({ kind: "info", text: `Loading ${sel.season} ${sel.event} ${sel.session}...` });
    try {
      const data = await api.summary(sel.season, sel.event, sel.session);
      setSummary(data);
      setStatus({ kind: "ok", text: `Loaded ${data.driver_count} drivers and ${data.total_laps} laps.` });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Could not load summary." });
    } finally {
      setLoading(false);
    }
  };

  const onIngest = async () => {
    setLoading(true);
    setIngestProgress(8);
    const timer = window.setInterval(() => {
      setIngestProgress((current) => {
        if (current == null) return current;
        return Math.min(92, current + Math.max(1, (92 - current) * 0.08));
      });
    }, 700);
    const ingestLabel = sel.session === "R" ? "race and qualifying" : sel.session;
    setStatus({ kind: "info", text: `Ingesting ${ingestLabel} data from FastF1. First run can take a few minutes.` });
    try {
      const result = await api.ingest(sel.season, sel.event, sel.session);
      const data = await api.summary(sel.season, sel.event, sel.session);
      setSummary(data);
      setIngestProgress(100);
      setStatus({ kind: "ok", text: `${result.status}: ${result.message ?? "Artifacts are ready."}` });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Ingest failed." });
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => setIngestProgress(null), 700);
      setLoading(false);
    }
  };

  const replayUrl = `/replay?season=${sel.season}&event=${encodeURIComponent(sel.event)}&session=${sel.session}`;
  const weather = weatherSnapshot(summary);

  return (
    <main className="min-h-screen bg-pitwall">
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:py-12">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">
              Pit-wall - session intelligence
            </span>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              F1 Analytics<span className="text-primary">.</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ingest historical race sessions from FastF1, replay them on a 2D circuit map, inspect
              telemetry frame by frame, and predict future finishing orders.
            </p>
          </div>

          <div className="mt-6">
            <div className="rounded-md border border-border bg-card p-4">
              <SessionSelector value={sel} onChange={setSel} />
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={PRIMARY_BTN} onClick={loadSummary} disabled={loading}>
                  {loading ? "Loading..." : "Load summary"}
                </button>
                <button className={GHOST_BTN} onClick={onIngest} disabled={loading}>
                  {sel.session === "R" ? "Ingest race + qualifying" : "Ingest selected session"}
                </button>
                <Link to={replayUrl} className={cn(GHOST_BTN, "ml-auto")}>Open replay</Link>
              </div>
              {ingestProgress != null ? <IngestProgress value={ingestProgress} /> : null}
              {status ? <StatusMessage status={status} /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Drivers" value={summary?.driver_count ?? "--"} hint={summary ? summary.event : "Load a session"} />
          <MetricCard label="Total laps" value={summary?.total_laps ?? "--"} hint={summary ? `${summary.session} session` : "--"} />
          <MetricCard
            label="Replay"
            value={summary?.has_replay ? "Ready" : "Missing"}
            tone={summary?.has_replay ? "good" : "bad"}
            hint={summary?.has_replay ? "Track map available" : "Run ingest first"}
          />
          <MetricCard
            label="Weather"
            value={summary?.has_weather ? "Ready" : "Missing"}
            tone={summary?.has_weather ? "good" : "warn"}
            hint={weather?.track_temp ? `${weather.track_temp.toFixed(1)} C track` : "--"}
          />
        </div>

        <div className="mt-6">
          {summary ? (
            sel.session === "Q" ? (
              <QualifyingOverviewTable drivers={summary.drivers} />
            ) : (
              <SessionOverviewTable drivers={summary.drivers} />
            )
          ) : (
            <Skeleton h={400} />
          )}
        </div>
      </section>
    </main>
  );
}

function IngestProgress({ value }: { value: number }) {
  return (
    <div className="mt-4 rounded-sm border border-border bg-background/70 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Ingest progress</span>
        <span className="font-mono tabular-nums">{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function StatusMessage({ status }: { status: { kind: "info" | "ok" | "err"; text: string } }) {
  return (
    <div
      className={cn(
        "mt-3 rounded-sm border px-3 py-2 text-xs",
        status.kind === "info" && "border-border bg-secondary text-muted-foreground",
        status.kind === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        status.kind === "err" && "border-red-500/30 bg-red-500/10 text-red-300",
      )}
    >
      {status.text}
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return <div className="animate-pulse rounded-md border border-border bg-card" style={{ height: h }} />;
}

function weatherSnapshot(summary: SessionSummary | null) {
  const first = summary?.weather?.[0] ?? null;
  if (!first) return null;
  const track_temp = numberFromUnknown(first.TrackTemp);
  const air_temp = numberFromUnknown(first.AirTemp);
  const humidity = numberFromUnknown(first.Humidity);
  const rainfall = first.Rainfall === true || first.Rainfall === 1 || first.Rainfall === "True";
  return { track_temp, air_temp, humidity, rainfall };
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

const RECENT_SESSION_KEY = "f1_recent_session";

function readRecentSession(): SessionSelectorValue {
  const fallback = { season: 2025, event: "Monaco Grand Prix", session: "R" };
  try {
    const raw = window.localStorage.getItem(RECENT_SESSION_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SessionSelectorValue>;
    return {
      season: typeof parsed.season === "number" ? parsed.season : fallback.season,
      event: typeof parsed.event === "string" && parsed.event ? parsed.event : fallback.event,
      session: typeof parsed.session === "string" && parsed.session ? parsed.session : fallback.session,
    };
  } catch {
    return fallback;
  }
}

function writeRecentSession(value: SessionSelectorValue) {
  try {
    window.localStorage.setItem(RECENT_SESSION_KEY, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in private browser contexts.
  }
}
