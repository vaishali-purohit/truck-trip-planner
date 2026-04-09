# Daily Log Sheet — Visual Rendering Specification

This spec documents how a “daily log sheet” is represented in API data and how it is rendered in the UI as a 24‑hour ELD-style duty graph.

Primary renderer: `frontend/src/components/overview/EldDutyGraph.tsx`

## Data contract: `EldLogSheet`

Frontend type: `EldLogSheet` in `frontend/src/types/trip.ts`

```ts
export interface EldLogSheet {
  dateISO: string; // YYYY-MM-DD
  dutyTotals: DutyStatusTotals;
  segments?: EldLogSegment[];
}
```

### `dutyTotals`

`dutyTotals` is always required and has:

- `offDutyHours`
- `sleeperBerthHours`
- `drivingHours`
- `onDutyHours`

Units are hours; values are typically fractional.

### `segments` (preferred when present)

When present, `segments` should be used for rendering the step-path:

```ts
export interface EldLogSegment {
  status: "Off Duty" | "Sleeper" | "Driving" | "On Duty";
  fromHour: number; // hours since midnight, inclusive
  toHour: number;   // hours since midnight, exclusive
  label?: string;   // optional UI hint (e.g. "Pickup / pre-trip")
}
```

Rules:
- `0 <= fromHour < toHour <= 24`
- Segments must be **chronological and non-overlapping** for correct rendering.
- Adjacent segments may share boundaries: `prev.toHour === next.fromHour`.

## Rendering model (SVG graph)

`EldDutyGraph` renders:

- **Top axis**: labeled “Mid. 1..11 Noon 1..11 Mid.” at integer hours 0..24
- **Grid**:
  - Vertical minor lines every **15 minutes** (0.25h)
  - Thicker hour boundaries every 1.0h
  - Horizontal separators for 4 duty rows
- **Rows (top → bottom)**:
  1. Off Duty
  2. Sleeper
  3. Driving
  4. On Duty

### Step path generation

- Each segment is mapped to a row index by `statusToRowIndex`.
- X coordinate is linear in hour: `x = x0 + (chartW/24) * hour`.
- For each segment, a horizontal line is drawn from `fromHour` to `toHour` at the row’s center.
- Transitions are drawn as vertical steps connecting the end of one segment to the start of the next.

### Transition nodes

At each boundary between consecutive segments, small circles are drawn at:

- `(toHour, previousRow)` and `(toHour, nextRow)`

These provide visual cues for duty status changes.

## Fallback behavior (no `segments`)

If `segments` is missing or empty, the UI builds segments from totals in a fixed order:

1. Off Duty
2. Sleeper
3. Driving
4. On Duty
5. If the sum is < 24, append Off Duty to fill to 24

This fallback is a visualization convenience; it will not reflect real transitions within the day.

## Multi-day rendering

`TripLogsPage` renders one `EldDutyGraph` per `eldLogSheets[]` entry.

If `eldLogSheets` is missing, the UI falls back to a single sheet derived from:

- `dateISO`
- `dutyTotals`

## Remarks timeline coupling

`TripLogsPage` uses the first sheet’s `segments` to build a “Remarks & Duty Changes” timeline:

- Each segment contributes an entry at `fromHour` using `formatClockEastern(fromHour)`.
- `label` is used as a description when present; otherwise it becomes “Duty status change”.

Practical implication:
- If you want the remarks timeline to look meaningful, populate `segments[].label` with human-readable intent (“Pickup / pre-trip”, “30-min break”, “Drop-off”, etc.).

## PDF rendering parity

The PDF export (`frontend/src/utils/exportTripPdf.ts`) renders a similar 24‑hour graph, but it currently reconstructs a schedule from **totals** (not from API `segments`).

If you want strict parity between UI and PDF, update `exportTripPdf.ts` to prefer `eldLogSheets[0].segments` when present.

