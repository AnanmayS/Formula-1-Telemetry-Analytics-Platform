import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { EventOption, SessionOption } from "@/types/f1";

export interface SessionSelectorValue {
  season: number;
  event: string;
  session: string;
}

interface Props {
  value: SessionSelectorValue;
  onChange: (next: SessionSelectorValue) => void;
}

function Field({
  label,
  children,
}: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  "h-10 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary";

export function SessionSelector({ value, onChange }: Props) {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.seasons().then(setSeasons).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    api
      .events(value.season)
      .then((items) => {
        setEvents(items);
        if (!items.some((item) => item.event_name === value.event) && items[0]) {
          onChange({ ...value, event: items[0].event_name });
        }
      })
      .catch((err) => setError(err.message));
  }, [value.season]);

  useEffect(() => {
    if (!value.event) return;
    api
      .sessions(value.season, value.event)
      .then((items) => {
        const raceAndQualifying = items.filter((item) => item.code === "R" || item.code === "Q");
        setSessions(raceAndQualifying);
        const race = raceAndQualifying.find((item) => item.code === "R");
        if (!raceAndQualifying.some((item) => item.code === value.session) && (race ?? raceAndQualifying[0])) {
          onChange({ ...value, session: (race ?? raceAndQualifying[0]).code });
        }
      })
      .catch((err) => setError(err.message));
  }, [value.season, value.event]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Season">
        <select
          className={selectClass}
          value={value.season}
          onChange={(e) => onChange({ ...value, season: Number(e.target.value) })}
        >
          {seasons.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Event">
        <select
          className={selectClass}
          value={value.event}
          onChange={(e) => onChange({ ...value, event: e.target.value })}
        >
          {events.map((e) => (
            <option key={e.event_name} value={e.event_name}>{e.event_name}</option>
          ))}
        </select>
      </Field>
      <Field label="Session">
        <select
          className={selectClass}
          value={value.session}
          onChange={(e) => onChange({ ...value, session: e.target.value })}
        >
          {sessions.map((s) => (
            <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
          ))}
        </select>
      </Field>
      {error ? <p className="text-xs font-medium text-red-300 sm:col-span-3">{error}</p> : null}
    </div>
  );
}
