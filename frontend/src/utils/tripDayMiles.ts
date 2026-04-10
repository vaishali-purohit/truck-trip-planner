import type { EldLogSheet } from "../types/trip";
import { clamp01 } from "./tripRoutePlace";

/**
 * Older / bad payloads sometimes set `totalMilesDrivingToday` ≈ full trip miles on every day.
 * When detected, allocate miles by each sheet's `dutyTotals.drivingHours` vs trip `drivingHours`.
 */
export function isDeclaredPerDayMilesBroken(sheets: EldLogSheet[], totalDistanceMi: number): boolean {
  const dist = Number(totalDistanceMi) || 0;
  if (sheets.length <= 1 || !(dist > 0)) return false;

  let sum = 0;
  for (const s of sheets) {
    const m = Number(s.totalMilesDrivingToday);
    if (Number.isFinite(m) && m > 0) sum += m;
  }
  if (sum > dist * 1.02) return true;

  for (const s of sheets) {
    const m = Number(s.totalMilesDrivingToday);
    if (Number.isFinite(m) && m > dist * 0.9) return true;
  }
  return false;
}

export function milesForDayIndex(
  dayIndex: number,
  sheets: EldLogSheet[],
  totalDistanceMi: number,
  tripDrivingHours: number,
): number {
  const n = Math.max(1, sheets.length);
  const dist = Number(totalDistanceMi) || 0;
  const broken = isDeclaredPerDayMilesBroken(sheets, dist);
  const tripH = Number(tripDrivingHours) || 0;

  if (broken && dist > 0) {
    if (tripH > 0) {
      const dayH = Number(sheets[dayIndex]?.dutyTotals?.drivingHours) || 0;
      return Math.round(((dayH / tripH) * dist) * 10) / 10;
    }
    return Math.round((dist / n) * 10) / 10;
  }

  const declared = Number(sheets[dayIndex]?.totalMilesDrivingToday);
  if (Number.isFinite(declared) && declared > 0) {
    if (dist > 0) return Math.round(Math.min(declared, dist) * 10) / 10;
    return Math.round(declared * 10) / 10;
  }

  if (dist > 0) return Math.round((dist / n) * 10) / 10;
  return 0;
}

export function dayRouteFractionRange(
  dayIndex: number,
  sheets: EldLogSheet[],
  totalDistanceMi: number,
  tripDrivingHours: number,
): { start: number; end: number } {
  const dist = Number(totalDistanceMi) || 0;
  const n = Math.max(1, sheets.length);

  if (!(dist > 0)) {
    const span = 1 / n;
    return { start: clamp01(dayIndex * span), end: clamp01((dayIndex + 1) * span) };
  }

  let before = 0;
  for (let i = 0; i < dayIndex; i++) {
    before += milesForDayIndex(i, sheets, dist, tripDrivingHours);
  }
  const today = milesForDayIndex(dayIndex, sheets, dist, tripDrivingHours);
  return {
    start: clamp01(before / dist),
    end: clamp01((before + today) / dist),
  };
}
