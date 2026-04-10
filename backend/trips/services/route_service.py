import requests
from functools import lru_cache
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def _router_api_key() -> str:
    raw = getattr(settings, "ROUTER_ORS_API_KEY", None)
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    return str(getattr(settings, "GEOCODER_API_KEY", "") or "").strip()


def _require_router_api_key() -> str:
    key = _router_api_key()
    if not key:
        raise ValueError(
            "Routing is not configured: set GEOCODER_API_KEY or ROUTER_ORS_API_KEY (OpenRouteService API key)."
        )
    return key


def _ors_headers(api_key: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": api_key,
    }


def _decode_polyline(polyline_str: str, precision: int = 5) -> list[tuple[float, float]]:
    """Google-encoded polyline → ``(lat, lng)`` pairs (ORS default geometry in ``/json``)."""
    coordinates: list[tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0
    factor = float(10**precision)
    n = len(polyline_str)

    while index < n:
        shift = 0
        result = 0
        while True:
            if index >= n:
                break
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift = 0
        result = 0
        while True:
            if index >= n:
                break
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append((lat / factor, lng / factor))

    return coordinates


def _ors_segments_to_legs(segments: object) -> list[dict]:
    legs: list[dict] = []
    if not isinstance(segments, list):
        return [{"steps": []}]
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        steps_out: list[dict] = []
        for st in seg.get("steps") or []:
            if not isinstance(st, dict):
                continue
            instr = str(st.get("instruction") or "").strip()
            if not instr:
                nm = str(st.get("name") or "").strip()
                if nm:
                    instr = nm
            steps_out.append(
                {
                    "distance": float(st.get("distance") or 0),
                    "duration": float(st.get("duration") or 0),
                    "maneuver": {"instruction": instr},
                }
            )
        legs.append({"steps": steps_out})
    return legs if legs else [{"steps": []}]


def _ors_json_route_to_planner_route(route: dict) -> dict:
    """
    ORS Directions ``/json`` route object → planner shape (meters, seconds, GeoJSON-ish line, legs).
    """
    summary = route.get("summary") or {}
    distance = float(summary.get("distance") or 0)
    duration = float(summary.get("duration") or 0)

    coords: list[list[float]] = []
    geom = route.get("geometry")
    if isinstance(geom, str) and geom.strip():
        for lat, lng in _decode_polyline(geom):
            coords.append([lng, lat])
    elif isinstance(geom, dict) and geom.get("type") == "LineString":
        raw = geom.get("coordinates") or []
        if isinstance(raw, list):
            coords = [[float(c[0]), float(c[1])] for c in raw if isinstance(c, (list, tuple)) and len(c) >= 2]

    legs = _ors_segments_to_legs(route.get("segments"))

    return {
        "distance": distance,
        "duration": duration,
        "geometry": {"type": "LineString", "coordinates": coords},
        "legs": legs,
    }


class RouteService:

    @staticmethod
    def _get_session():
        session = requests.Session()
        retry = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset(["GET", "POST"]),
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    @staticmethod
    def _validate_point(point: dict):
        if not point or "lat" not in point or "lng" not in point:
            raise ValueError(f"Invalid coordinate: {point}")

    @staticmethod
    def get_route(start: dict, end: dict):
        """
        Fetch route via OpenRouteService Directions v2 (**json** format).
        Public API returns 406 for ``/geojson`` on some stacks (error 2007); ``/json`` is widely supported.
        https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/json/post
        """
        RouteService._validate_point(start)
        RouteService._validate_point(end)

        key = (
            float(start["lng"]),
            float(start["lat"]),
            float(end["lng"]),
            float(end["lat"]),
        )
        return RouteService._get_route_cached(key)

    @staticmethod
    @lru_cache(maxsize=256)
    def _get_route_cached(key: tuple[float, float, float, float]):
        start_lng, start_lat, end_lng, end_lat = key

        base = str(settings.ROUTER_ORS_BASE_URL).rstrip("/")
        profile = str(getattr(settings, "ROUTER_ORS_PROFILE", "driving-hgv") or "driving-hgv").strip()
        url = f"{base}/v2/directions/{profile}/json"
        timeout_s = float(getattr(settings, "ROUTE_TIMEOUT_SECONDS", 45))
        api_key = _require_router_api_key()

        coordinates = [[start_lng, start_lat], [end_lng, end_lat]]
        try:
            snap_m = int(getattr(settings, "ROUTER_ORS_SNAP_RADIUS_METERS", -1))
        except (TypeError, ValueError):
            snap_m = -1
        # ORS error 2010: default snap radius ~350m; geocoded POIs can sit farther from HGV-accessible roads.
        radiuses = [-1 if snap_m < 0 else max(1, snap_m)] * len(coordinates)

        body = {
            "coordinates": coordinates,
            "radiuses": radiuses,
            "instructions": True,
            "preference": "recommended",
            "units": "m",
            "language": "en",
            "geometry": True,
        }

        session = RouteService._get_session()
        response = session.post(
            url,
            json=body,
            headers=_ors_headers(api_key),
            timeout=timeout_s,
        )

        if not response.ok:
            snippet = (response.text or "").strip().replace("\n", " ")[:500]
            try:
                err_body = response.json().get("error")
                if isinstance(err_body, dict):
                    msg = err_body.get("message")
                    code = err_body.get("code")
                    if msg:
                        snippet = f"[{code}] {msg} - {snippet}"[:500]
                elif isinstance(err_body, str) and err_body.strip():
                    snippet = f"{err_body.strip()} - {snippet}"[:500]
            except (ValueError, TypeError, AttributeError):
                pass
            raise requests.RequestException(f"ORS directions HTTP {response.status_code}: {snippet or response.reason}")

        try:
            data = response.json()
        except ValueError as e:
            raise requests.RequestException(f"ORS directions invalid JSON: {e}") from e

        if not isinstance(data, dict):
            raise ValueError(f"Unexpected ORS directions response type: {type(data)}")

        routes = data.get("routes")
        if not isinstance(routes, list) or not routes:
            raise ValueError(
                f"ORS directions returned no routes (keys={list(data.keys())})",
            )

        route0 = routes[0]
        if not isinstance(route0, dict):
            raise ValueError("ORS directions: invalid route object")

        route = _ors_json_route_to_planner_route(route0)
        return route
