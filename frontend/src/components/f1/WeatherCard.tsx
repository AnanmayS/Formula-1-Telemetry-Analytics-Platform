import { cn } from "@/lib/utils";

type WeatherCardValue = {
  track_temp?: number;
  air_temp?: number;
  humidity?: number;
  rainfall?: boolean;
} | null;

export function WeatherCard({ weather, className }: { weather: WeatherCardValue; className?: string }) {
  if (!weather) {
    return (
      <div className={cn("rounded-md border border-border bg-card/95 p-3 text-xs text-muted-foreground backdrop-blur", className)}>
        Weather unavailable
      </div>
    );
  }
  return (
    <div className={cn("rounded-md border border-border bg-card/95 p-3 backdrop-blur", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weather</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Track</div>
          <div className="font-mono tabular-nums">{formatTemp(weather.track_temp)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Air</div>
          <div className="font-mono tabular-nums">{formatTemp(weather.air_temp)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Humidity</div>
          <div className="font-mono tabular-nums">{formatHumidity(weather.humidity)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Rain</div>
          <div className={cn("font-mono", weather.rainfall ? "text-blue-300" : "text-emerald-400")}>
            {weather.rainfall ? "YES" : "DRY"}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTemp(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)} C` : "--";
}

function formatHumidity(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "--";
}
