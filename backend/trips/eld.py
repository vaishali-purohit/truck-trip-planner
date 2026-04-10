from datetime import datetime, timedelta

MAX_DRIVING_HOURS_PER_DAY = 11
ON_DUTY_NON_DRIVING_HOURS = 2
OFF_DUTY_HOURS = 10

def _status_label(event_type: str) -> str:
    t = (event_type or "").strip().upper()
    if t == "OFF":
        return "Off Duty"
    if t == "SB":
        return "Sleeper"
    if t == "DRIVING":
        return "Driving"
    if t == "ON":
        return "On Duty"
    return "On Duty"


def _build_segments_from_events(events: list[dict]) -> list[dict]:
    """
    Convert legacy `events` (duration-based) into UI-friendly `segments`
    with explicit clock-hour ranges.

    The UI expects:
      - status: "Off Duty" | "Sleeper" | "Driving" | "On Duty"
      - fromHour/toHour: numbers in [0, 24]
      - optional label/location
    """
    segments: list[dict] = []
    hour = 0.0

    for ev in events or []:
        try:
            dur = float(ev.get("hours", 0) or 0)
        except (TypeError, ValueError):
            dur = 0.0
        if dur <= 0:
            continue

        from_h = hour
        to_h = min(24.0, hour + dur)
        if to_h <= from_h:
            continue

        label = ev.get("remark")
        segments.append(
            {
                "status": _status_label(str(ev.get("type", ""))),
                "fromHour": round(from_h, 2),
                "toHour": round(to_h, 2),
                "label": str(label) if isinstance(label, str) and label.strip() else None,
            }
        )
        hour = to_h
        if hour >= 24.0:
            break

    # If the day doesn't fill 24 hours, extend the last known status (or Off Duty)
    if hour < 24.0:
        status = segments[-1]["status"] if segments else "Off Duty"
        segments.append({"status": status, "fromHour": round(hour, 2), "toHour": 24.0, "label": None})

    # Drop null labels for a cleaner payload
    return [
        {k: v for k, v in s.items() if v is not None}
        for s in segments
        if s.get("toHour", 0) > s.get("fromHour", 0)
    ]


def build_multi_day_logs(
    start_date,
    driving_hours,
    distance_mi,
    pickup_line,
    dropoff_line,
):
    """
    Splits trip into multiple ELD days based on 11-hour driving rule
    """

    logs = []
    remaining_drive = float(driving_hours)
    current_date = start_date

    day_index = 0

    while remaining_drive > 0:
        drive_today = min(MAX_DRIVING_HOURS_PER_DAY, remaining_drive)
        miles_today = (
            (float(distance_mi) * (float(drive_today) / float(driving_hours)))
            if float(driving_hours) > 0
            else float(distance_mi)
        )

        events = [
            {"type": "OFF", "hours": OFF_DUTY_HOURS, "remark": "Off Duty / Rest"},
            {"type": "ON", "hours": ON_DUTY_NON_DRIVING_HOURS, "remark": "Pre/Post Trip Inspection"},
            {
                "type": "DRIVING",
                "hours": round(drive_today, 2),
                "remark": (f"{pickup_line} → {dropoff_line}" if day_index == 0 else "En route"),
            },
        ]

        log = {
            # Frontend expects dateISO; keep legacy `date` for backwards compatibility.
            "dateISO": str(current_date),
            "date": str(current_date),
            # Frontend expects 1-based day index for labels.
            "dayIndex": day_index + 1,
            "totalMilesDrivingToday": round(miles_today, 1),
            "dutyTotals": {
                "offDutyHours": OFF_DUTY_HOURS,
                "sleeperBerthHours": 0,
                "drivingHours": round(drive_today, 2),
                "onDutyHours": ON_DUTY_NON_DRIVING_HOURS,
            },
            # New UI-friendly segments + keep legacy events.
            "segments": _build_segments_from_events(events),
            "events": events,
        }

        logs.append(log)

        remaining_drive -= drive_today
        current_date += timedelta(days=1)
        day_index += 1

    return logs


def enrich_eld_log_segment_locations_from_route(
    logs,
    coords,
    pickup_line,
    dropoff_line,
    distance_mi,
):
    """
    Enrich logs with approximate route locations (lightweight version)
    """

    if not coords or not logs:
        return logs

    total_points = len(coords)

    for i, log in enumerate(logs):
        # map day to coordinate index
        idx = int((i / max(1, len(logs))) * (total_points - 1))

        coord = coords[idx]

        log["location"] = {
            "lat": coord[1],
            "lng": coord[0],
        }

    # mark first and last explicitly
    logs[0]["locationLabel"] = pickup_line or "Start"
    logs[-1]["locationLabel"] = dropoff_line or "End"

    return logs
