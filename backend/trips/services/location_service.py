import requests
from functools import lru_cache
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

class LocationService:

    @staticmethod
    def _base_url():
        return str(settings.GEOCODER_NOMINATIM_BASE_URL).rstrip("/")

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
    def search(q: str, limit: int = 5):
        """
        Returns raw location search results from Nominatim
        Cached to reduce API calls
        """
        session = LocationService._get_session()
        res = session.get(
            f"{LocationService._base_url()}/search",
            params={
                "q": q,
                "format": "jsonv2",
                "addressdetails": 1,
                "limit": limit,
            },
            headers={"User-Agent": settings.GEOCODER_USER_AGENT},
            timeout=float(getattr(settings, "LOCATION_SEARCH_TIMEOUT_SECONDS", 8)),
        )

        res.raise_for_status()
        data = res.json()

        return data or []

    @staticmethod
    @lru_cache(maxsize=512)
    def geocode(q: str):
        """
        Returns a single best match location (normalized)
        Used by planner
        """
        results = LocationService.search(q, limit=1)

        if not results:
            raise ValueError(f"Location not found: {q}")

        loc = results[0]

        return {
            "lat": float(loc["lat"]),
            "lng": float(loc["lon"]),
            "display_name": loc.get("display_name"),
        }
