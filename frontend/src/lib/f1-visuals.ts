const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#1e5bc6",
  "Oracle Red Bull Racing": "#1e5bc6",
  Mercedes: "#27f4d2",
  Ferrari: "#e80020",
  McLaren: "#ff8000",
  "Aston Martin": "#229971",
  "Aston Martin Aramco Mercedes": "#229971",
  Alpine: "#0093cc",
  Williams: "#64c4ff",
  RB: "#6692ff",
  "Racing Bulls": "#6692ff",
  "Kick Sauber": "#52e252",
  Sauber: "#52e252",
  Haas: "#b6babd",
  Cadillac: "#c6a76a",
  Audi: "#c8ced8"
};

export function teamColor(team?: string | null) {
  if (!team) return "#8a8a8a";
  return TEAM_COLORS[team] ?? "#8a8a8a";
}

export function normalizeCompound(compound?: string | null) {
  const value = compound?.toUpperCase() ?? "";
  if (value.includes("SOFT")) return "SOFT";
  if (value.includes("MEDIUM")) return "MEDIUM";
  if (value.includes("HARD")) return "HARD";
  if (value.includes("INTER")) return "INTER";
  if (value.includes("WET")) return "WET";
  return "UNKNOWN";
}

export function normalizeTrackStatus(status?: string | null, kind?: string | null) {
  const value = `${kind ?? ""} ${status ?? ""}`.toLowerCase();
  if (value.includes("red")) return "red";
  if (value.includes("safety") || value === "sc" || value.includes(" sc")) return "sc";
  if (value.includes("vsc") || value.includes("virtual")) return "vsc";
  if (value.includes("yellow")) return "yellow";
  return "green";
}

export function formatLapTime(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "--";
  const totalMilliseconds = Math.round(value * 1000);
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}
