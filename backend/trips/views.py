from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

import requests
from django.conf import settings

from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, extend_schema

from .models import TripPlan
from .planner import build_trip_plan
from .serializers import (
    ApiErrorSerializer,
    LocationSuggestionSerializer,
    TripPlanCreateSerializer,
    TripPlanListItemSerializer,
)


class TripPlanView(APIView):
    """
    POST /api/trip/plan/
    Input: { currentLocation, pickupLocation, dropoffLocation, cycleHoursUsed }
    Output: { id, result }
    """

    @extend_schema(
        operation_id="createTripPlan",
        summary="Generate a trip plan (route + HOS/ELD logs)",
        description=(
            "Creates a trip plan and persists it.\n\n"
            "The planner may call external services for geocoding and routing."
        ),
        request=TripPlanCreateSerializer,
        responses={
            201: OpenApiResponse(
                description="Created trip plan payload (includes `id` and `tripNo`).",
                response=dict,
            ),
            400: OpenApiResponse(description="Validation/planner error.", response=ApiErrorSerializer),
            502: OpenApiResponse(description="Upstream geocoder/router unavailable.", response=ApiErrorSerializer),
        },
        examples=[
            OpenApiExample(
                "Request (example)",
                value={
                    "currentLocation": "Chicago, IL",
                    "pickupLocation": "Chicago, IL",
                    "dropoffLocation": "Denver, CO",
                    "cycleHoursUsed": 12.5,
                },
                request_only=True,
            ),
            OpenApiExample(
                "400 invalid input",
                value={"error": "invalid_input_or_no_result", "message": "Location is required"},
                response_only=True,
                status_codes=["400"],
            ),
            OpenApiExample(
                "502 upstream unavailable",
                value={
                    "error": "upstream_unavailable",
                    "message": "Geocoding/routing service is unavailable. Try again later.",
                    "detail": "Network error",
                },
                response_only=True,
                status_codes=["502"],
            ),
        ],
    )
    def post(self, request):
        ser = TripPlanCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = ser.validated_data

        try:
            plan = build_trip_plan(
                current_location=v["currentLocation"],
                pickup_location=v["pickupLocation"],
                dropoff_location=v["dropoffLocation"],
                cycle_hours_used=float(v["cycleHoursUsed"]),
            )
        except ValueError as e:
            return Response(
                {"error": "invalid_input_or_no_result", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException as e:
            return Response(
                {
                    "error": "upstream_unavailable",
                    "message": "Geocoding/routing service is unavailable. Try again later.",
                    "detail": str(e),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        obj = TripPlan.objects.create(
            current_location=v["currentLocation"],
            pickup_location=v["pickupLocation"],
            dropoff_location=v["dropoffLocation"],
            cycle_hours_used=float(v["cycleHoursUsed"]),
            result=plan,
        )

        out = {
            "id": str(obj.id),
            "tripNo": obj.trip_no,
            "createdAt": obj.created_at.isoformat(),
            "result": obj.result,
        }
        return Response(out, status=status.HTTP_201_CREATED)


class TripListView(APIView):
    """
    GET /api/trip/
    Returns an array of TripSummary-like objects (id + result subset).
    """

    @extend_schema(
        operation_id="listTrips",
        summary="List recent trip plans",
        description="Returns up to 200 most recent saved trip plans.",
        responses={
            200: OpenApiResponse(
                response=TripPlanListItemSerializer(many=True),
                description="Array of trip plan payloads.",
            )
        },
    )
    def get(self, request):
        items = []
        for t in TripPlan.objects.all()[:200]:
            items.append(
                {
                    "id": str(t.id),
                    "tripNo": t.trip_no,
                    "createdAt": t.created_at.isoformat(),
                    "result": t.result,
                }
            )
        return Response(items)


class TripDetailView(APIView):
    """
    GET /api/trip/<uuid>/
    Returns the planned TripDetails payload.
    """

    @extend_schema(
        operation_id="getTripById",
        summary="Fetch a single trip plan by id",
        parameters=[
            OpenApiParameter(
                name="trip_id",
                type=str,
                location=OpenApiParameter.PATH,
                description="Trip UUID.",
            )
        ],
        responses={
            200: OpenApiResponse(response=dict, description="Trip plan payload."),
            404: OpenApiResponse(description="Trip not found.", response=ApiErrorSerializer),
        },
    )
    def get(self, request, trip_id):
        try:
            t = TripPlan.objects.get(id=trip_id)
        except TripPlan.DoesNotExist:
            return Response(
                {"error": "not_found", "message": "Trip not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "id": str(t.id),
                "tripNo": t.trip_no,
                "createdAt": t.created_at.isoformat(),
                "result": t.result,
            }
        )


class LocationSearchView(APIView):
    """
    GET /api/locations/search/?q=denver
    Returns lightweight location suggestions from an online geocoder.
    """

    @extend_schema(
        operation_id="searchLocations",
        summary="Search locations (autocomplete)",
        parameters=[
            OpenApiParameter(
                name="q",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Search query string.",
                required=False,
            ),
            OpenApiParameter(
                name="limit",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Max number of suggestions (1–20). Default 8.",
                required=False,
            ),
        ],
        responses={
            200: LocationSuggestionSerializer(many=True),
            500: OpenApiResponse(description="Server missing geocoder config.", response=ApiErrorSerializer),
            502: OpenApiResponse(description="Upstream geocoder unavailable.", response=ApiErrorSerializer),
        },
        examples=[
            OpenApiExample(
                "Response (example)",
                value=[
                    {"label": "Denver, Denver County, Colorado, United States", "lat": "39.7392", "lon": "-104.9903"}
                ],
                response_only=True,
                status_codes=["200"],
            )
        ],
    )
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([], status=status.HTTP_200_OK)

        limit = request.query_params.get("limit") or "8"
        try:
            limit_int = max(1, min(20, int(limit)))
        except ValueError:
            limit_int = 8

        base_url = getattr(settings, "GEOCODER_NOMINATIM_BASE_URL", None)
        if not base_url:
            return Response(
                {
                    "error": "server_misconfigured",
                    "message": "Missing GEOCODER_NOMINATIM_BASE_URL configuration.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        base_url = str(base_url).rstrip("/")

        url = f"{base_url}/search"
        params = {
            "q": q,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": limit_int,
        }

        user_agent = getattr(settings, "GEOCODER_USER_AGENT", None)
        if not user_agent:
            return Response(
                {
                    "error": "server_misconfigured",
                    "message": "Missing GEOCODER_USER_AGENT configuration.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        headers = {"User-Agent": str(user_agent)}

        try:
            timeout = float(getattr(settings, "LOCATION_SEARCH_TIMEOUT_SECONDS", 8))
            res = requests.get(url, params=params, headers=headers, timeout=timeout)
            res.raise_for_status()
            items = res.json() or []
        except requests.RequestException as e:
            return Response(
                {
                    "error": "upstream_unavailable",
                    "message": "Location search service is unavailable. Try again later.",
                    "detail": str(e),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        out = []
        for it in items[:limit_int]:
            label = it.get("display_name") or ""
            if not label:
                continue
            out.append(
                {
                    "label": label,
                    "lat": it.get("lat"),
                    "lon": it.get("lon"),
                }
            )

        return Response(out, status=status.HTTP_200_OK)
