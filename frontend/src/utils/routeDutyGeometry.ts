import type { DutyStatusTotals, EldLogSegment, EldSegmentStatus, LngLat } from "../types/trip";

const ELD_STATUS_MAP: Record<EldSegmentStatus, { label: string; color: string }> = {
  "Off Duty": { label: "Off Duty", color: "#9CA3AF" },
  Sleeper: { label: "Sleeper Berth", color: "#3B82F6" },
  Driving: { label: "Driving", color: "#10B981" },
  "On Duty": { label: "On Duty", color: "#F59E0B" },
};

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

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Sub-polyline between fractional distances along the full route (0–1). */
export function sliceRouteByFractionRange(coords: LngLat[], range: { start: number; end: number }): LngLat[] {
  if (coords.length < 2) return [];
  const cum = cumulativeSegLens(coords);
  const pathLen = cum[cum.length - 1];
  if (pathLen <= 0) return [];
  const a = clamp01(range.start) * pathLen;
  const b = clamp01(range.end) * pathLen;
  return sliceLineByDistanceRange(coords, cum, a, b);
}

export function pointAtGlobalRouteFraction(coords: LngLat[], globalFraction: number): LngLat {
  if (coords.length < 2) return coords[0] ?? [0, 0];
  const cum = cumulativeSegLens(coords);
  const pathLen = cum[cum.length - 1];
  if (pathLen <= 0) return coords[0];
  return interpolateAt(coords, cum, clamp01(globalFraction) * pathLen);
}

/**
 * Map a clock-time (hours) within the day's ELD window to a global route fraction [0–1],
 * linearly across the day's route slice.
 */
export function globalRouteFractionForClockHour(
  segments: EldLogSegment[],
  clockHour: number,
  routeProgress: { start: number; end: number },
): number {
  const sorted = segments.filter((s) => s.toHour > s.fromHour).sort((a, b) => a.fromHour - b.fromHour);
  if (!sorted.length) return routeProgress.start;
  const dayT0 = sorted[0].fromHour;
  const dayT1 = sorted[sorted.length - 1].toHour;
  const denom = dayT1 > dayT0 ? dayT1 - dayT0 : 24;
  const span = routeProgress.end - routeProgress.start;
  const u = denom > 0 ? (clockHour - dayT0) / denom : 0;
  return routeProgress.start + clamp01(u) * span;
}

export type EldMapMarker = {
  coordinates: LngLat;
  label: string;
  color: string;
  fromHour: number;
  toHour: number;
  pathMidFraction: number;
  /** When set by the API, prefer this for map hover / UI (City, ST from backend). */
  location?: string;
};

/** One map point per ELD segment, ordered in time along the day's portion of the route. */
function dutySpecKeyToEldStatus(key: (typeof DUTY_SPEC)[number]["key"]): EldSegmentStatus {
  switch (key) {
    case "off":
      return "Off Duty";
    case "sleeper":
      return "Sleeper";
    case "driving":
      return "Driving";
    default:
      return "On Duty";
  }
}

function averageGlobalFractionForEldStatus(
  segments: EldLogSegment[],
  status: EldSegmentStatus,
  routeProgress: { start: number; end: number },
): number | null {
  const subs = segments.filter((s) => s.status === status && s.toHour > s.fromHour);
  if (!subs.length) return null;
  let sum = 0;
  for (const s of subs) {
    const midHour = (s.fromHour + s.toHour) / 2;
    sum += globalRouteFractionForClockHour(segments, midHour, routeProgress);
  }
  return sum / subs.length;
}

function firstEldLocationForStatus(segments: EldLogSegment[], status: EldSegmentStatus): string | undefined {
  const subs = segments
    .filter((s) => s.status === status && s.toHour > s.fromHour)
    .sort((a, b) => a.fromHour - b.fromHour);
  for (const s of subs) {
    const t = typeof s.location === "string" ? s.location.trim() : "";
    if (t) return t;
  }
  return undefined;
}

