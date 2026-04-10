import type { EldLogSegment, EldSegmentStatus } from "../types/trip";

const OFF_DUTY_ROW = 0;

function statusToRowIndex(status: EldSegmentStatus) {
  switch (status) {
    case "Off Duty":
      return 0;
    case "Sleeper":
      return 1;
    case "Driving":
      return 2;
    case "On Duty":
      return 3;
    default:
      return 0;
  }
}

export function normalizeSegmentsForTwentyFourHourGraph(
  segments: EldLogSegment[],
): { fromHour: number; toHour: number; row: number }[] {
  const clampH = (h: number) =>
    Math.max(0, Math.min(24, Number.isFinite(h) ? h : 0));

  const pieces = segments
    .filter((s) => s.toHour > s.fromHour)
    .map((s) => ({
      fromHour: clampH(s.fromHour),
      toHour: clampH(s.toHour),
      row: statusToRowIndex(s.status),
    }))
    .filter((s) => s.toHour > s.fromHour)
    .sort((a, b) => a.fromHour - b.fromHour || a.row - b.row);

  const out: { fromHour: number; toHour: number; row: number }[] = [];
  let cursor = 0;

  for (const s of pieces) {
    if (s.fromHour > cursor + 1e-6) {
      out.push({ fromHour: cursor, toHour: s.fromHour, row: OFF_DUTY_ROW });
    }
    const from = Math.max(s.fromHour, cursor);
    if (s.toHour <= from + 1e-9) continue;
    out.push({ fromHour: from, toHour: s.toHour, row: s.row });
    cursor = s.toHour;
  }

  if (cursor < 24 - 1e-6) {
    out.push({ fromHour: cursor, toHour: 24, row: OFF_DUTY_ROW });
  }

  return out;
}
