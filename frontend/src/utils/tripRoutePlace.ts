import type { TripStop } from "../types/trip";
import { formatStop } from "./tripFormat";

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function formatLocationAlongRouteWindow(
  localFraction: number,
  startLabel: string,
  endLabel: string,
): string {
  const tt = clamp01(localFraction);
  const a = startLabel?.trim() ? startLabel.trim() : "Start";
  const b = endLabel?.trim() ? endLabel.trim() : "End";
  if (tt <= 0.06) return a;
  if (tt >= 0.94) return b;
  return `Between ${a} and ${b}`;
}

export function formatLocationAlongFractionRangeWindow(
  globalFraction: number,
  range: { start: number; end: number },
  startLabel: string,
  endLabel: string,
): string {
  const a = clamp01(range.start);
  const b = clamp01(range.end);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span = hi - lo;
  if (!(span > 1e-9)) return formatLocationAlongRouteWindow(0, startLabel, endLabel);
  const g = clamp01(globalFraction);
  const u = (g - lo) / span;
  return formatLocationAlongRouteWindow(u, startLabel, endLabel);
}

/** Human-readable place along the full trip polyline (0 = pickup end, 1 = dropoff end). */
export function formatLocationAlongFullRoute(
  t: number,
  pickup: TripStop | undefined,
  dropoff: TripStop | undefined,
): string {
  const tt = clamp01(t);
  if (pickup && dropoff) {
    const a = formatStop(pickup);
    const b = formatStop(dropoff);
    if (tt <= 0.06) return a;
    if (tt >= 0.94) return b;
    return `Between ${a} and ${b}`;
  }
  return "En route";
}

/** One-line summary for the whole trip (sidebar / headers). */
export function formatFullJourneyLine(pickup: TripStop | undefined, dropoff: TripStop | undefined): string {
  if (pickup && dropoff) return `Full Journey: ${formatStop(pickup)} → ${formatStop(dropoff)}`;
  return "Full Journey";
}
