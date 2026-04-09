from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

import requests

from django.conf import settings

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

CITY_STATE_RE = re.compile(r"^\s*(?P<city>.+?)\s*,\s*(?P<state>[A-Za-z]{2})\s*$")

_HTTP = requests.Session()
_HTTP.trust_env = False

try:
    # urllib3 is a dependency of requests; safe to import.
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry  # type: ignore[import-untyped]

    _retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=0.4,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        raise_on_status=False,
    )
    _HTTP.mount("http://", HTTPAdapter(max_retries=_retry))
    _HTTP.mount("https://", HTTPAdapter(max_retries=_retry))
except Exception:
    # If retry wiring fails for any reason, keep a plain Session.
    pass


@dataclass(frozen=True)
class LngLat:
    lng: float
    lat: float


def _today_iso() -> str:
    if ZoneInfo is not None:
        try:
            return datetime.now(tz=ZoneInfo("America/New_York")).date().isoformat()
        except Exception:
            pass
    return datetime.now(tz=timezone.utc).date().isoformat()


def parse_city_state(s: str) -> dict[str, str]:
    """
    Accepts "City, ST" and returns {city, state}.
    Also accepts long geocoder display names like "Chicago, Cook County, Illinois, United States"
    and extracts {city="Chicago", state="IL"} (or Canadian province abbreviations when present).
    """
    m = CITY_STATE_RE.match(s or "")
    if not m:
        raw = (s or "").strip()
        if not raw:
            raise ValueError("Location is required")

        parts = [p.strip() for p in raw.split(",") if p.strip()]
        if not parts:
            return {"city": raw, "state": ""}

        city = parts[0]

        US_STATE_TO_ABBR = {
            "alabama": "AL",
            "alaska": "AK",
            "arizona": "AZ",
            "arkansas": "AR",
            "california": "CA",
            "colorado": "CO",
            "connecticut": "CT",
            "delaware": "DE",
            "florida": "FL",
            "georgia": "GA",
            "hawaii": "HI",
            "idaho": "ID",
            "illinois": "IL",
            "indiana": "IN",
            "iowa": "IA",
            "kansas": "KS",
            "kentucky": "KY",
            "louisiana": "LA",
            "maine": "ME",
            "maryland": "MD",
            "massachusetts": "MA",
            "michigan": "MI",
            "minnesota": "MN",
            "mississippi": "MS",
            "missouri": "MO",
            "montana": "MT",
            "nebraska": "NE",
            "nevada": "NV",
            "new hampshire": "NH",
            "new jersey": "NJ",
            "new mexico": "NM",
            "new york": "NY",
            "north carolina": "NC",
            "north dakota": "ND",
            "ohio": "OH",
            "oklahoma": "OK",
            "oregon": "OR",
            "pennsylvania": "PA",
            "rhode island": "RI",
            "south carolina": "SC",
            "south dakota": "SD",
            "tennessee": "TN",
            "texas": "TX",
            "utah": "UT",
            "vermont": "VT",
            "virginia": "VA",
            "washington": "WA",
            "west virginia": "WV",
            "wisconsin": "WI",
            "wyoming": "WY",
            "district of columbia": "DC",
        }

        CA_PROV_TO_ABBR = {
            "alberta": "AB",
            "british columbia": "BC",
            "manitoba": "MB",
            "new brunswick": "NB",
            "newfoundland and labrador": "NL",
            "nova scotia": "NS",
            "northwest territories": "NT",
            "nunavut": "NU",
            "ontario": "ON",
            "prince edward island": "PE",
            "quebec": "QC",
            "saskatchewan": "SK",
            "yukon": "YT",
        }

        state = ""
        for token in reversed(parts[1:]):
            t = token.strip()
            if len(t) == 2 and t.isalpha():
                state = t.upper()
                break
            key = t.lower()
            if key in US_STATE_TO_ABBR:
                state = US_STATE_TO_ABBR[key]
                break
            if key in CA_PROV_TO_ABBR:
                state = CA_PROV_TO_ABBR[key]
                break

        return {"city": city, "state": state}
    return {"city": m.group("city").strip(), "state": m.group("state").upper().strip()}


