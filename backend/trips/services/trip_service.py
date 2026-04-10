from django.db import transaction, IntegrityError
from django.conf import settings

from trips.models import TripPlan
from trips.planner import build_trip_plan

class TripService:

    MAX_RETRIES = 5

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
                with transaction.atomic():
                    trip_no = cls._generate_trip_no()

                    plan = build_trip_plan(
                        current_location=data["currentLocation"],
                        pickup_location=data["pickupLocation"],
                        dropoff_location=data["dropoffLocation"],
                        cycle_hours_used=cycle_hours,
                    )

                    return TripPlan.objects.create(
                        trip_no=trip_no,
                        current_location=data["currentLocation"],
                        pickup_location=data["pickupLocation"],
                        dropoff_location=data["dropoffLocation"],
                        cycle_hours_used=cycle_hours,
                        result=plan,
                    )

            except IntegrityError:
                if attempt == cls.MAX_RETRIES - 1:
                    raise RuntimeError("Trip number generation failed after retries")

                continue
