import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { EventOption, SessionOption } from "../types/f1";

type Selection = {
  season: number;
  event: string;
  session: string;
};

type Props = {
  value: Selection;
  onChange: (selection: Selection) => void;
};

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
        setSessions(items);
        const race = items.find((item) => item.code === "R");
        if (!items.some((item) => item.code === value.session) && (race ?? items[0])) {
          onChange({ ...value, session: (race ?? items[0]).code });
        }
      })
      .catch((err) => setError(err.message));
  }, [value.season, value.event]);

  return (
    <section className="selectorShell">
      <div className="field">
        <label>Season</label>
        <select value={value.season} onChange={(event) => onChange({ ...value, season: Number(event.target.value) })}>
          {seasons.map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Event</label>
        <select value={value.event} onChange={(event) => onChange({ ...value, event: event.target.value })}>
          {events.map((event) => (
            <option key={event.event_name} value={event.event_name}>
              {event.event_name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Session</label>
        <select value={value.session} onChange={(event) => onChange({ ...value, session: event.target.value })}>
          {sessions.map((session) => (
            <option key={session.code} value={session.code}>
              {session.name} ({session.code})
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="inlineError">{error}</p> : null}
    </section>
  );
}

