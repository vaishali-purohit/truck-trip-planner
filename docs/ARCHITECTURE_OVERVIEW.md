# Architecture Overview

This repo is a small full-stack app:

- **Backend**: Django + Django REST Framework (DRF) API that generates a trip plan and persists it.
- **Frontend**: React dashboard (Vite) that collects route inputs, calls the planner API, and renders route + logs.
- **External services**:
  - **Geocoding**: [OpenRouteService Geocode API](https://openrouteservice.org/dev/#/api-docs/geocode) (Pelias-backed; autocomplete in the UI + forward geocode for the planner).
  - **Routing**: OpenRouteService Directions (same API key tier as geocoding; truck profile `driving-hgv` by default).

## Key flows

### 1) Location autocomplete

- Frontend calls `GET /api/locations/search/?q=...` (see `backend/trips/views.py` → `LocationSearchView`).
- Backend calls OpenRouteService `/geocode/autocomplete` (`size` = requested limit) and returns a lightweight array of `{label, lat?, lon?}` suggestions (matches Basic-key “Geocode Autocomplete” quota).
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
- **Geocoding** (backend → OpenRouteService):
  - `GEOCODER_ORS_BASE_URL` (e.g. `https://api.openrouteservice.org`)
  - `GEOCODER_API_KEY` (required in production)
  - Optional: `GEOCODER_COUNTRY_CODES`, `GEOCODER_MIN_INTERVAL_SECONDS`, `GEOCODER_HTTP_USER_AGENT`
- **Trip planning** (planner → ORS geocode + ORS directions):
  - `LocationService.geocode` → ORS `/geocode/autocomplete` with `size=1` (see `backend/trips/services/location_service.py`)
  - `RouteService.get_route` → ORS `POST /v2/directions/{profile}/json` (encoded polyline decoded to a line; see `backend/trips/services/route_service.py`)

For the exact variable list, see `backend/.env.template` and `frontend/.env.template`.

## API documentation

The backend publishes OpenAPI schema + Swagger UI:

- `GET /api/schema/`
- `GET /api/docs/`