@lru_cache(maxsize=1024)
def geocode_us_location(query: str) -> LngLat:
    """
    Geocode using OpenStreetMap Nominatim.
    For development only; in production, add caching and comply with Nominatim usage policy.
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("Missing geocode query")

    base_root = getattr(settings, "GEOCODER_NOMINATIM_BASE_URL", None)
    if not base_root:
        raise RuntimeError("Missing required settings: GEOCODER_NOMINATIM_BASE_URL")
    base = f"{str(base_root).rstrip('/')}/search"
    headers = {
        "User-Agent": getattr(settings, "GEOCODER_USER_AGENT", None)
        or (_ for _ in ()).throw(RuntimeError("Missing required settings: GEOCODER_USER_AGENT")),
        "Accept-Language": "en-US,en;q=0.9",
    }

    def fetch(qry: str) -> list[dict[str, Any]]:
        params = {"format": "json", "limit": 3, "q": qry}
        r = _HTTP.get(base, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []

    q_lower = q.lower()
    queries: list[str] = []
    if "united states" in q_lower or "usa" in q_lower:
        queries.append(q)
    else:
        queries.append(f"{q}, USA")
        queries.append(q)

    parts = [p.strip() for p in q.split(",") if p.strip()]
    if len(parts) >= 3:
        short = ", ".join(parts[:3])
        if short.lower() not in {qq.lower() for qq in queries}:
            queries.append(short)

    last: list[dict[str, Any]] = []
    for qry in queries:
        last = fetch(qry)
        if last:
            item = last[0]
            return LngLat(lng=float(item["lon"]), lat=float(item["lat"]))

    raise ValueError(f"Could not geocode '{q}'")


def haversine_miles(a: LngLat, b: LngLat) -> float:
    r = 3958.7613
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)
    dlat = lat2 - lat1
    dlon = math.radians(b.lng - a.lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def straight_line_route(a: LngLat, b: LngLat, *, points: int = 8) -> dict[str, Any]:
    """
    Offline routing fallback: generate a straight polyline with intermediate points.
    """
    pts = max(2, int(points))
    coords = []
    for i in range(pts):
        t = i / (pts - 1)
        lng = a.lng + (b.lng - a.lng) * t
        lat = a.lat + (b.lat - a.lat) * t
        coords.append([round(lng, 6), round(lat, 6)])

    dist_mi = haversine_miles(a, b)
    dur_s = (dist_mi / 55.0) * 3600.0 if dist_mi > 0 else 0.0
    return {
        "distance": dist_mi * 1609.344,
        "duration": dur_s,
        "geometry": {"type": "LineString", "coordinates": coords},
        "legs": [],
    }


def osrm_route(a: LngLat, b: LngLat) -> dict[str, Any]:
    """
    Route using OSRM public demo server (free).
    Returns GeoJSON line + steps.
    """
    base = getattr(settings, "ROUTER_OSRM_BASE_URL", None)
    if not base or not str(base).strip():
        raise RuntimeError("Missing required settings: ROUTER_OSRM_BASE_URL")
    base = str(base).strip().rstrip("/")
    url = f"{base}/route/v1/driving/{a.lng},{a.lat};{b.lng},{b.lat}"
    params = {"overview": "full", "geometries": "geojson", "steps": "true"}
    r = _HTTP.get(url, params=params, timeout=20)
    r.raise_for_status()
    payload = r.json()
    if payload.get("code") != "Ok":
        raise ValueError("Routing failed")
    routes = payload.get("routes") or []
    if not routes:
        raise ValueError("No route found")
    return routes[0]


def meters_to_miles(m: float) -> float:
    return float(m) / 1609.344


def seconds_to_hours(s: float) -> float:
    return float(s) / 3600.0


def build_turn_by_turn(route: dict[str, Any]) -> list[dict[str, Any]]:
    legs = route.get("legs") or []
    steps: list[dict[str, Any]] = []
    for leg in legs:
        for st in leg.get("steps") or []:
            maneuver = st.get("maneuver") or {}
            name = st.get("name") or ""
            instr = maneuver.get("instruction") or ""
            if not instr and maneuver.get("type"):
                instr = str(maneuver.get("type"))
            steps.append(
                {
                    "instruction": instr if instr else (name or "Continue"),
                    "distance_mi": round(meters_to_miles(st.get("distance") or 0.0), 2),
                    "duration_min": round((st.get("duration") or 0.0) / 60.0, 1),
                    "road_name": name,
                }
            )
    return steps


def plan_stops(distance_mi: float, driving_hours: float) -> dict[str, Any]:
    """
    Simple policy (matches your UI assumptions):
    - fuel stop every 1000 miles
    - 30 min break every 8 hours driving
    """
    fuel_stops = int(math.floor(max(0.0, distance_mi) / 1000.0))
    breaks_30m = int(math.floor(max(0.0, driving_hours) / 8.0))
    break_minutes = breaks_30m * 30
    return {
        "fuelStops": fuel_stops,
        "breakStops": breaks_30m,
        "breakMinutes": break_minutes,
        "stopCount": fuel_stops + breaks_30m,
    }


def add_hours(dt: datetime, hours: float) -> datetime:
    return dt + timedelta(seconds=float(hours) * 3600.0)


def build_multi_day_logs(
    *,
    start_date: date,
    driving_hours: float,
    pickup_on_duty_h: float = 1.0,
    dropoff_on_duty_h: float = 1.0,
    per_fuel_stop_on_duty_h: float = 0.25,
    break_on_duty_h: float = 0.5,
) -> list[dict[str, Any]]:
    """
    Produce an array of daily log sheets. Each sheet includes dutyTotals and a concrete schedule
    of segments across the day that can be rendered as a paper-style ELD graph.

    Notes:
    - Uses a simplified HOS model: max 11h driving/day + 10h off-duty reset at end-of-day.
    - We keep sleeper=0 for now (can be extended).
    """
    remaining = max(0.0, float(driving_hours))
    logs: list[dict[str, Any]] = []

    tz = timezone.utc
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("America/New_York")
        except Exception:
            tz = timezone.utc

    now_et = datetime.now(tz=tz)
    day_idx = 0
    while remaining > 1e-6 and day_idx < 14:
        d = start_date + timedelta(days=day_idx)
        if day_idx == 0:
            day_start = datetime(d.year, d.month, d.day, now_et.hour, now_et.minute, 0, tzinfo=tz)
        else:
            day_start = datetime(d.year, d.month, d.day, 8, 0, 0, tzinfo=tz)

        day_drive = min(11.0, remaining)

        break_count = 1 if day_drive >= 8.0 else 0
        break_total = break_count * break_on_duty_h

        on_duty = 0.0
        if day_idx == 0:
            on_duty += pickup_on_duty_h
        if remaining - day_drive <= 1e-6:
            on_duty += dropoff_on_duty_h
        on_duty += break_total

        sleeper = 0.0
        off_duty = max(0.0, 24.0 - (day_drive + on_duty + sleeper))

        def h(dt_: datetime) -> float:
            base = datetime(dt_.year, dt_.month, dt_.day, 0, 0, 0, tzinfo=tz)
            return (dt_ - base).total_seconds() / 3600.0

        segments: list[dict[str, Any]] = []
        t = day_start

        if day_idx == 0 and pickup_on_duty_h > 0:
            segments.append(
                {
                    "status": "On Duty",
                    "fromHour": round(h(t), 4),
                    "toHour": round(h(add_hours(t, pickup_on_duty_h)), 4),
                    "label": "Pickup / pre-trip",
                }
            )
            t = add_hours(t, pickup_on_duty_h)

        if break_count:
            drive1 = 8.0
            segments.append(
                {
                    "status": "Driving",
                    "fromHour": round(h(t), 4),
                    "toHour": round(h(add_hours(t, drive1)), 4),
                    "label": "Driving",
                }
            )
            t = add_hours(t, drive1)
            segments.append(
                {
                    "status": "On Duty",
                    "fromHour": round(h(t), 4),
                    "toHour": round(h(add_hours(t, break_on_duty_h)), 4),
                    "label": "30-min break",
                }
            )
            t = add_hours(t, break_on_duty_h)
            drive2 = max(0.0, day_drive - drive1)
            if drive2 > 0:
                segments.append(
                    {
                        "status": "Driving",
                        "fromHour": round(h(t), 4),
                        "toHour": round(h(add_hours(t, drive2)), 4),
                        "label": "Driving",
                    }
                )
                t = add_hours(t, drive2)
        else:
            segments.append(
                {
                    "status": "Driving",
                    "fromHour": round(h(t), 4),
                    "toHour": round(h(add_hours(t, day_drive)), 4),
                    "label": "Driving",
                }
            )
            t = add_hours(t, day_drive)

        if remaining - day_drive <= 1e-6 and dropoff_on_duty_h > 0:
            segments.append(
                {
                    "status": "On Duty",
                    "fromHour": round(h(t), 4),
                    "toHour": round(h(add_hours(t, dropoff_on_duty_h)), 4),
                    "label": "Drop-off",
                }
            )
            t = add_hours(t, dropoff_on_duty_h)

        end_of_day = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=tz)
        if t < end_of_day:
            segments.append(
                {
                    "status": "Off Duty",
                    "fromHour": round(h(t), 4),
                    "toHour": 24.0,
                    "label": "Off duty / reset",
                }
            )

        logs.append(
            {
                "dateISO": d.isoformat(),
                "dutyTotals": {
                    "offDutyHours": round(off_duty, 2),
                    "sleeperBerthHours": round(sleeper, 2),
                    "drivingHours": round(day_drive, 2),
                    "onDutyHours": round(on_duty, 2),
                },
                "segments": segments,
            }
        )

        remaining -= day_drive
        day_idx += 1

    return logs


def build_trip_plan(
    *,
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    cycle_hours_used: float,
) -> dict[str, Any]:
    pickup_stop = parse_city_state(pickup_location)
    dropoff_stop = parse_city_state(dropoff_location)

    pickup_ll = geocode_us_location(pickup_location)
    dropoff_ll = geocode_us_location(dropoff_location)

    route = osrm_route(pickup_ll, dropoff_ll)
    geom = route.get("geometry") or {}
    line_coords = (geom.get("coordinates") or []) if geom.get("type") == "LineString" else []

    distance_mi = meters_to_miles(route.get("distance") or 0.0)
    driving_hours = seconds_to_hours(route.get("duration") or 0.0)

    stops = plan_stops(distance_mi, driving_hours)
    pickup_dropoff_on_duty = 2.0
    break_hours = stops["breakMinutes"] / 60.0

    total_trip_time_hours = driving_hours + pickup_dropoff_on_duty + break_hours

    tz = timezone.utc
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("America/New_York")
        except Exception:
            tz = timezone.utc

    estimated_arrival = (datetime.now(tz=tz) + timedelta(seconds=total_trip_time_hours * 3600.0)).isoformat()

    remaining_cycle = max(0.0, 70.0 - float(cycle_hours_used))
    compliance = "compliant" if (driving_hours + pickup_dropoff_on_duty) <= remaining_cycle else "warning"

    logs = build_multi_day_logs(start_date=datetime.now(tz=tz).date(), driving_hours=driving_hours)

    duty_today = logs[0]["dutyTotals"] if logs else {
        "offDutyHours": 24.0,
        "sleeperBerthHours": 0.0,
        "drivingHours": 0.0,
        "onDutyHours": 0.0,
    }

    turn_by_turn = build_turn_by_turn(route)

    return {
        "dateISO": _today_iso(),
        "driverName": "Driver",
        "truckId": "T-0000",
        "trailerId": "",
        "pickup": pickup_stop,
        "dropoff": dropoff_stop,
        "totalDistanceMi": round(distance_mi, 1),
        "drivingHours": round(driving_hours, 2),
        "totalTripTimeHours": round(total_trip_time_hours, 1),
        "compliance": compliance,
        "driverLogs": "completed",
        "carrierName": "Carrier",
        "mainOfficeAddress": "Main Office",
        "totalMilesToday": round(min(distance_mi, distance_mi), 1),
        "dutyTotals": duty_today,
        "estimatedArrivalISO": estimated_arrival,
        "stopsCount": int(stops["stopCount"]),
        "route": {
            "pickupLngLat": [pickup_ll.lng, pickup_ll.lat],
            "dropoffLngLat": [dropoff_ll.lng, dropoff_ll.lat],
            "line": {"type": "LineString", "coordinates": line_coords},
        },
        "routeInstructions": turn_by_turn,
        "stopPlan": stops,
        "eldLogSheets": logs,
        "inputs": {
            "currentLocation": current_location,
            "pickupLocation": pickup_location,
            "dropoffLocation": dropoff_location,
            "cycleHoursUsed": cycle_hours_used,
        },
    }

