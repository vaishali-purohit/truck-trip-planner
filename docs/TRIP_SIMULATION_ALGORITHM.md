# Trip Simulation Algorithm — Step-by-Step

This describes the current trip planning algorithm implemented in `backend/trips/planner.py`, in the order it runs.

## Inputs

`POST /api/trip/plan/` accepts:

- `currentLocation` (string)
- `pickupLocation` (string)
- `dropoffLocation` (string)
- `cycleHoursUsed` (float, 0..70)

Note:
- `currentLocation` is persisted and echoed in `inputs`, but the planner’s route is currently computed **pickup → dropoff**.

## Outputs (high-level)

The planner returns a JSON object that becomes the API response, including:

- route geometry (`route.line`) + endpoints (`pickupLngLat`, `dropoffLngLat`)
- distance, driving hours, trip time estimate
- stop plan (fuel + breaks)
- compliance status
- multi-day ELD log sheets (`eldLogSheets`)
- turn-by-turn text steps (`routeInstructions`)

## Algorithm steps

### 1) Parse pickup/dropoff as `{city, state}`

Function: `parse_city_state(...)`

- Accepts `"City, ST"` directly.
- Also accepts long geocoder strings like `"Chicago, Cook County, Illinois, United States"` and attempts to map a full state/province name into a 2‑letter abbreviation.

The parsed `pickup`/`dropoff` is what the UI displays (not the raw location string).

### 2) Geocode pickup and dropoff into coordinates

Function: `geocode_us_location(query)`

- Calls a Nominatim-compatible endpoint configured via:
  - `GEOCODE_URL`
  - `GEOCODE_UA` (User-Agent)
- Uses a small query strategy:
  - tries `"<query>, USA"` then `"<query>"`
  - may try a shortened comma-truncated query
- Caches up to 1024 results in-process via `lru_cache`.

Output: `LngLat(lng, lat)` for pickup and dropoff.

### 3) Route pickup → dropoff via OSRM

Function: `osrm_route(a, b)`

- Calls OSRM with:
  - `OSRM_URL`
  - `route/v1/driving/<a>;<b>?overview=full&geometries=geojson&steps=true`
- Reads:
  - `route.distance` (meters)
  - `route.duration` (seconds)
  - `route.geometry.coordinates` (GeoJSON coordinates `[lng, lat]`)
  - optional step info for turn-by-turn

Notes:
- There is a `straight_line_route(...)` helper for offline fallback, but it is not currently used by `build_trip_plan`.

### 4) Compute distance + duration in UI units

Helpers:

- `meters_to_miles(m)`
- `seconds_to_hours(s)`

Outputs:

- `totalDistanceMi` (rounded to 0.1)
- `drivingHours` (rounded to 0.01)

### 5) Plan stops (simple policy)

Function: `plan_stops(distance_mi, driving_hours)`

Rules:

- **Fuel**: 1 fuel stop per 1000 miles (`floor(distance / 1000)`)
- **Breaks**: 1 × 30‑min break per 8 hours driving (`floor(driving_hours / 8)`)

Outputs `stopPlan`:

- `fuelStops`
- `breakStops`
- `breakMinutes` (= `breakStops * 30`)
- `stopCount` (= `fuelStops + breakStops`)

Important:
- Fuel stops affect counts only right now; they do not yet create explicit schedule segments or alter the route.

### 6) Estimate total trip time

Constants:

- Pickup + dropoff on-duty buffer: `2.0` hours total
- Break time: `breakMinutes / 60`

Computation:

\[
totalTripTimeHours = drivingHours + 2.0 + breakHours
\]

### 7) Compute ETA

- Uses America/New_York timezone when available; otherwise UTC.
- `estimatedArrivalISO = now + totalTripTimeHours`

### 8) Compute coarse “compliance” flag from cycle hours

- `remaining_cycle = max(0, 70 - cycleHoursUsed)`
- `compliance = "compliant"` if \((drivingHours + 2.0) \le remaining_cycle\), else `"warning"`

### 9) Generate ELD log sheets (multi-day)

Function: `build_multi_day_logs(start_date, driving_hours, ...)`

Behavior:

- Schedules driving across days with:
  - max **11h driving/day**
  - if day has >= 8h driving, inserts a single **0.5h On Duty** “30-min break” after the first 8h
  - includes pickup On Duty (day 0) and drop-off On Duty (last day)
  - fills the rest of each day as Off Duty to 24.0

Output:

- `eldLogSheets[]`: each includes:
  - `dateISO`
  - `dutyTotals` (off/sleeper/driving/onDuty)
  - `segments[]` with `{status, fromHour, toHour, label}`

### 10) Build turn-by-turn instructions

Function: `build_turn_by_turn(route)`

- Iterates OSRM legs/steps.
- Emits array items with:
  - `instruction`
  - `distance_mi`
  - `duration_min`
  - `road_name`

### 11) Assemble the final response object

`build_trip_plan(...)` returns a single JSON payload with:

- identity/display: `dateISO`, `driverName`, `truckId`, `trailerId`, `carrierName`, `mainOfficeAddress`
- stops: `pickup`, `dropoff`
- metrics: `totalDistanceMi`, `drivingHours`, `totalTripTimeHours`, `estimatedArrivalISO`, `stopsCount`
- duty/logging: `dutyTotals`, `eldLogSheets`, `driverLogs`
- routing: `route`, `routeInstructions`
- metadata: `inputs`, `stopPlan`, `compliance`

## Known simplifications (by design today)

- Route is computed pickup → dropoff (current location not used in routing).
- Only a coarse cycle-hours warning is computed (not full rolling 70h/8d accounting).
- Fuel stops are counts only; no schedule segments or geospatial stop placement yet.
- Sleeper berth and split sleeper rules are not implemented.

