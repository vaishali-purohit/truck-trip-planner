import { describe, expect, it } from "vitest";
import type { EldLogSegment } from "../../types/trip";
import { normalizeSegmentsForTwentyFourHourGraph } from "../../utils/eldDutyGraphUtils";

describe("normalizeSegmentsForTwentyFourHourGraph", () => {
  it("pads leading wall-clock gap with Off Duty and closes at 24", () => {
    const segs: EldLogSegment[] = [
      { status: "On Duty", fromHour: 8, toHour: 9 },
      { status: "Driving", fromHour: 9, toHour: 20 },
      { status: "Off Duty", fromHour: 20, toHour: 24 },
    ];
    const n = normalizeSegmentsForTwentyFourHourGraph(segs);
    expect(n[0]).toMatchObject({ fromHour: 0, toHour: 8, row: 0 });
    expect(n[n.length - 1]).toMatchObject({ fromHour: 20, toHour: 24, row: 0 });
    let t = 0;
    for (const s of n) {
      expect(s.fromHour).toBeCloseTo(t, 5);
      t = s.toHour;
    }
    expect(t).toBe(24);
  });

  it("keeps contiguous 0–24 segments unchanged (totals fallback shape)", () => {
    const segs: EldLogSegment[] = [
      { status: "Off Duty", fromHour: 0, toHour: 10 },
      { status: "Driving", fromHour: 10, toHour: 21 },
      { status: "Off Duty", fromHour: 21, toHour: 24 },
    ];
    const n = normalizeSegmentsForTwentyFourHourGraph(segs);
    expect(n).toHaveLength(3);
    expect(n[2]!.toHour).toBe(24);
  });
});
