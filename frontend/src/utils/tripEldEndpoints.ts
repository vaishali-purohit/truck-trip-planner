import type { EldLogSheet, TripStop } from "../types/trip";
import { dayRouteFractionRange, milesForDayIndex } from "./tripDayMiles";
import { formatLocationAlongFullRoute } from "./tripRoutePlace";

/** Older API payloads used duplicate "En route (day N)" for both from and to on middle days. */
function isLegacyDuplicateEnRouteDayLine(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || x !== y) return false;
  return /^en route \(day \d+/i.test(x);
}

export function eldSheetFromToLabels(
  sheet: EldLogSheet,
  sheetIndex: number,
  sheets: EldLogSheet[],
  pickup: TripStop,
  dropoff: TripStop,
  totalDistanceMi: number,
  drivingHours: number,
): { from: string; to: string; range: { start: number; end: number }; miles: number } {
  const dist = Number(totalDistanceMi) || 0;
  const range = dayRouteFractionRange(sheetIndex, sheets, dist, drivingHours);
  const miles = milesForDayIndex(sheetIndex, sheets, dist, drivingHours);
  const rawFrom = sheet.fromLocation?.trim() ?? "";
  const rawTo = sheet.toLocation?.trim() ?? "";
  const useApi = rawFrom && rawTo && !isLegacyDuplicateEnRouteDayLine(rawFrom, rawTo);
  const from = useApi ? rawFrom : formatLocationAlongFullRoute(range.start, pickup, dropoff);
  const to = useApi ? rawTo : formatLocationAlongFullRoute(range.end, pickup, dropoff);
  return { from, to, range, miles };
}
