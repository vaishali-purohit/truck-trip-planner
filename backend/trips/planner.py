from __future__ import annotations

import logging
import math
import os
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

import requests

from django.conf import settings

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

CITY_STATE_RE = re.compile(r"^\s*(?P<city>.+?)\s*,\s*(?P<state>[A-Za-z]{2})\s*$")

US_STATE_LOWER_TO_ABBR: dict[str, str] = {
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

CA_PROV_LOWER_TO_ABBR: dict[str, str] = {
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

# Per-process Nominatim spacing (OSMF policy: ~1 req/s). Multiple workers multiply effective rate.
_last_nominatim_request = 0.0


def _nominatim_rate_limit() -> None:
    """Enforce at least 1 second between Nominatim requests in this process."""
    global _last_nominatim_request
    elapsed = time.time() - _last_nominatim_request
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    _last_nominatim_request = time.time()


def _geocoder_headers() -> dict[str, str]:
    """Headers for Nominatim (identifying app; default matches Spotter trip planner)."""
    ua = getattr(settings, "GEOCODER_USER_AGENT", None) or "SpotterTripPlanner/1.0"
    return {"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"}


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

        state = ""
        for token in reversed(parts[1:]):
            t = token.strip()
            if len(t) == 2 and t.isalpha():
                state = t.upper()
                break
            key = t.lower()
            if key in US_STATE_LOWER_TO_ABBR:
                state = US_STATE_LOWER_TO_ABBR[key]
                break
            if key in CA_PROV_LOWER_TO_ABBR:
                state = CA_PROV_LOWER_TO_ABBR[key]
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
    headers = _geocoder_headers()

    def fetch(qry: str) -> list[dict[str, Any]]:
        _nominatim_rate_limit()
        params = {"format": "json", "limit": 3, "q": qry}
        try:
            r = _HTTP.get(base, headers=headers, params=params, timeout=15)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.warning("Nominatim search error for %r: %s", qry, e)
            return []
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


def _haversine_m_coords_xy(a: list[float], b: list[float]) -> float:
    """Great-circle distance in meters between [lng, lat] points."""
    r = 6371000.0
    lng1, lat1 = math.radians(float(a[0])), math.radians(float(a[1]))
    lng2, lat2 = math.radians(float(b[0])), math.radians(float(b[1]))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, h)))


def _route_cumulative_meters(coords: list[list[float]]) -> tuple[list[float], float]:
    if len(coords) < 2:
        return [0.0], 0.0
    cum: list[float] = [0.0]
    for i in range(1, len(coords)):
        cum.append(cum[-1] + _haversine_m_coords_xy(coords[i - 1], coords[i]))
    return cum, cum[-1]


def interp_route_point_by_fraction(coords: list[list[float]], frac: float) -> tuple[float, float]:
    """Point along the polyline by distance fraction in [0, 1]. Returns (lng, lat)."""
    f = max(0.0, min(1.0, float(frac)))
    if not coords:
        return (0.0, 0.0)
    if len(coords) == 1:
        return (float(coords[0][0]), float(coords[0][1]))
    cum, total = _route_cumulative_meters(coords)
    if total <= 0:
        return (float(coords[0][0]), float(coords[0][1]))
    target = f * total
    for i in range(len(cum) - 1):
        c0, c1 = cum[i], cum[i + 1]
        if target <= c1 or i == len(cum) - 2:
            seg_len = c1 - c0 or 1.0
            u = (target - c0) / seg_len
            u = max(0.0, min(1.0, u))
            lng0, lat0 = float(coords[i][0]), float(coords[i][1])
            lng1, lat1 = float(coords[i + 1][0]), float(coords[i + 1][1])
            return (lng0 + (lng1 - lng0) * u, lat0 + (lat1 - lat0) * u)
    return (float(coords[-1][0]), float(coords[-1][1]))


