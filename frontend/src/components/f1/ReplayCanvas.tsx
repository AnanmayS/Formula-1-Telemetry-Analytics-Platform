import { useEffect, useRef } from "react";
import type { ReplayResponse, ReplayCar } from "@/types/f1";
import { teamColor } from "@/lib/f1-visuals";

interface Props {
  replay: ReplayResponse;
  cars: ReplayCar[];
  selectedDriver: string | null;
  onSelectDriver?: (driver: string) => void;
  driverTeamMap: Record<string, string>;
}

/**
 * Placeholder ReplayCanvas — designed as a drop-in slot for the existing
 * canvas-based replay renderer (interpolation, keyboard controls, telemetry
 * wiring). Keeps the same prop contract so the real implementation can replace
 * this file directly.
 */
export function ReplayCanvas({
  replay,
  cars,
  selectedDriver,
  onSelectDriver,
  driverTeamMap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Scale the real FastF1 coordinate space into the canvas.
      const pad = 40 * dpr;
      const points = replay.track.length ? replay.track : cars.map((car) => ({ x: car.x, y: car.y }));
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      const sx = (x: number) => pad + ((x - minX) / Math.max(maxX - minX, 1)) * (w - 2 * pad);
      const sy = (y: number) => h - pad - ((y - minY) / Math.max(maxY - minY, 1)) * (h - 2 * pad);

      // Track outline
      ctx.lineWidth = 22 * dpr;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      replay.track.forEach((p, i) => {
        const x = sx(p.x);
        const y = sy(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Racing line
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([6 * dpr, 8 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cars
      cars.forEach((c) => {
        const team = driverTeamMap[c.driver] ?? "";
        const color = teamColor(team);
        const x = sx(c.x);
        const y = sy(c.y);
        const isSel = c.driver === selectedDriver;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, (isSel ? 8 : 5) * dpr, 0, Math.PI * 2);
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = `${10 * dpr}px ui-monospace, monospace`;
        ctx.fillText(c.driver, x + 8 * dpr, y - 6 * dpr);
      });
    };

    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [replay, cars, selectedDriver, driverTeamMap]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute right-3 top-3 rounded-sm border border-border bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        ReplayCanvas
      </div>
      {/* Click-target overlay so leaderboard selection still drives focus.
          The real canvas owns hit-testing for direct car clicks. */}
      <button
        type="button"
        aria-label="Cycle selected driver"
        onClick={() => {
          if (!onSelectDriver) return;
          const idx = cars.findIndex((c) => c.driver === selectedDriver);
          const next = cars[(idx + 1) % cars.length];
          if (next) onSelectDriver(next.driver);
        }}
        className="absolute inset-0 cursor-crosshair opacity-0"
      />
    </div>
  );
}
