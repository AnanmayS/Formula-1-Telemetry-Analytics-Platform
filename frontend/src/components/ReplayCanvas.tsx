import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import type { ReplayCar, ReplayFrame, ReplayResponse } from "../types/f1";

type Props = {
  replay: ReplayResponse;
  frame: ReplayFrame | null;
  selectedDriver?: string;
  onSelectDriver: (driver: string) => void;
};

const palette = ["#e10600", "#00d2be", "#7a3cff", "#ffb000", "#1b6ef3", "#ffffff", "#00a36c", "#d13f8c"];

export function ReplayCanvas({ replay, frame, selectedDriver, onSelectDriver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trailRef = useRef<Map<string, { x: number; y: number; time: number }[]>>(new Map());
  const visualCarsRef = useRef<Map<string, ReplayCar>>(new Map());
  const lastFrameTimeRef = useRef<number | null>(null);
  const smoothTrack = useMemo(() => smoothClosedTrack(replay.track), [replay.track]);
  const bounds = useMemo(() => getBounds(smoothTrack), [smoothTrack]);

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
    drawBackground(ctx, width, height);
    drawTrack(ctx, smoothTrack, bounds, width, height);

    if (!frame) return;
    const shouldSnap = lastFrameTimeRef.current !== null && Math.abs(frame.time - lastFrameTimeRef.current) > 5;
    const visualCars = smoothVisualCars(visualCarsRef.current, frame.cars, shouldSnap);
    const visualFrame = { ...frame, cars: visualCars };
    updateTrails(trailRef.current, visualFrame);
    if (shouldSnap) {
      trailRef.current.clear();
      updateTrails(trailRef.current, visualFrame);
    }
    lastFrameTimeRef.current = frame.time;

    drawTrails(ctx, trailRef.current, bounds, width, height);
    visualCars.forEach((car, index) => {
      drawCar(ctx, car, index, bounds, width, height, car.driver === selectedDriver, trailRef.current.get(car.driver) ?? []);
    });
  }, [frame, selectedDriver, bounds, smoothTrack]);

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    if (!frame || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const width = canvasRef.current.clientWidth;
    const height = canvasRef.current.clientHeight;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = "";
    let distance = Number.POSITIVE_INFINITY;
    frame.cars.forEach((car) => {
      const scaled = scale(car.x, car.y, bounds, width, height);
      const hit = Math.hypot(scaled.x - x, scaled.y - y);
      if (hit < distance) {
        nearest = car.driver;
        distance = hit;
      }
    });
    if (nearest && distance < 28) onSelectDriver(nearest);
  }

  return (
    <canvas
      className="block h-full w-full"
      ref={canvasRef}
      onClick={handleClick}
    />
  );
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
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

function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: { x: number; y: number }[],
  bounds: ReturnType<typeof getBounds>,
  width: number,
  height: number
) {
  if (track.length <= 1) return;

  drawPolyline(ctx, track, bounds, width, height, {
    color: "rgba(255, 255, 255, 0.13)",
    width: 28,
    shadowBlur: 22,
    shadowColor: "rgba(255,255,255,0.18)"
  });
  drawPolyline(ctx, track, bounds, width, height, { color: "#181c22", width: 20 });
  drawPolyline(ctx, track, bounds, width, height, { color: "#d7d7d7", width: 4 });
  drawPolyline(ctx, track, bounds, width, height, { color: "rgba(255,255,255,0.88)", width: 1.5 });
  drawTrackSegments(ctx, track, bounds, width, height);
  drawFinishLine(ctx, track, bounds, width, height);
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  bounds: ReturnType<typeof getBounds>,
  width: number,
  height: number,
  style: { color: string; width: number; shadowBlur?: number; shadowColor?: string }
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
    const scaled = scale(point.x, point.y, bounds, width, height);
    if (index === 0) ctx.moveTo(scaled.x, scaled.y);
    else ctx.lineTo(scaled.x, scaled.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTrackSegments(
  ctx: CanvasRenderingContext2D,
  track: { x: number; y: number }[],
  bounds: ReturnType<typeof getBounds>,
  width: number,
  height: number
) {
  const segmentStarts = [0.18, 0.42, 0.68];
  segmentStarts.forEach((start) => {
    const startIndex = Math.floor(track.length * start);
    const endIndex = Math.min(track.length - 1, startIndex + Math.floor(track.length * 0.09));
    ctx.save();
    ctx.strokeStyle = "#00ff41";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.shadowColor = "#00ff41";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let index = startIndex; index <= endIndex; index += 1) {
      const scaled = scale(track[index].x, track[index].y, bounds, width, height);
      if (index === startIndex) ctx.moveTo(scaled.x, scaled.y);
      else ctx.lineTo(scaled.x, scaled.y);
    }
    ctx.stroke();
    ctx.restore();
  });
}

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  track: { x: number; y: number }[],
  bounds: ReturnType<typeof getBounds>,
  width: number,
  height: number
) {
  if (track.length < 3) return;
  const first = scale(track[0].x, track[0].y, bounds, width, height);
  const next = scale(track[3].x, track[3].y, bounds, width, height);
  const dx = next.x - first.x;
  const dy = next.y - first.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const half = 16;

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(first.x - nx * half, first.y - ny * half);
  ctx.lineTo(first.x + nx * half, first.y + ny * half);
  ctx.stroke();
  ctx.restore();
}

