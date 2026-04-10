from datetime import datetime, timedelta

MAX_DRIVING_HOURS_PER_DAY = 11
ON_DUTY_NON_DRIVING_HOURS = 2
OFF_DUTY_HOURS = 10

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

        log = {
            "date": str(current_date),
            "dayIndex": day_index,
            "dutyTotals": {
                "offDutyHours": OFF_DUTY_HOURS,
                "sleeperBerthHours": 0,
                "drivingHours": round(drive_today, 2),
                "onDutyHours": ON_DUTY_NON_DRIVING_HOURS,
            },
            "events": [
                {
                    "type": "OFF",
                    "hours": OFF_DUTY_HOURS,
                    "remark": "Off Duty / Rest",
                },
                {
                    "type": "ON",
                    "hours": ON_DUTY_NON_DRIVING_HOURS,
                    "remark": "Pre/Post Trip Inspection",
                },
                {
                    "type": "DRIVING",
                    "hours": round(drive_today, 2),
                    "remark": (
                        f"{pickup_line} → {dropoff_line}"
                        if day_index == 0
                        else "En route"
                    ),
                },
            ],
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
