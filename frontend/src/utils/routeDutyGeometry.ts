import type { DutyStatusTotals, LngLat } from "../types/trip";

export type DutySegment = {
  statusKey: string;
  label: string;
  color: string;
  hours: number;
  coordinates: LngLat[];
  /** 0–1 position along full route (midpoint of this duty span) for location hints */
  pathMidFraction: number;
  /** Hours from midnight on `dateISO` for this status block */
  startHour: number;
  endHour: number;
};

const DUTY_SPEC = [
  { key: "off", label: "Off Duty", prop: "offDutyHours" as const },
  { key: "sleeper", label: "Sleeper Berth", prop: "sleeperBerthHours" as const },
  { key: "driving", label: "Driving", prop: "drivingHours" as const },
  { key: "onDuty", label: "On Duty", prop: "onDutyHours" as const },
] as const;

const DUTY_COLOR: Record<(typeof DUTY_SPEC)[number]["key"], string> = {
  off: "#9CA3AF",
  sleeper: "#3B82F6",
  driving: "#10B981",
  onDuty: "#F59E0B",
};

function segmentLengthMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function cumulativeSegLens(coords: LngLat[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + segmentLengthMeters(coords[i - 1], coords[i]));
  }
  return cum;
}

function interpolateAt(coords: LngLat[], cum: number[], dist: number): LngLat {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(dist, total));
  if (total <= 0 || coords.length === 0) return coords[0];
  for (let i = 0; i < coords.length - 1; i++) {
    const s = cum[i];
    const e = cum[i + 1];
    if (d <= e || i === coords.length - 2) {
      const len = e - s || 1;
      const t = Math.max(0, Math.min(1, (d - s) / len));
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
      ];
    }
  }
  return coords[coords.length - 1];
}

function sliceLineByDistanceRange(
  coords: LngLat[],
  cum: number[],
  d0: number,
  d1: number,
): LngLat[] {
  const total = cum[cum.length - 1];
  if (total <= 0) return [];
  const a = Math.max(0, Math.min(d0, total));
  const b = Math.max(0, Math.min(d1, total));
  if (b - a < 0.5) return [];
  const start = interpolateAt(coords, cum, a);
  const end = interpolateAt(coords, cum, b);
  const pts: LngLat[] = [start];
  for (let i = 1; i < coords.length - 1; i++) {
    const cd = cum[i];
    if (cd > a && cd < b) pts.push(coords[i]);
  }
  pts.push(end);
  const out: LngLat[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out.length >= 2 ? out : [start, end];
}

export function midpointAlongLine(slice: LngLat[]): LngLat {
  if (slice.length === 0) return [0, 0];
  if (slice.length === 1) return slice[0];
  const cum = cumulativeSegLens(slice);
  const mid = cum[cum.length - 1] / 2;
  return interpolateAt(slice, cum, mid);
}

/**
 * Splits the route polyline into consecutive segments (Off Duty → Sleeper → Driving → On Duty)
 * with lengths proportional to daily HOS totals. Matches sidebar “Daily Status Totals”.
 */
export function buildDutyRouteSegments(
  coords: LngLat[],
  duty: DutyStatusTotals,
): DutySegment[] {
  const totalHours = DUTY_SPEC.reduce((s, row) => s + duty[row.prop], 0);
  if (coords.length < 2 || totalHours <= 0) return [];

  const cum = cumulativeSegLens(coords);
  const pathLen = cum[cum.length - 1];
  if (pathLen <= 0) return [];

  let offset = 0;
  let cumHours = 0;
  const out: DutySegment[] = [];
  for (const row of DUTY_SPEC) {
    const hours = duty[row.prop];
    const startHour = cumHours;
    const endHour = cumHours + hours;
    cumHours = endHour;
    const len = (hours / totalHours) * pathLen;
    const d0 = offset;
    const d1 = offset + len;
    offset = d1;
    const slice = sliceLineByDistanceRange(coords, cum, d0, d1);
    if (slice.length >= 2) {
      const midDist = d0 + (d1 - d0) / 2;
      out.push({
        statusKey: row.key,
        label: row.label,
        color: DUTY_COLOR[row.key],
        hours,
        coordinates: slice,
        pathMidFraction: pathLen > 0 ? midDist / pathLen : 0,
        startHour,
        endHour,
      });
    }
  }
  return out;
}