/** Wall-clock span on the log for this status (min start → max end across blocks). */
function eldClockSpanForStatus(
  segments: EldLogSegment[] | undefined | null,
  status: EldSegmentStatus,
): { fromHour: number; toHour: number } | null {
  if (!segments?.length) return null;
  const subs = segments.filter((s) => s.status === status && s.toHour > s.fromHour);
  if (!subs.length) return null;
  let from = Infinity;
  let to = -Infinity;
  for (const s of subs) {
    from = Math.min(from, s.fromHour);
    to = Math.max(to, s.toHour);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { fromHour: from, toHour: to };
}

/**
 * Exactly four markers (Off Duty, Sleeper Berth, Driving, On Duty) on the route.
 * Position uses ELD segments for that status when present; otherwise duty-totals band centers.
 * Zero-hour statuses still get a point (slightly jittered along the slice when needed).
 */
export function buildFourDutyStatusMarkers(
  coords: LngLat[],
  duty: DutyStatusTotals,
  routeProgress: { start: number; end: number },
  eldSegments?: EldLogSegment[] | null,
): EldMapMarker[] {
  if (coords.length < 2) return [];

  const totalHours = DUTY_SPEC.reduce((sum, row) => sum + Math.max(0, duty[row.prop]), 0);
  if (totalHours <= 1e-9) return [];

  const start = clamp01(routeProgress.start);
  const end = clamp01(routeProgress.end);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const span = hi - lo;

  let cumHours = 0;
  const out: EldMapMarker[] = [];

  for (let i = 0; i < DUTY_SPEC.length; i++) {
    const row = DUTY_SPEC[i];
    const hours = Math.max(0, duty[row.prop]);
    const startHour = cumHours;
    const endHour = cumHours + hours;
    const status = dutySpecKeyToEldStatus(row.key);

    const eldFrac =
      eldSegments?.length ? averageGlobalFractionForEldStatus(eldSegments, status, { start: lo, end: hi }) : null;

    let globalFrac: number;
    if (eldFrac != null) {
      globalFrac = eldFrac;
    } else {
      const jitter = (i + 1) * 1e-5;
      const tNorm =
        hours > 0 ? (startHour + hours / 2) / totalHours + jitter : startHour / totalHours + jitter;
      globalFrac = lo + clamp01(tNorm) * span;
    }

    cumHours += hours;

    const loc = eldSegments?.length ? firstEldLocationForStatus(eldSegments, status) : undefined;
    const clock = eldClockSpanForStatus(eldSegments, status);
    const fromH = clock ? clock.fromHour : startHour;
    const toH = clock ? clock.toHour : endHour;

    out.push({
      coordinates: pointAtGlobalRouteFraction(coords, globalFrac),
      label: row.label,
      color: DUTY_COLOR[row.key],
      fromHour: fromH,
      toHour: toH,
      pathMidFraction: globalFrac,
      location: loc,
    });
  }

  return out;
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

/**
 * Day-aware duty dots: only “move” along the portion of the route covered by that day.
 * `routeRange` is a [start,end] fraction (0–1) along the full route.
 */
export function buildDutyRouteSegmentsInRange(
  coords: LngLat[],
  duty: DutyStatusTotals,
  routeRange: { start: number; end: number },
): DutySegment[] {
  const start = clamp01(routeRange.start);
  const end = clamp01(routeRange.end);
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  if (b - a < 1e-6) return [];
  if (coords.length < 2) return [];

  const cum = cumulativeSegLens(coords);
  const pathLen = cum[cum.length - 1];
  if (pathLen <= 0) return [];

  const d0 = a * pathLen;
  const d1 = b * pathLen;
  const slice = sliceLineByDistanceRange(coords, cum, d0, d1);
  const segs = buildDutyRouteSegments(slice, duty);
  const span = b - a;
  return segs.map((s) => ({
    ...s,
    // remap local [0..1] fractions back into global [a..b]
    pathMidFraction: a + s.pathMidFraction * span,
  }));
}
