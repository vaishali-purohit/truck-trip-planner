import requests
from functools import lru_cache
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

class RouteService:

    @staticmethod
    def _get_session():
        """
        Session with retry strategy
        """
        session = requests.Session()

        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset(["GET"]),
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
        Fetch route from OSRM
        Cached to reduce repeated calls
        """

        RouteService._validate_point(start)
        RouteService._validate_point(end)

        # dicts are unhashable, so cache by a stable tuple key
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

        base = str(settings.ROUTER_OSRM_BASE_URL).rstrip("/")
        url = f"{base}/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}"

        session = RouteService._get_session()

        response = session.get(
            url,
            params={
                "overview": "full",
                "geometries": "geojson",
                "steps": "true",
            },
            timeout=float(getattr(settings, "ROUTE_TIMEOUT_SECONDS", 20)),
        )

        response.raise_for_status()
        data = response.json()

        if data.get("code") != "Ok":
            raise ValueError(f"Routing failed: {data}")

        routes = data.get("routes")
        if not routes:
            raise ValueError("No routes returned from OSRM")

        return routes[0]
