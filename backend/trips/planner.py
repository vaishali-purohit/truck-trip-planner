from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from django.conf import settings

from trips.services.location_service import LocationService
from trips.services.route_service import RouteService

from trips.utils import (
    meters_to_miles,
    seconds_to_hours,
)
from trips.eld import (
    build_multi_day_logs,
    enrich_eld_log_segment_locations_from_route,
)
from trips.helpers import (
    parse_city_state,
    build_turn_by_turn,
    plan_stops,
)

def _get_timezone():
    try:
        return ZoneInfo("America/New_York")
    except Exception:
        return timezone.utc


def build_trip_plan(
    *,
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    cycle_hours_used: float,
) -> dict:
    """
    Main orchestration function
    """

    tz = _get_timezone()

    if not (current_location or "").strip():
        raise ValueError("currentLocation is required")
    if not (pickup_location or "").strip():
        raise ValueError("pickupLocation is required")
    if not (dropoff_location or "").strip():
        raise ValueError("dropoffLocation is required")

    # Parse locations
    pickup_stop = parse_city_state(pickup_location)
    dropoff_stop = parse_city_state(dropoff_location)

    # Geocode using service
    try:
        pickup_ll = LocationService.geocode(pickup_location)
    except requests.RequestException as e:
        raise requests.RequestException(f"geocoding_failed: pickup: {e}") from e

    try:
        dropoff_ll = LocationService.geocode(dropoff_location)
    except requests.RequestException as e:
        raise requests.RequestException(f"geocoding_failed: dropoff: {e}") from e

    # Route using service
    try:
        route = RouteService.get_route(pickup_ll, dropoff_ll)
    except requests.RequestException as e:
        raise requests.RequestException(f"routing_failed: {e}") from e

    line_coords = (
        route.get("geometry", {}).get("coordinates", [])
        if route.get("geometry", {}).get("type") == "LineString"
        else []
    )

    # Metrics
    distance_mi = meters_to_miles(route.get("distance", 0))
    driving_hours = seconds_to_hours(route.get("duration", 0))

    # Stops
    stops = plan_stops(distance_mi, driving_hours)

    # Compliance
    remaining_cycle = max(0.0, 70.0 - float(cycle_hours_used))
    compliance = (
        "compliant"
        if (driving_hours + 2.0) <= remaining_cycle
        else "warning"
    )

    # Labels
    pickup_line = f"{pickup_stop['city']}, {pickup_stop['state']}".strip(", ")
    dropoff_line = f"{dropoff_stop['city']}, {dropoff_stop['state']}".strip(", ")

    # Logs
    logs = build_multi_day_logs(
        start_date=datetime.now(tz=tz).date(),
        driving_hours=driving_hours,
        distance_mi=distance_mi,
        pickup_line=pickup_line or "Origin",
        dropoff_line=dropoff_line or "Destination",
    )

    # Enrich route locations
    if line_coords:
        try:
            enrich_eld_log_segment_locations_from_route(
                logs,
                line_coords,
                pickup_line=pickup_line,
                dropoff_line=dropoff_line,
                distance_mi=distance_mi,
            )
        except Exception:
            pass

    # Total time
    total_trip_time_hours = (
        driving_hours
        + 2.0
        + (stops["breakMinutes"] / 60.0)
        + max(0, len(logs) - 1) * 10.0
        + stops["fuelStops"] * 0.25
    )

    eta = (
        datetime.now(tz=tz)
        + timedelta(hours=total_trip_time_hours)
    ).isoformat()

    # Duty aggregation
    duty_totals = {
        "offDutyHours": 0,
        "sleeperBerthHours": 0,
        "drivingHours": 0,
        "onDutyHours": 0,
    }

    for log in logs:
        dt = log.get("dutyTotals", {})
        for k in duty_totals:
            duty_totals[k] += float(dt.get(k, 0))

    # Final response
    return {
        "dateISO": datetime.now(tz=tz).date().isoformat(),
        "driverName": getattr(settings, "DEFAULT_DRIVER_NAME", "") or "",
        "truckId": getattr(settings, "DEFAULT_TRUCK_ID", "") or "",
        "trailerId": getattr(settings, "DEFAULT_TRAILER_ID", "") or "",
        "carrierName": getattr(settings, "DEFAULT_CARRIER_NAME", "") or "",
        "mainOfficeAddress": getattr(settings, "DEFAULT_MAIN_OFFICE_ADDRESS", "") or "",
        "pickup": pickup_stop,
        "dropoff": dropoff_stop,
        "totalDistanceMi": round(distance_mi, 1),
        "drivingHours": round(driving_hours, 2),
        "totalTripTimeHours": round(total_trip_time_hours, 1),
        "totalMilesToday": round(distance_mi, 1),
        "compliance": compliance,
        "estimatedArrivalISO": eta,
        "stopsCount": stops["stopCount"],
        "route": {
            "pickupLngLat": [pickup_ll["lng"], pickup_ll["lat"]],
            "dropoffLngLat": [dropoff_ll["lng"], dropoff_ll["lat"]],
            "line": {
                "type": "LineString",
                "coordinates": line_coords,
            },
        },
        "routeInstructions": build_turn_by_turn(route),
        "stopPlan": stops,
        "eldLogSheets": logs,
        "dutyTotals": duty_totals,
    }
