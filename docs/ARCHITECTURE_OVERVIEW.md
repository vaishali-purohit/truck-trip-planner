# Architecture Overview

This repo is a small full-stack app:

- **Backend**: Django + Django REST Framework (DRF) API that generates a trip plan and persists it.
- **Frontend**: React dashboard (Vite) that collects route inputs, calls the planner API, and renders route + logs.
- **External services**:
  - **Geocoding**: OpenStreetMap Nominatim (for location autocomplete in the UI; also used by planner).
  - **Routing**: OSRM routing service (planner gets distance/duration + optional step instructions).

## Key flows

### 1) Location autocomplete

- Frontend calls `GET /api/locations/search/?q=...` (see `backend/trips/views.py` → `LocationSearchView`).
- Backend calls Nominatim and returns a lightweight array of `{label, lat?, lon?}` suggestions.
- Frontend uses the `label` as a human-friendly selection.

### 2) Trip planning

- Frontend posts a `TripPlanRequest` to `POST /api/trip/plan/`.
- Backend validates input (`TripPlanCreateSerializer`), calls the planner (`build_trip_plan`), and persists a `TripPlan` row with `result` JSON.
- Backend returns a **single expanded payload**: `TripDetails`-like object including:
  - route geometry for Mapbox
  - stop counts and arrival estimate
  - duty totals and ELD log sheets

### 3) Trip history + replay

- Frontend lists recent plans using `GET /api/trip/`.
- Frontend fetches a specific saved plan using `GET /api/trip/<uuid>/`.

## Where to look in code

- **Backend endpoints**: `backend/trips/urls.py`, `backend/trips/views.py`
- **Planner core**: `backend/trips/planner.py` (`build_trip_plan`, `build_multi_day_logs`)
- **Frontend API client**: `frontend/src/api/tripApi.ts`, `frontend/src/api/locationApi.ts`
- **Shared types**: `frontend/src/types/trip.ts`
- **ELD graph rendering**: `frontend/src/components/overview/EldDutyGraph.tsx`
- **PDF export**: `frontend/src/utils/exportTripPdf.ts`

## Environment/config (high level)

Backend reads environment variables via `dotenv` in `backend/config/settings.py`.

- **CORS**: `FRONTEND_ORIGIN` must match the frontend dev origin (e.g. `http://localhost:5173`).
- **Location search** (backend → Nominatim):
  - `GEOCODER_NOMINATIM_BASE_URL` (e.g. `https://nominatim.openstreetmap.org`)
  - `GEOCODER_USER_AGENT` (required by Nominatim usage policy)
- **Trip planning** (planner → geocode + OSRM):
  - `GEOCODE_URL`, `GEOCODE_UA` (used by `geocode_us_location` in `backend/trips/planner.py`)
  - `OSRM_URL` (used by `osrm_route` in `backend/trips/planner.py`)

For the exact variable list, see `backend/.env.template` and `frontend/.env.template`.

## API documentation

The backend publishes OpenAPI schema + Swagger UI:

- `GET /api/schema/`
- `GET /api/docs/`

