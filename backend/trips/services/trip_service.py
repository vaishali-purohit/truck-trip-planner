from django.db import transaction, IntegrityError
from django.conf import settings

from trips.models import TripPlan
from trips.planner import build_trip_plan

class TripService:

    MAX_RETRIES = 5

    @staticmethod
    def _default_str(setting_name: str) -> str:
        v = getattr(settings, setting_name, "")
        return str(v).strip() if v is not None else ""

    @staticmethod
    def _auto_truck_id(trip_no: int | None) -> str:
        return f"TRK-{trip_no}" if trip_no is not None else ""

    @staticmethod
    def _auto_trailer_id(trip_no: int | None) -> str:
        return f"TRL-{trip_no}" if trip_no is not None else ""

    @staticmethod
    def _auto_driver_name(trip_no: int | None) -> str:
        if trip_no is None:
            return "Driver"
        return f"Driver {trip_no}"

    @staticmethod
    def _auto_carrier_name() -> str:
        return "Carrier"

    @staticmethod
    def _auto_main_office_address() -> str:
        return "Main Office"

    @staticmethod
    def _get_starting_trip_no():
        return getattr(settings, "TRIP_START_NUMBER", 1900)

    @staticmethod
    def _generate_trip_no():
        """
        Generates next trip number safely
        NOTE: still relies on DB uniqueness constraint
        """
        last = TripPlan.objects.order_by("-trip_no").first()
        if last and last.trip_no:
            return last.trip_no + 1
        return TripService._get_starting_trip_no()

    @classmethod
    def create_trip(cls, data):
        """
        Creates trip with retry on race condition
        """

        try:
            cycle_hours = float(data["cycleHoursUsed"])
        except (ValueError, TypeError):
            raise ValueError("Invalid cycleHoursUsed")

        for attempt in range(cls.MAX_RETRIES):
            try:
                plan = build_trip_plan(
                    current_location=data["currentLocation"],
                    pickup_location=data["pickupLocation"],
                    dropoff_location=data["dropoffLocation"],
                    cycle_hours_used=cycle_hours,
                )

                with transaction.atomic():
                    trip_no = cls._generate_trip_no()

                    if isinstance(plan, dict):
                        plan.setdefault(
                            "inputs",
                            {
                                "currentLocation": data["currentLocation"],
                                "pickupLocation": data["pickupLocation"],
                                "dropoffLocation": data["dropoffLocation"],
                                "cycleHoursUsed": cycle_hours,
                            },
                        )

                        def _blank(v: object) -> bool:
                            return v is None or (isinstance(v, str) and not v.strip())

                        if _blank(plan.get("carrierName")):
                            plan["carrierName"] = (
                                cls._default_str("DEFAULT_CARRIER_NAME") or cls._auto_carrier_name()
                            )
                        if _blank(plan.get("mainOfficeAddress")):
                            plan["mainOfficeAddress"] = (
                                cls._default_str("DEFAULT_MAIN_OFFICE_ADDRESS") or cls._auto_main_office_address()
                            )
                        if _blank(plan.get("driverName")):
                            plan["driverName"] = (
                                cls._default_str("DEFAULT_DRIVER_NAME") or cls._auto_driver_name(trip_no)
                            )
                        if _blank(plan.get("truckId")):
                            plan["truckId"] = (
                                cls._default_str("DEFAULT_TRUCK_ID") or cls._auto_truck_id(trip_no)
                            )
                        if _blank(plan.get("trailerId")):
                            plan["trailerId"] = (
                                cls._default_str("DEFAULT_TRAILER_ID") or cls._auto_trailer_id(trip_no)
                            )

                        if _blank(plan.get("driverLogs")):
                            sheets = plan.get("eldLogSheets")
                            has_segments = False
                            if isinstance(sheets, list):
                                for sh in sheets:
                                    if isinstance(sh, dict) and isinstance(sh.get("segments"), list) and sh.get("segments"):
                                        has_segments = True
                                        break
                            plan["driverLogs"] = "completed" if has_segments else "pending"

                    obj = TripPlan.objects.create(
                        trip_no=trip_no,
                        current_location=data["currentLocation"],
                        pickup_location=data["pickupLocation"],
                        dropoff_location=data["dropoffLocation"],
                        cycle_hours_used=cycle_hours,
                        result=plan,
                    )
                    return obj

            except IntegrityError:
                if attempt == cls.MAX_RETRIES - 1:
                    raise RuntimeError("Trip number generation failed after retries")

                continue
