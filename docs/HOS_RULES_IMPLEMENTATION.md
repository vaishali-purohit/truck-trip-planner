# FMCSA Hours of Service Rules - Implementation Reference

This doc is an **implementation reference for this repo**, not a legal guide. The current planner uses a **simplified HOS model** that is “FMCSA-inspired” and designed to generate plausible daily logs for visualization.

If you need strict compliance (34-hour restart, split sleeper rules, 14-hour on-duty window, short-haul exceptions, adverse driving, etc.), treat this as a starting point and extend it.

## Scope: what the planner currently models

Planner code: `backend/trips/planner.py`

### Daily driving cap (simplified)

- **Max driving per day**: **11 hours**
  - Implemented in `build_multi_day_logs(...)` via:
    - `day_drive = min(11.0, remaining)`

### Break rule (simplified)

- **30-minute break every 8 hours of driving**
  - Implemented as:
    - `break_count = 1 if day_drive >= 8.0 else 0`
    - `break_on_duty_h = 0.5`
  - The break is represented as **On Duty** in the generated segments (see below).

### On-duty time around pickup/dropoff (simplified)

Fixed on-duty buffers:

- Pickup / pre-trip: **1.0 hour**
- Drop-off: **1.0 hour**

These are added as On Duty time in the logs:

- Day 0 includes pickup on-duty time
- Final day includes drop-off on-duty time

### Sleeper berth

- `sleeperBerthHours` is always `0.0` today.
- Segment status `"Sleeper"` exists in the frontend types, but the planner does not schedule sleeper time yet.

### Off-duty / reset time

The remaining time in the day is off-duty:

- `off_duty = 24 - (driving + on_duty + sleeper)`

The planner also appends an **“Off Duty / reset”** segment from the end of scheduled work to `24.0`.

### Multi-day planning behavior

If the route requires more than 11 driving hours, `build_multi_day_logs(...)` produces multiple daily sheets:

- Day 0 starts at “now” (America/New_York if available; else UTC).
- Subsequent days start at **08:00** local time.
- The loop is capped at **14 days** (`day_idx < 14`) to avoid runaway results.

## Cycle hours (70-hour) handling

The planner accepts input `cycleHoursUsed` and computes:

- `remaining_cycle = max(0, 70 - cycleHoursUsed)`

It then sets a coarse compliance flag:

- `compliance = "compliant"` if \((drivingHours + 2.0) \le remaining_cycle\)
  - the `2.0` is the pickup+dropoff on-duty buffer
- else `compliance = "warning"`

Important:

- This is **not** a full 70-hour / 8-day rolling window implementation.
- It is used to drive a UX-level compliance indicator.

## Duty status model used by the UI

Frontend types: `frontend/src/types/trip.ts`

The UI recognizes these statuses (strings):

- `"Off Duty"`
- `"Sleeper"`
- `"Driving"`
- `"On Duty"`
