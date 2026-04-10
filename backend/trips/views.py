from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

import requests

from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema

from .serializers import (
    ApiErrorSerializer,
    LocationSuggestionSerializer,
    TripPlanCreateSerializer,
    TripPlanListItemSerializer,
)

from .services.trip_service import TripService
from .services.location_service import LocationService
from .repositories.trip_repository import TripRepository
from django.conf import settings


def _default_str(setting_name: str) -> str:
    v = getattr(settings, setting_name, "")
    return str(v).strip() if v is not None else ""


def _auto_truck_id(trip_no: int | None) -> str:
    return f"TRK-{trip_no}" if trip_no is not None else ""


def _auto_trailer_id(trip_no: int | None) -> str:
    return f"TRL-{trip_no}" if trip_no is not None else ""


def _auto_driver_name(trip_no: int | None) -> str:
    if trip_no is None:
        return "Driver"
    return f"Driver {trip_no}"


def _auto_carrier_name() -> str:
    return "Carrier"


def _auto_main_office_address() -> str:
    return "Main Office"


def _blank(v: object) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _normalize_trip_result(result: object, trip_no: int | None) -> object:
    """
    Ensure list/detail responses always include fields used by Trip History filters/sorting.
    This keeps older saved trips working even if their stored JSON is missing fields.
    """
    if not isinstance(result, dict):
        return result

    if _blank(result.get("carrierName")):
        result["carrierName"] = _default_str("DEFAULT_CARRIER_NAME") or _auto_carrier_name()
    if _blank(result.get("mainOfficeAddress")):
        result["mainOfficeAddress"] = _default_str("DEFAULT_MAIN_OFFICE_ADDRESS") or _auto_main_office_address()
    if _blank(result.get("driverName")):
        result["driverName"] = _default_str("DEFAULT_DRIVER_NAME") or _auto_driver_name(trip_no)
    if _blank(result.get("truckId")):
        result["truckId"] = _default_str("DEFAULT_TRUCK_ID") or _auto_truck_id(trip_no)
    if _blank(result.get("trailerId")):
        result["trailerId"] = _default_str("DEFAULT_TRAILER_ID") or _auto_trailer_id(trip_no)
    if _blank(result.get("driverLogs")):
        sheets = result.get("eldLogSheets")
        has_segments = False
        if isinstance(sheets, list):
            for sh in sheets:
                if isinstance(sh, dict) and isinstance(sh.get("segments"), list) and sh.get("segments"):
                    has_segments = True
                    break
        result["driverLogs"] = "completed" if has_segments else "pending"

    return result

