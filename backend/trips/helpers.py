def parse_city_state(text: str):
    parts = [p.strip() for p in text.split(",")]
    return {
        "city": parts[0] if parts else "",
        "state": parts[1] if len(parts) > 1 else "",
    }


def build_turn_by_turn(route: dict):
    steps = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            steps.append({
                "instruction": step.get("maneuver", {}).get("instruction", ""),
                "distance": step.get("distance", 0),
            })
    return steps


def plan_stops(distance_mi: float, driving_hours: float):
    fuel_stops = int(distance_mi // 500)
    return {
        "stopCount": fuel_stops,
        "fuelStops": fuel_stops,
        "breakMinutes": int(driving_hours // 8) * 30,
    }
