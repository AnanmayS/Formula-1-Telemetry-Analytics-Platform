import type { ReplayCar, ReplayFrame } from "../types/f1";

export function nearestFrame(frames: ReplayFrame[], currentTime: number): ReplayFrame | null {
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestDistance = Math.abs(frames[0].time - currentTime);
  for (const frame of frames) {
    const distance = Math.abs(frame.time - currentTime);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

export function interpolatedFrame(frames: ReplayFrame[], currentTime: number): ReplayFrame | null {
  if (frames.length === 0) return null;
  if (currentTime <= frames[0].time) return frames[0];
  const lastFrame = frames[frames.length - 1];
  if (currentTime >= lastFrame.time) return lastFrame;

  const nextIndex = findNextFrameIndex(frames, currentTime);
  const prev = frames[Math.max(0, nextIndex - 1)];
  const next = frames[nextIndex];
  const span = Math.max(next.time - prev.time, 0.001);
  const rawRatio = (currentTime - prev.time) / span;
  const ratio = smoothStep(Math.max(0, Math.min(1, rawRatio)));
  const nextCars = new Map(next.cars.map((car) => [car.driver, car]));

  const cars = prev.cars.map((car) => interpolateCar(car, nextCars.get(car.driver), ratio));
  const lap = ratio >= 0.5 ? next.lap : prev.lap;
  const leaderboard = ratio >= 0.5 ? next.leaderboard : prev.leaderboard;

  return {
    time: currentTime,
    lap,
    leaderboard,
    cars
  };
}

function findNextFrameIndex(frames: ReplayFrame[], currentTime: number) {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].time < currentTime) low = mid + 1;
    else high = mid;
  }
  return low;
}

function interpolateCar(prev: ReplayCar, next: ReplayCar | undefined, ratio: number): ReplayCar {
  if (!next || Math.abs((next.lap ?? 0) - (prev.lap ?? 0)) > 1) return prev;
  const jump = Math.hypot(next.x - prev.x, next.y - prev.y);
  if (jump > 9000) return ratio < 0.5 ? prev : next;
  return {
    ...prev,
    x: lerp(prev.x, next.x, ratio),
    y: lerp(prev.y, next.y, ratio),
    lap: ratio >= 0.5 ? next.lap : prev.lap,
    progress: interpolateOptional(prev.progress, next.progress, ratio),
    speed: interpolateOptional(prev.speed, next.speed, ratio),
    throttle: interpolateOptional(prev.throttle, next.throttle, ratio),
    brake: ratio >= 0.5 ? next.brake : prev.brake,
    rpm: interpolateOptional(prev.rpm, next.rpm, ratio),
    gear: ratio >= 0.5 ? next.gear : prev.gear,
    drs: ratio >= 0.5 ? next.drs : prev.drs,
    track_status: ratio >= 0.5 ? next.track_status : prev.track_status,
    track_status_label: ratio >= 0.5 ? next.track_status_label : prev.track_status_label
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolateOptional(a: number | undefined, b: number | undefined, t: number) {
  if (typeof a !== "number") return b;
  if (typeof b !== "number") return a;
  return lerp(a, b, t);
}

function smoothStep(t: number) {
  return t * t * (3 - 2 * t);
}

export function formatSeconds(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