def _format_nominatim_address_row(addr: dict[str, Any]) -> str:
    """Build 'City, ST' from Nominatim address; prefer ISO3166-2-lvl4 when present (US/CA)."""
    cc = (addr.get("country_code") or "").lower()
    iso = addr.get("ISO3166-2-lvl4") or ""
    st_from_iso = ""
    if isinstance(iso, str) and "-" in iso:
        region = iso.split("-", 1)
        if len(region) == 2 and len(region[1]) == 2 and region[1].isalpha():
            prefix = region[0].upper()
            if prefix in ("US", "CA"):
                st_from_iso = region[1].upper()

    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("hamlet")
        or addr.get("municipality")
        or ""
    )
    if not city:
        cty = addr.get("county") or ""
        if isinstance(cty, str) and cty.endswith(" County"):
            city = cty[: -len(" County")].strip()
        else:
            city = str(cty or "").strip()

    if st_from_iso and city:
        return f"{city}, {st_from_iso}"

    state_raw = (addr.get("state") or "").strip()
    st = ""
    if state_raw:
        if len(state_raw) == 2 and state_raw.isalpha():
            st = state_raw.upper()
        elif cc == "us":
            st = US_STATE_LOWER_TO_ABBR.get(state_raw.lower(), state_raw)
        elif cc == "ca":
            st = CA_PROV_LOWER_TO_ABBR.get(state_raw.lower(), state_raw)
        else:
            st = state_raw

    if city and st:
        return f"{city}, {st}"
    if city:
        return city
    return ""


