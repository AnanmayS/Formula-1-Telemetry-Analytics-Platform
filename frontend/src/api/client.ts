import type {
  BootstrapStatus,
  EventOption,
  PredictionResponse,
  ReplayResponse,
  SessionOption,
  SessionSummary,
  TelemetryResponse
} from "../types/f1";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed with ${response.status}`);
  }
  return response.json();
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  ).toString();

export const api = {
  seasons: () => request<number[]>("/api/seasons"),
  events: (season: number) => request<EventOption[]>(`/api/events?${qs({ season })}`),
  sessions: (season: number, event: string) => request<SessionOption[]>(`/api/sessions?${qs({ season, event })}`),
  ingest: (season: number, event: string, session: string, force = false) =>
    request<{ status: string; message?: string }>("/api/ingest/session", {
      method: "POST",
      body: JSON.stringify({ season, event, session, force })
    }),
  bootstrapStatus: () => request<BootstrapStatus>("/api/ingest/bootstrap-status"),
  bootstrapRecentRaces: () =>
    request<{ status: string; message?: string }>("/api/ingest/bootstrap", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  summary: (season: number, event: string, session: string) =>
    request<SessionSummary>(`/api/session/summary?${qs({ season, event, session })}`),
  replay: (season: number, event: string, session: string) =>
    request<ReplayResponse>(`/api/session/replay?${qs({ season, event, session })}`),
  telemetry: (season: number, event: string, session: string, driver: string, lap = "fastest") =>
    request<TelemetryResponse>(`/api/session/telemetry?${qs({ season, event, session, driver, lap })}`),
  predictions: (season: number, event: string, session: string) =>
    request<PredictionResponse>(`/api/model/predict-race?${qs({ season, event, session })}`),
};
