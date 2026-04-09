# Glossary

This glossary standardizes the terms used across backend payloads, frontend types, and UI labels.

## Trip

- **Trip ID (`id`)**: UUID string identifying a saved trip plan.
- **Trip number (`tripNo`)**: integer sequence for human-friendly display (when present).
- **Trip summary**: the list page items. The backend returns an expanded result object, but the UI primarily needs: pickup, dropoff, date, distance, time, compliance.
- **Trip details**: full payload used by the overview/logs pages: route geometry, stop plan, instructions, ELD sheets.

## Locations / stops

- **Location string**: human-entered text like `"Chicago, IL"` or a geocoder display string.
- **Stop (`pickup`, `dropoff`)**: normalized display object:
  - `city`
  - `state` (2-letter abbreviation when possible)

## Route geometry

- **LngLat**: `[lng, lat]` numeric tuple.
- **LineString**: GeoJSON line with `coordinates: LngLat[]`.

Used by:
- Map rendering (Mapbox panel).
- Route-duty overlay computations.

## HOS / duty statuses

- **Duty totals (`dutyTotals`)**: hours per status for a single day:
  - `offDutyHours`
  - `sleeperBerthHours`
  - `drivingHours`
  - `onDutyHours`

- **ELD segment (`segments[]`)**: an explicit schedule of duty changes:
  - `status`: `"Off Duty" | "Sleeper" | "Driving" | "On Duty"`
  - `fromHour`, `toHour`: hours since midnight, \(0..24\)
  - `label`: optional free-form description

## Stops plan

- **Fuel stops**: count computed as 1 per 1000 miles (today).
- **Break stops**: count computed as 1 per 8 driving hours (today), 30 minutes each.
- **stopCount**: `fuelStops + breakStops`.

## Compliance flag

- **`compliance`**: `"compliant"` or `"warning"`.
  - Today this is derived from remaining cycle hours vs. planned driving + fixed on-duty buffers.
  - It is a UX indicator, not a legal determination.