def _reverse_geocode_nominatim_request(lng: float, lat: float) -> str:
    """One Nominatim reverse call (not cached); uses rate limit."""
    base_root = getattr(settings, "GEOCODER_NOMINATIM_BASE_URL", None)
    if not base_root:
        return ""
    _nominatim_rate_limit()
    url = f"{str(base_root).rstrip('/')}/reverse"
    params = {"lat": lat, "lon": lng, "format": "json", "addressdetails": 1}
    try:
        r = _HTTP.get(url, headers=_geocoder_headers(), params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning("Nominatim reverse error for (%.4f, %.4f): %s", lng, lat, e)
        return ""
    if not isinstance(data, dict):
        return ""
    addr = data.get("address")
    if isinstance(addr, dict):
        row = _format_nominatim_address_row(addr)
        if row:
            return row
    disp = data.get("display_name")
    if isinstance(disp, str) and disp.strip():
        parts = [p.strip() for p in disp.split(",") if p.strip()]
        if len(parts) >= 2:
            return f"{parts[0]}, {parts[1]}"
        return parts[0] if parts else ""
    return ""


@lru_cache(maxsize=4096)
def reverse_geocode_us_cached(lng_key: str, lat_key: str) -> str:
    """
    Reverse geocode (Nominatim). Keys are rounded lng/lat strings for cache stability.
    Returns '' on failure or missing config.
    """
    try:
        lng = float(lng_key)
        lat = float(lat_key)
    except ValueError:
        return ""
    return _reverse_geocode_nominatim_request(lng, lat)


def reverse_geocode_lng_lat(lng: float, lat: float) -> str:
    return reverse_geocode_us_cached(f"{lng:.4f}", f"{lat:.4f}")


def _build_route_fraction_place_table(coords: list[list[float]], *, max_samples: int = 18) -> list[tuple[float, str]]:
    """
    Sample the route at evenly spaced distance fractions and reverse-geocode each point.
    Cached per rounded coordinate; keep sample count modest for Nominatim load.
    """
    if len(coords) < 2:
        return []
    n = max(2, min(max_samples, max(6, len(coords) // 80)))
    out: list[tuple[float, str]] = []
    for k in range(n):
        t = k / (n - 1) if n > 1 else 0.0
        lng, lat = interp_route_point_by_fraction(coords, t)
        label = reverse_geocode_lng_lat(lng, lat)
        out.append((t, label))
    return out


def _nearest_place_at_fraction(table: list[tuple[float, str]], frac: float) -> str:
    if not table:
        return ""
    best_t, best_lab = min(table, key=lambda row: abs(row[0] - frac))
    if best_lab:
        return best_lab
    for t, lab in sorted(table, key=lambda row: abs(row[0] - frac)):
        if lab:
            return lab
    return ""


def _per_day_route_fraction_spans(logs: list[dict[str, Any]], distance_mi: float) -> list[tuple[float, float]]:
    dist = max(0.0, float(distance_mi))
    n = max(1, len(logs))
    if dist <= 1e-6:
        return [(i / n, (i + 1) / n) for i in range(n)]
    before = 0.0
    spans: list[tuple[float, float]] = []
    for log in logs:
        m = float(log.get("totalMilesDrivingToday") or 0.0)
        start = before / dist
        end = (before + m) / dist
        spans.append((max(0.0, min(1.0, start)), max(0.0, min(1.0, end))))
        before += m
    return spans


def _clock_mid_global_route_fraction(
    segments: list[dict[str, Any]],
    seg: dict[str, Any],
    day_start_f: float,
    day_end_f: float,
) -> float:
    active = [s for s in segments if float(s.get("toHour", 0)) > float(s.get("fromHour", 0))]
    if not active:
        return day_start_f
    active.sort(key=lambda x: float(x.get("fromHour", 0)))
    day_t0 = float(active[0]["fromHour"])
    day_t1 = float(active[-1]["toHour"])
    denom = day_t1 - day_t0 if day_t1 > day_t0 else 24.0
    mid_h = (float(seg["fromHour"]) + float(seg["toHour"])) / 2.0
    u = (mid_h - day_t0) / denom if denom > 0 else 0.0
    u = max(0.0, min(1.0, u))
    span = day_end_f - day_start_f
    return max(0.0, min(1.0, day_start_f + u * span))


def enrich_eld_log_segment_locations_from_route(
    logs: list[dict[str, Any]],
    line_coords: list[list[float]],
    *,
    pickup_line: str,
    dropoff_line: str,
    distance_mi: float,
) -> None:
    """
    Set each segment's ``location`` to a reverse-geocoded City, ST (or similar) along the route,
    aligned with the day's mile window. Pre-trip / dropoff labels keep pickup/dropoff lines.
    """
    if len(line_coords) < 2 or not logs:
        return
    try:
        table = _build_route_fraction_place_table(line_coords)
    except Exception:
        return
    if not table:
        return
    spans = _per_day_route_fraction_spans(logs, distance_mi)
    for day_idx, log in enumerate(logs):
        if day_idx >= len(spans):
            break
        day_start_f, day_end_f = spans[day_idx]
        segs = log.get("segments")
        if not isinstance(segs, list):
            continue
        for seg in segs:
            if not isinstance(seg, dict):
                continue
            if float(seg.get("toHour", 0)) <= float(seg.get("fromHour", 0)):
                continue
            label = str(seg.get("label") or "")
            low = label.lower()
            if "pre-trip" in low or "pre trip" in low:
                seg["location"] = pickup_line
                continue
            if "dropoff" in low or "drop-off" in low or "unloading" in low:
                seg["location"] = dropoff_line
                continue

            g = _clock_mid_global_route_fraction(segs, seg, day_start_f, day_end_f)
            place = _nearest_place_at_fraction(table, g)
            if place:
                seg["location"] = place


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


def _drive_hours_per_day(driving_hours: float) -> list[float]:
    """Split continuous driving into calendar days (max 11h driving per day)."""
    remaining = max(0.0, float(driving_hours))
    days: list[float] = []
    while remaining > 1e-6 and len(days) < 14:
        days.append(min(11.0, remaining))
        remaining -= days[-1]
    return days


def _segment_remark_location(
    *,
    label: str,
    status: str,
    day_idx: int,
    total_days: int,
    pickup_line: str,
    dropoff_line: str,
    is_trip_complete_day: bool,
) -> str:
    """Human-readable place line for remarks (city, ST style when possible)."""
    low = (label or "").lower()
    if "pickup" in low or "pre-trip" in low or "pre trip" in low:
        return pickup_line
    if "drop" in low:
        return dropoff_line
    if "break" in low:
        return f"En route · {pickup_line} → {dropoff_line}"
    if "fuel" in low:
        return f"En route · {pickup_line} → {dropoff_line}"
    if status == "Off Duty":
        if is_trip_complete_day and ("off duty" in low or "reset" in low):
            return dropoff_line if total_days <= 1 else f"Near {dropoff_line}"
        return "Rest / off duty"
    if status == "Driving":
        if total_days <= 1:
            return f"{pickup_line} → {dropoff_line}"
        return f"En route · {pickup_line} → {dropoff_line}"
    if status == "On Duty":
        return pickup_line if day_idx == 0 else f"En route · {pickup_line} → {dropoff_line}"
    return pickup_line


def _day_from_to_header(*, day_idx: int, total_days: int, pickup_line: str, dropoff_line: str) -> tuple[str, str]:
    if total_days <= 1:
        return pickup_line, dropoff_line
    if day_idx == 0:
        return pickup_line, f"En route toward {dropoff_line}"
    if day_idx == total_days - 1:
        return f"En route from {pickup_line}", dropoff_line
    return f"En route from {pickup_line}", f"En route toward {dropoff_line}"


def build_multi_day_logs(
    *,
    start_date: date,
    driving_hours: float,
    distance_mi: float,
    pickup_line: str,
    dropoff_line: str,
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
    day_drives = _drive_hours_per_day(driving_hours)
    total_days = max(len(day_drives), 1)
    dist = max(0.0, float(distance_mi))
    drive_h = max(1e-9, float(driving_hours))

    logs: list[dict[str, Any]] = []

    tz = timezone.utc
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("America/New_York")
        except Exception:
            tz = timezone.utc

    now_et = datetime.now(tz=tz)

    for day_idx, day_drive in enumerate(day_drives):
        d = start_date + timedelta(days=day_idx)
        if day_idx == 0:
            day_start = datetime(d.year, d.month, d.day, now_et.hour, now_et.minute, 0, tzinfo=tz)
        else:
            day_start = datetime(d.year, d.month, d.day, 8, 0, 0, tzinfo=tz)

        remaining_after = sum(day_drives[day_idx + 1 :])
        is_last_day = remaining_after <= 1e-6

        break_count = 1 if day_drive >= 8.0 else 0
        break_total = break_count * break_on_duty_h

        on_duty = 0.0
        if day_idx == 0:
            on_duty += pickup_on_duty_h
        if is_last_day:
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
                    "label": "Pre-trip inspection",
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

        if is_last_day and dropoff_on_duty_h > 0:
            segments.append(
                {
                    "status": "On Duty",
                    "fromHour": round(h(t), 4),
                    "toHour": round(h(add_hours(t, dropoff_on_duty_h)), 4),
                    "label": "Dropoff — unloading cargo",
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
                    "label": "Off duty",
                }
            )

        miles_today = round((day_drive / drive_h) * dist, 1)
        from_loc, to_loc = _day_from_to_header(
            day_idx=day_idx,
            total_days=total_days,
            pickup_line=pickup_line,
            dropoff_line=dropoff_line,
        )

        for i, seg in enumerate(segments):
            seg["location"] = _segment_remark_location(
                label=str(seg.get("label") or ""),
                status=str(seg.get("status") or ""),
                day_idx=day_idx,
                total_days=total_days,
                pickup_line=pickup_line,
                dropoff_line=dropoff_line,
                is_trip_complete_day=is_last_day,
            )

        logs.append(
            {
                "dateISO": d.isoformat(),
                "dayIndex": day_idx + 1,
                "fromLocation": from_loc,
                "toLocation": to_loc,
                "totalMilesDrivingToday": miles_today,
                "dutyTotals": {
                    "offDutyHours": round(off_duty, 2),
                    "sleeperBerthHours": round(sleeper, 2),
                    "drivingHours": round(day_drive, 2),
                    "onDutyHours": round(on_duty, 2),
                },
                "segments": segments,
            }
        )

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

    tz = timezone.utc
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("America/New_York")
        except Exception:
            tz = timezone.utc

    remaining_cycle = max(0.0, 70.0 - float(cycle_hours_used))
    compliance = "compliant" if (driving_hours + pickup_dropoff_on_duty) <= remaining_cycle else "warning"

    start_d = datetime.now(tz=tz).date()
    pickup_line = f"{pickup_stop['city']}, {pickup_stop['state']}".strip().strip(",")
    dropoff_line = f"{dropoff_stop['city']}, {dropoff_stop['state']}".strip().strip(",")
    logs = build_multi_day_logs(
        start_date=start_d,
        driving_hours=driving_hours,
        distance_mi=distance_mi,
        pickup_line=pickup_line or "Origin",
        dropoff_line=dropoff_line or "Destination",
    )

    # Trip Summary / ETA: include simplified HOS between multi-day logs and fuel-stop on-duty (matches log assumptions).
    log_days = max(len(logs), 1)
    between_driving_day_off_h = max(0, log_days - 1) * 10.0
    fuel_stop_on_duty_h = float(stops.get("fuelStops") or 0) * 0.25
    total_trip_time_hours = (
        driving_hours + pickup_dropoff_on_duty + break_hours + between_driving_day_off_h + fuel_stop_on_duty_h
    )
    estimated_arrival = (datetime.now(tz=tz) + timedelta(seconds=total_trip_time_hours * 3600.0)).isoformat()
    if line_coords and len(line_coords) >= 2:
        try:
            enrich_eld_log_segment_locations_from_route(
                logs,
                line_coords,
                pickup_line=pickup_line or "Origin",
                dropoff_line=dropoff_line or "Destination",
                distance_mi=distance_mi,
            )
        except Exception:
            pass

    duty_agg = {
        "offDutyHours": 0.0,
        "sleeperBerthHours": 0.0,
        "drivingHours": 0.0,
        "onDutyHours": 0.0,
    }
    for log in logs:
        dt = log.get("dutyTotals") or {}
        duty_agg["offDutyHours"] += float(dt.get("offDutyHours") or 0.0)
        duty_agg["sleeperBerthHours"] += float(dt.get("sleeperBerthHours") or 0.0)
        duty_agg["drivingHours"] += float(dt.get("drivingHours") or 0.0)
        duty_agg["onDutyHours"] += float(dt.get("onDutyHours") or 0.0)
    for k in duty_agg:
        duty_agg[k] = round(duty_agg[k], 2)

    duty_today = duty_agg if logs else {
        "offDutyHours": 24.0,
        "sleeperBerthHours": 0.0,
        "drivingHours": 0.0,
        "onDutyHours": 0.0,
    }
    miles_day_one = float(logs[0]["totalMilesDrivingToday"]) if logs else 0.0

    turn_by_turn = build_turn_by_turn(route)

    return {
        "dateISO": _today_iso(),
        "driverName": "Driver",
        "truckId": "T-1234",
        "trailerId": "TR-5678",
        "pickup": pickup_stop,
        "dropoff": dropoff_stop,
        "totalDistanceMi": round(distance_mi, 1),
        "drivingHours": round(driving_hours, 2),
        "totalTripTimeHours": round(total_trip_time_hours, 1),
        "compliance": compliance,
        "driverLogs": "completed",
        "carrierName": "Spotter Freight LLC",
        "mainOfficeAddress": "123 Main St, Dallas, TX",
        "totalMilesToday": round(miles_day_one, 1),
        "dutyTotals": duty_today,
        "totalLogDays": len(logs),
        "estimatedArrivalISO": estimated_arrival,
        "stopsCount": int(stops["stopCount"]),
        "route": {
            "pickupLngLat": [pickup_ll.lng, pickup_ll.lat],
            "dropoffLngLat": [dropoff_ll.lng, dropoff_ll.lat],
            "pickupLocationName": pickup_line or "Pickup",
            "dropoffLocationName": dropoff_line or "Drop-off",
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

