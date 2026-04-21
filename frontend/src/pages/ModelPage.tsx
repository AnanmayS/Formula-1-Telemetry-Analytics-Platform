import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PredictionCard } from "@/components/f1/PredictionCard";
import { PredictionTable } from "@/components/f1/PredictionTable";
import { cn } from "@/lib/utils";
import type { EventOption, PredictionResponse } from "@/types/f1";

const PRIMARY_BTN =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-progress disabled:opacity-60";
const SELECT_CLASS =
  "h-10 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary";

const currentSeason = new Date().getFullYear();
const predictionSeasons = [currentSeason, currentSeason + 1];

export function ModelPage() {
  const [season, setSeason] = useState<number>(currentSeason);
  const [event, setEvent] = useState<string>("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [pred, setPred] = useState<PredictionResponse | null>(null);
  const [status, setStatus] = useState<{ kind: "info" | "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    setEventsLoading(true);
    setPred(null);
    api
      .events(season)
      .then((items) => {
        const future = futureRaceEvents(items, season);
        setEvents(future);
        setEvent((selected) => (future.some((item) => item.event_name === selected) ? selected : future[0]?.event_name ?? ""));
        if (future.length === 0) {
          setStatus({ kind: "err", text: `No future race schedule is available for ${season}.` });
        }
      })
      .catch((err) => {
        setEvents([]);
        setEvent("");
        setStatus({ kind: "err", text: `Could not load ${season} race schedule: ${err.message}` });
      })
      .finally(() => setEventsLoading(false));
  }, [season]);

  const onPredict = async () => {
    if (!event) {
      setStatus({ kind: "err", text: "Choose a future race before running predictions." });
      return;
    }
    setLoading(true);
    setStatus({ kind: "info", text: `Predicting ${season} ${event}...` });
    try {
      const result = await api.predictions(season, event, "R");
      setPred(result);
      setStatus({ kind: "ok", text: `Model ${result.model_version ?? "saved"} returned ${result.predictions.length} predictions.` });
    } catch (err) {
      setPred(null);
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Prediction failed." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-pitwall">
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">
            Race predictor
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            Race Predictor<span className="text-primary">.</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Predict the final finishing order for an upcoming Grand Prix using current-field priors,
            historical race artifacts, driver form, team form, weather, and circuit context.
          </p>

          <div className="mt-6 rounded-md border border-border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Year">
                <select className={SELECT_CLASS} value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                  {predictionSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Race">
                <select
                  className={SELECT_CLASS}
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  disabled={eventsLoading || events.length === 0}
                >
                  {events.map((item) => <option key={item.event_name} value={item.event_name}>{item.event_name}</option>)}
                </select>
              </Field>
              <div className="flex items-end">
                <button className={PRIMARY_BTN + " w-full"} onClick={onPredict} disabled={loading || !event}>
                  {loading ? "Predicting..." : "Predict final order"}
                </button>
              </div>
            </div>
            {status ? <StatusMessage status={status} /> : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {pred ? (
          <>
            <PredictionTable rows={pred.final_grid} />
            <h3 className="mt-8 text-sm font-semibold">Per-driver prediction cards</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Each card shows expected delta, gain probability, model confidence, and the top contributing features.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pred.predictions
                .slice()
                .sort((a, b) => (a.predicted_finishing_position ?? 999) - (b.predicted_finishing_position ?? 999))
                .map((row) => <PredictionCard key={row.driver} row={row} />)}
            </div>
          </>
        ) : (
          <div className="h-96 animate-pulse rounded-md border border-border bg-card" />
        )}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </label>
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

function futureRaceEvents(events: EventOption[], season: number) {
  const today = new Date();
  const upcoming = events.filter((item) => {
    if (!item.event_date) return season > today.getFullYear();
    const eventDate = new Date(item.event_date);
    return Number.isFinite(eventDate.getTime()) ? eventDate > today : season > today.getFullYear();
  });
  return upcoming.length > 0 ? upcoming : events;
}
