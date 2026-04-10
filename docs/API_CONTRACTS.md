# API Contracts - Frontend ↔ Backend

This document describes the **actual** REST API surface used by the React frontend (`frontend/`) and implemented by the Django backend (`backend/`).

## Base URL

- **Backend** serves under: `.../api/`
- Frontend uses `env.apiUrl` (see `frontend/src/config/env.ts`) and then calls `.../api/...`.

## Common conventions

### Content type

- **Request**: JSON (`Content-Type: application/json`)
- **Response**: JSON

### Authentication / abuse protection

- **Optional API key**: If the backend is configured with `API_KEY`, all requests must include header `X-API-Key: <value>`.
- **Frontend**: set `VITE_API_KEY` to the same value so the UI can send `X-API-Key`.
- **Throttling**: Anonymous requests are rate-limited (default `60/min`), configurable via `DJANGO_THROTTLE_ANON`.

### Error shape

When the backend returns an error via its custom handling, it uses:

```json
{
  "error": "string_code",
  "message": "Human readable message",
  "detail": "Optional diagnostic detail"
}
```

Notes:

- Validation errors raised by DRF (`is_valid(raise_exception=True)`) may return DRF’s default `{field: [...]}` shape in some cases. The frontend’s error parsing is defensive and will surface `message` when present, otherwise it tries to join other fields.

### IDs

- Trip IDs are UUID strings.
- `tripNo` is an integer sequence stored with the trip model and returned alongside `id`.

## Endpoints

### 1) Plan a trip (create + persist)

**Route**

- `POST /api/trip/plan/`

**Request body** (`TripPlanRequest` in `frontend/src/api/tripApi.ts`)

```json
{
  "currentLocation": "Chicago, IL",
  "pickupLocation": "Chicago, IL",
  "dropoffLocation": "Denver, CO",
  "cycleHoursUsed": 12.5
}
```

**Validation**

- `currentLocation`: string, max 512
- `pickupLocation`: string, max 512
- `dropoffLocation`: string, max 512
- `cycleHoursUsed`: float, \(0 \le x \le 70\)

**Success response**

- **Status**: `201 Created`
- **Body**: wrapper object:
  - `id` (uuid string)
  - `tripNo` (int)
  - `createdAt` (ISO timestamp string)
  - `result` (object): a `TripDetails`-shaped payload (route, duty totals, ELD sheets, etc.)

**Error responses**

- `400 Bad Request`
  - planner or validation error the backend classifies as “invalid input / no result”
  - example:
    ```json
    { "error": "invalid_input_or_no_result", "message": "Location is required" }
    ```
- `502 Bad Gateway`
  - upstream geocoder/router failure
  - example:
    ```json
    {
      "error": "upstream_unavailable",
      "message": "Geocoding/routing service is unavailable. Try again later.",
      "detail": "Network error"
    }
    ```

### 2) List saved trips (history)

**Route**

- `GET /api/trip/`

**Success response**

- **Status**: `200 OK`
- **Body**: array of wrapper objects:
  - `id`
  - `tripNo`
  - `createdAt`
  - `result` (object): “trip summary”-like payload (compatible with `TripSummary`)

### 3) Fetch trip by id (detail/replay)

**Route**

- `GET /api/trip/<uuid:trip_id>/`

**Success response**

- **Status**: `200 OK`
- **Body**: wrapper object:
  - `id`, `tripNo`, `createdAt`, `result`

**Error response**

- `404 Not Found`
  - example:
    ```json
    { "error": "not_found", "message": "Trip not found" }
    ```

### 4) Location search (autocomplete)

**Route**

- `GET /api/locations/search/?q=<string>&limit=<int>`

**Query parameters**

- `q` (string): search text; if blank, returns `[]`
- `limit` (int, optional): clamped to `1..20`, default `8`

**Success response**

- **Status**: `200 OK`
- **Body**: array of:

```json
[
  {
    "label": "Denver, Denver County, Colorado, United States",
    "lat": "39.7392",
    "lon": "-104.9903"
  }
]
```

**Error responses**

- `500 Internal Server Error` if server is missing geocoder config
- `502 Bad Gateway` if the OpenRouteService geocoder is unavailable

## Data contracts (response payloads)

The frontend’s canonical types live in `frontend/src/types/trip.ts`. The backend returns compatible JSON.

### Wrapper used by trip endpoints

Trip-related endpoints return a wrapper so the response is schema-able and stable:

```json
{
  "id": "uuid",
  "tripNo": 1900,
  "createdAt": "2026-04-09T00:00:00Z",
  "result": { "...": "TripSummary or TripDetails payload" }
}
```

### Trip stop

```json
{ "city": "Chicago", "state": "IL" }
```

### Route geometry (Map rendering)

```json
{
  "route": {
    "pickupLngLat": [-87.6298, 41.8781],
    "dropoffLngLat": [-104.9903, 39.7392],
    "line": {
      "type": "LineString",
      "coordinates": [
        [-87.6298, 41.8781],
        [-104.9903, 39.7392]
      ]
    }
  }
}
```

Notes:

- Coordinates are `[lng, lat]`.
- `line.coordinates` is used by the map and by some UI geometry helpers.

### Duty totals

```json
{
  "dutyTotals": {
    "offDutyHours": 10.0,
    "sleeperBerthHours": 0.0,
    "drivingHours": 11.0,
    "onDutyHours": 3.0
  }
}
```

### ELD log sheets (multi-day)

```json
{
  "eldLogSheets": [
    {
      "dateISO": "2026-04-09",
      "dutyTotals": {
        "offDutyHours": 10,
        "sleeperBerthHours": 0,
        "drivingHours": 11,
        "onDutyHours": 3
      },
      "segments": [
        {
          "status": "On Duty",
          "fromHour": 18.3333,
          "toHour": 19.3333,
          "label": "Pickup / pre-trip"
        },
        {
          "status": "Driving",
          "fromHour": 19.3333,
          "toHour": 24.0,
          "label": "Driving"
        }
      ]
    }
  ]
}
```

Notes:

- `segments` is optional; when present, the UI prefers it over reconstructing from totals.
- Segment hours are **hours since local midnight on `dateISO`**, in range `[0, 24]`.

### Stop plan

```json
{
  "stopPlan": {
    "fuelStops": 1,
    "breakStops": 0,
    "breakMinutes": 0,
    "stopCount": 1
  }
}
```

### Turn-by-turn instructions

```json
{
  "routeInstructions": [
    {
      "instruction": "Turn right",
      "distance_mi": 0.5,
      "duration_min": 1.2,
      "road_name": "W Addison St"
    }
  ]
}
```

## Backend OpenAPI source of truth

The backend exposes schema + Swagger UI:

- `GET /api/schema/`
- `GET /api/docs/`

The view definitions include `extend_schema(...)` examples for the key endpoints (see `backend/trips/views.py`).