@extend_schema(
    request=TripPlanCreateSerializer,
    responses={
        201: TripPlanListItemSerializer,
        400: ApiErrorSerializer,
        502: ApiErrorSerializer,
    },
    examples=[
        OpenApiExample(
            "Create trip (request)",
            value={
                "currentLocation": "Chicago, IL",
                "pickupLocation": "Chicago, IL",
                "dropoffLocation": "Denver, CO",
                "cycleHoursUsed": 12.5,
            },
            request_only=True,
        ),
        OpenApiExample(
            "Create trip (201)",
            value={
                "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                "tripNo": 1900,
                "createdAt": "2026-04-10T10:00:00Z",
                "result": {
                    "dateISO": "2026-04-10",
                    "pickup": {"city": "Chicago", "state": "IL"},
                    "dropoff": {"city": "Denver", "state": "CO"},
                    "totalDistanceMi": 1004.2,
                    "drivingHours": 15.8,
                    "totalTripTimeHours": 20.0,
                    "compliance": "warning",
                    "estimatedArrivalISO": "2026-04-11T06:00:00-04:00",
                    "stopsCount": 2,
                    "route": {
                        "currentLngLat": [-87.6298, 41.8781],
                        "pickupLngLat": [-87.6298, 41.8781],
                        "dropoffLngLat": [-104.9903, 39.7392],
                        "line": {"type": "LineString", "coordinates": []},
                    },
                    "routeInstructions": [],
                    "stopPlan": {"stopCount": 2, "fuelStops": 2, "breakMinutes": 30},
                    "eldLogSheets": [],
                    "dutyTotals": {
                        "offDutyHours": 0,
                        "sleeperBerthHours": 0,
                        "drivingHours": 0,
                        "onDutyHours": 0,
                    },
                },
            },
            response_only=True,
            status_codes=["201"],
        ),
        OpenApiExample(
            "Create trip (400)",
            value={"error": "invalid_input_or_no_result", "message": "Location not found: X"},
            response_only=True,
            status_codes=["400"],
        ),
        OpenApiExample(
            "Create trip (502)",
            value={
                "error": "upstream_unavailable",
                "message": "Geocoding/routing service unavailable",
                "detail": "ConnectionError(...)",
            },
            response_only=True,
            status_codes=["502"],
        ),
    ],
)
class TripPlanView(APIView):

    def post(self, request):
        ser = TripPlanCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        try:
            obj = TripService.create_trip(ser.validated_data)
        except ValueError as e:
            return Response(
                {"error": "invalid_input_or_no_result", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException as e:
            return Response(
                {
                    "error": "upstream_unavailable",
                    "message": "Geocoding/routing service unavailable",
                    "detail": str(e),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "id": obj.id,
                "tripNo": obj.trip_no,
                "createdAt": obj.created_at,
                "result": _normalize_trip_result(obj.result, obj.trip_no),
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    responses=TripPlanListItemSerializer(many=True),
    parameters=[
        OpenApiParameter(
            name="limit",
            type=int,
            required=False,
            description="Max trips to return (0-200). Defaults to 20.",
        )
    ],
    examples=[
        OpenApiExample(
            "Trip list (200)",
            # drf-spectacular wraps list responses automatically for many=True.
            # Provide a single item here to avoid nested arrays in the OpenAPI example.
            value={
                "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                "tripNo": 1900,
                "createdAt": "2026-04-10T10:00:00Z",
                "result": {"dateISO": "2026-04-10", "pickup": {"city": "Chicago", "state": "IL"}},
            },
            response_only=True,
            status_codes=["200"],
        )
    ],
)
class TripListView(APIView):

    def get(self, request):
        limit = request.query_params.get("limit", 20)
        trips = TripRepository.list(limit=limit)

        data = [
            {
                "id": t.id,
                "tripNo": t.trip_no,
                "createdAt": t.created_at,
                "result": _normalize_trip_result(t.result, t.trip_no),
            }
            for t in trips
        ]

        return Response(data)


@extend_schema(
    responses={
        200: TripPlanListItemSerializer,
        404: ApiErrorSerializer,
    },
    examples=[
        OpenApiExample(
            "Trip detail (200)",
            value={
                "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                "tripNo": 1900,
                "createdAt": "2026-04-10T10:00:00Z",
                "result": {"dateISO": "2026-04-10", "pickup": {"city": "Chicago", "state": "IL"}},
            },
            response_only=True,
            status_codes=["200"],
        ),
        OpenApiExample(
            "Trip detail (404)",
            value={"error": "not_found", "message": "Trip not found"},
            response_only=True,
            status_codes=["404"],
        ),
    ],
)
class TripDetailView(APIView):

    def get(self, request, trip_no):
        t = TripRepository.get_by_trip_no(trip_no)

        if not t:
            return Response(
                {"error": "not_found", "message": "Trip not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "id": t.id,
                "tripNo": t.trip_no,
                "createdAt": t.created_at,
                "result": _normalize_trip_result(t.result, t.trip_no),
            }
        )


@extend_schema(
    responses=LocationSuggestionSerializer(many=True),
    examples=[
        OpenApiExample(
            "Location search (200)",
            # many=True will wrap this into a list in the generated schema
            value={"label": "Denver, Colorado, United States", "lat": "39.7392364", "lon": "-104.9848623"},
            response_only=True,
            status_codes=["200"],
        )
    ],
)
class LocationSearchView(APIView):

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([], status=status.HTTP_200_OK)

        try:
            limit = int(request.query_params.get("limit", 8))
        except ValueError:
            limit = 8

        try:
            items = LocationService.search(q, limit)
        except ValueError as e:
            return Response(
                {"error": "invalid_input_or_no_result", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException as e:
            return Response(
                {
                    "error": "upstream_unavailable",
                    "message": "OpenRouteService geocoder unavailable",
                    "detail": str(e),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            [
                {
                    "label": label,
                    "lat": it.get("lat"),
                    "lon": it.get("lon"),
                }
                for it in items
                if (label := (it.get("display_name") or it.get("name") or "").strip())
            ]
        )
