from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase

from trips.models import TripPlan
from trips.services.trip_service import TripService


class TestTripService(TestCase):
    def test_generate_trip_no_starts_at_default(self):
        self.assertEqual(TripPlan.objects.count(), 0)
        self.assertEqual(TripService._generate_trip_no(), TripService._get_starting_trip_no())

    def test_generate_trip_no_increments(self):
        TripPlan.objects.create(
            trip_no=2000,
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            cycle_hours_used=0,
            result={},
        )
        self.assertEqual(TripService._generate_trip_no(), 2001)

    def test_create_trip_persists_result(self):
        with patch("trips.services.trip_service.build_trip_plan", return_value={"ok": True}):
            t = TripService.create_trip(
                {
                    "currentLocation": "A",
                    "pickupLocation": "B",
                    "dropoffLocation": "C",
                    "cycleHoursUsed": 1,
                }
            )
        self.assertIsNotNone(t.trip_no)
        # Service enriches persisted result with request inputs + defaults
        self.assertEqual(t.result.get("ok"), True)
        self.assertEqual(
            t.result.get("inputs"),
            {
                "currentLocation": "A",
                "pickupLocation": "B",
                "dropoffLocation": "C",
                "cycleHoursUsed": 1.0,
            },
        )
