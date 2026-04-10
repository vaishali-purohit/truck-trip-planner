import json
import time

import requests
from functools import lru_cache
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_last_geocoder_request = 0.0


def _geocoder_rate_limit() -> None:
    global _last_geocoder_request
    interval = float(getattr(settings, "GEOCODER_MIN_INTERVAL_SECONDS", 0.5))
    if interval <= 0:
        return
    elapsed = time.time() - _last_geocoder_request
    if elapsed < interval:
        time.sleep(interval - elapsed)
    _last_geocoder_request = time.time()


def _ors_api_key() -> str:
    return str(getattr(settings, "GEOCODER_API_KEY", "") or "").strip()


def _require_ors_api_key() -> str:
    key = _ors_api_key()
    if not key:
        raise ValueError(
            "Geocoding is not configured: set GEOCODER_API_KEY (OpenRouteService API key)."
        )
    return key


def _ors_http_headers(api_key: str) -> dict[str, str]:
    """
    ORS Security API Key (GET): use ``Authorization`` and/or query ``api_key``.
    We send both so either pattern works; see ORS account / API docs.
    """
    h = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": api_key,
    }
    ua = str(getattr(settings, "GEOCODER_HTTP_USER_AGENT", "") or "").strip()
    if ua:
        h["User-Agent"] = ua
    return h


def _geocoder_http_error(res: requests.Response) -> requests.RequestException:
    snippet = (res.text or "").strip().replace("\n", " ")[:500]
    try:
        err = res.json().get("error")
        if isinstance(err, str) and err.strip():
            snippet = f"{err.strip()} - {snippet}"[:500]
    except (ValueError, TypeError, AttributeError):
        pass
    return requests.RequestException(f"Geocoder HTTP {res.status_code}: {snippet or res.reason}")


def _primary_country_code(raw: str) -> str | None:
    s = (raw or "").strip().lower()
    if not s:
        return None
    first = s.split(",")[0].strip()
    return first or None


def _parse_ors_feature_collection(data: object) -> list[dict]:
    """Normalize ORS (Pelias) GeoJSON FeatureCollection to Nominatim-shaped dicts."""
    if not isinstance(data, dict):
        return []
    features = data.get("features")
    if not isinstance(features, list):
        return []

    out: list[dict] = []
    for f in features:
        if not isinstance(f, dict):
            continue
        geom = f.get("geometry")
        if not isinstance(geom, dict):
            continue
        coords = geom.get("coordinates")
        if not isinstance(coords, (list, tuple)) or len(coords) < 2:
            continue
        try:
            lng = float(coords[0])
            lat = float(coords[1])
        except (TypeError, ValueError):
            continue

        props = f.get("properties")
        if not isinstance(props, dict):
            props = {}
        label = (props.get("label") or props.get("name") or "").strip()

        out.append(
            {
                "lat": lat,
                "lon": lng,
                "display_name": label or None,
            }
        )
    return out


class LocationService:

    @staticmethod
    def _base_url() -> str:
        return str(settings.GEOCODER_ORS_BASE_URL).rstrip("/")

    @staticmethod
    def _get_session():
        session = requests.Session()

        retry = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset(["GET"]),
        )

        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    @staticmethod
    @lru_cache(maxsize=512)
    def _geocode_request_cached(
        base_url: str,
        path: str,
        country: str,
        q: str,
        limit: int,
    ):
        """
        ORS Geocode GET path, e.g. ``/geocode/autocomplete`` (Basic keys expose this
        in the dashboard; ``/geocode/search`` is often a separate / unavailable tier).
        Cached per (base, path, country filter, query, limit).
        """
        _geocoder_rate_limit()

        api_key = _require_ors_api_key()
        params: dict[str, str | int] = {
            "api_key": api_key,
            "text": q,
            "size": limit,
        }
        cc = _primary_country_code(country)
        if cc:
            params["boundary.country"] = cc

        session = LocationService._get_session()
        url = f"{base_url}{path}"
        res = session.get(
            url,
            params=params,
            headers=_ors_http_headers(api_key),
            timeout=float(getattr(settings, "LOCATION_SEARCH_TIMEOUT_SECONDS", 8)),
        )

        if not res.ok:
            raise _geocoder_http_error(res)
        try:
            payload = res.json()
        except json.JSONDecodeError as e:
            snippet = (res.text or "")[:300].replace("\n", " ")
            raise requests.RequestException(
                f"Geocoder returned non-JSON (HTTP {res.status_code}): {snippet}"
            ) from e
        return _parse_ors_feature_collection(payload)

    @staticmethod
    def search(q: str, limit: int = 5):
        """
        Location suggestions via OpenRouteService ``/geocode/autocomplete``.
        Basic ORS keys typically include this micro-endpoint quota (not always ``/search``).
        Throttle-friendly: respect ``GEOCODER_MIN_INTERVAL_SECONDS``.
        https://openrouteservice.org/dev/#/api-docs/geocode
        """
        base_url = LocationService._base_url()
        country = str(getattr(settings, "GEOCODER_COUNTRY_CODES", "") or "").strip()
        return LocationService._geocode_request_cached(
            base_url,
            "/geocode/autocomplete",
            country,
            q,
            limit,
        )

    @staticmethod
    def geocode(q: str):
        """Resolve one place: best autocomplete hit (``/geocode/autocomplete``, size=1)."""
        base_url = LocationService._base_url()
        country = str(getattr(settings, "GEOCODER_COUNTRY_CODES", "") or "").strip()
        results = LocationService._geocode_request_cached(
            base_url,
            "/geocode/autocomplete",
            country,
            q,
            1,
        )

        if not results:
            raise ValueError(f"Location not found: {q}")

        loc = results[0]

        return {
            "lat": float(loc["lat"]),
            "lng": float(loc["lon"]),
            "display_name": loc.get("display_name"),
        }