function updateTrails(trails: Map<string, { x: number; y: number; time: number }[]>, frame: ReplayFrame) {
  frame.cars.forEach((car) => {
    const trail = trails.get(car.driver) ?? [];
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - car.x, last.y - car.y) > 1) {
      trail.push({ x: car.x, y: car.y, time: frame.time });
    }
    while (trail.length > 18 || (trail[0] && frame.time - trail[0].time > 5)) trail.shift();
    trails.set(car.driver, trail);
  });
}

function smoothVisualCars(visualCars: Map<string, ReplayCar>, targetCars: ReplayCar[], snap: boolean) {
  const activeDrivers = new Set(targetCars.map((car) => car.driver));
  Array.from(visualCars.keys()).forEach((driver) => {
    if (!activeDrivers.has(driver)) visualCars.delete(driver);
  });

  return targetCars.map((target) => {
    const previous = visualCars.get(target.driver);
    if (!previous || snap || Math.abs((target.lap ?? 0) - (previous.lap ?? 0)) > 1) {
      visualCars.set(target.driver, target);
      return target;
    }
    const distance = Math.hypot(target.x - previous.x, target.y - previous.y);
    if (distance > 11000) {
      visualCars.set(target.driver, target);
      return target;
    }
    const alpha = 0.82;
    const smoothed = {
      ...target,
      x: previous.x + (target.x - previous.x) * alpha,
      y: previous.y + (target.y - previous.y) * alpha
    };
    visualCars.set(target.driver, smoothed);
    return smoothed;
  });
}

function drawTrails(
  ctx: CanvasRenderingContext2D,
  trails: Map<string, { x: number; y: number; time: number }[]>,
  bounds: ReturnType<typeof getBounds>,
  width: number,
  height: number
) {
  trails.forEach((trail, driver) => {
    if (trail.length < 2) return;
    const color = colorForDriver(driver);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let index = 1; index < trail.length; index += 1) {
      const prev = scale(trail[index - 1].x, trail[index - 1].y, bounds, width, height);
      const next = scale(trail[index].x, trail[index].y, bounds, width, height);
      ctx.strokeStyle = hexToRgba(color, index / trail.length * 0.42);
      ctx.lineWidth = 2 + index / trail.length * 2;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: ReplayCar,
  index: number,
  bounds: ReturnType<typeof getBounds>,
  width: number,
  height: number,
  selected: boolean,
  trail: { x: number; y: number; time: number }[]
) {
  const scaled = scale(car.x, car.y, bounds, width, height);
  const color = colorForDriver(car.driver, index);
  const angle = carAngle(car, trail);

  ctx.save();
  ctx.translate(scaled.x, scaled.y);
  ctx.rotate(angle);
  ctx.shadowColor = selected ? "#ffffff" : color;
  ctx.shadowBlur = selected ? 18 : 10;
  ctx.fillStyle = color;
  ctx.strokeStyle = selected ? "#ffffff" : "#050609";
  ctx.lineWidth = selected ? 3 : 2;
  roundedRect(ctx, -8, -4.5, 16, 9, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundedRect(ctx, 2, -2.4, 5, 4.8, 2);
  ctx.fill();
  ctx.restore();

  if (selected) {
    drawSelectedLabel(ctx, car.driver, scaled.x, scaled.y);
  }
}

function drawSelectedLabel(ctx: CanvasRenderingContext2D, driver: string, x: number, y: number) {
  const labelX = x + 28;
  const labelY = y - 30;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 8);
  ctx.lineTo(labelX - 4, labelY + 10);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  roundedRect(ctx, labelX - 2, labelY - 4, 46, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 13px Inter, sans-serif";
  ctx.fillText(driver, labelX + 7, labelY + 12);
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function carAngle(car: ReplayCar, trail: { x: number; y: number; time: number }[]) {
  if (trail.length < 2) return 0;
  const prev = trail[Math.max(0, trail.length - 3)];
  return Math.atan2(car.y - prev.y, car.x - prev.x);
}

function getBounds(points: { x: number; y: number }[]) {
  if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function scale(x: number, y: number, bounds: ReturnType<typeof getBounds>, width: number, height: number) {
  const pad = Math.max(38, Math.min(width, height) * 0.08);
  const rangeX = Math.max(bounds.maxX - bounds.minX, 1);
  const rangeY = Math.max(bounds.maxY - bounds.minY, 1);
  return {
    x: pad + ((x - bounds.minX) / rangeX) * (width - pad * 2),
    y: height - pad - ((y - bounds.minY) / rangeY) * (height - pad * 2)
  };
}

function smoothClosedTrack(points: { x: number; y: number }[]) {
  if (points.length < 4) return points;
  const output: { x: number; y: number }[] = [];
  const samplesPerSegment = Math.max(4, Math.min(14, Math.floor(720 / points.length)));
  for (let index = 0; index < points.length; index += 1) {
    const p0 = points[(index - 1 + points.length) % points.length];
    const p1 = points[index];
    const p2 = points[(index + 1) % points.length];
    const p3 = points[(index + 2) % points.length];
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      output.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return output;
}

function catmullRom(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function colorForDriver(driver: string, fallbackIndex = 0) {
  let hash = 0;
  for (let index = 0; index < driver.length; index += 1) hash = (hash * 31 + driver.charCodeAt(index)) >>> 0;
  return palette[hash % palette.length] ?? palette[fallbackIndex % palette.length];
}

function hexToRgba(hex: string, alpha: number) {
  if (!hex.startsWith("#") || hex.length !== 7) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
