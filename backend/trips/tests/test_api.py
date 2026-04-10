from __future__ import annotations

from unittest.mock import patch

import requests
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from trips.models import TripPlan
from trips.services.location_service import LocationService


class TestTripApi(APITestCase):
    def test_trip_plan_creates_trip_and_returns_payload(self):
        fake_plan = {"dateISO": "2026-01-01", "pickup": {"city": "Chicago", "state": "IL"}}

        with patch("trips.services.trip_service.build_trip_plan", return_value=fake_plan):
            res = self.client.post(
                reverse("trip-plan"),
                {
                    "currentLocation": "Chicago, IL",
                    "pickupLocation": "Chicago, IL",
                    "dropoffLocation": "Denver, CO",
                    "cycleHoursUsed": 5,
                },
                format="json",
            )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", res.data)
        self.assertIn("tripNo", res.data)
        self.assertIn("createdAt", res.data)
        self.assertIn("result", res.data)
        self.assertEqual(res.data["result"]["pickup"]["city"], "Chicago")

        self.assertEqual(TripPlan.objects.count(), 1)
        t = TripPlan.objects.first()
        assert t is not None
        self.assertIsNotNone(t.trip_no)

    def test_trip_plan_validates_cycle_hours_used(self):
        with patch("trips.services.trip_service.build_trip_plan") as mocked:
            res = self.client.post(
                reverse("trip-plan"),
                {
                    "currentLocation": "Chicago, IL",
                    "pickupLocation": "Chicago, IL",
                    "dropoffLocation": "Denver, CO",
                    "cycleHoursUsed": 999,
                },
                format="json",
            )
        mocked.assert_not_called()
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_trip_plan_value_error_returns_400(self):
        with patch(
            "trips.services.trip_service.build_trip_plan",
            side_effect=ValueError("bad input"),
        ):
            res = self.client.post(
                reverse("trip-plan"),
                {
                    "currentLocation": "X",
                    "pickupLocation": "Y",
                    "dropoffLocation": "Z",
                    "cycleHoursUsed": 0,
                },
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get("error"), "invalid_input_or_no_result")

    def test_trip_plan_upstream_error_returns_502(self):
        with patch(
            "trips.services.trip_service.build_trip_plan",
            side_effect=requests.RequestException("down"),
        ):
            res = self.client.post(
                reverse("trip-plan"),
                {
                    "currentLocation": "Chicago, IL",
                    "pickupLocation": "Chicago, IL",
                    "dropoffLocation": "Denver, CO",
                    "cycleHoursUsed": 0,
                },
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(res.data.get("error"), "upstream_unavailable")

    def test_trip_list_and_detail(self):
        t1 = TripPlan.objects.create(
            trip_no=1900,
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            cycle_hours_used=1,
            result={"id": 1},
        )
        t2 = TripPlan.objects.create(
            trip_no=1901,
            current_location="A2",
            pickup_location="B2",
            dropoff_location="C2",
            cycle_hours_used=2,
            result={"id": 2},
        )

        res = self.client.get(reverse("trip-list"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data), 2)

        res2 = self.client.get(reverse("trip-detail", kwargs={"trip_no": t1.trip_no}))
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(str(res2.data["id"]), str(t1.id))
        self.assertEqual(res2.data["tripNo"], t1.trip_no)

        res3 = self.client.get(reverse("trip-detail", kwargs={"trip_no": t2.trip_no}))
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(str(res3.data["id"]), str(t2.id))
        self.assertEqual(res3.data["tripNo"], t2.trip_no)

    def test_trip_detail_unknown_trip_no_returns_404(self):
        res = self.client.get(reverse("trip-detail", kwargs={"trip_no": 999999999}))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res.data.get("error"), "not_found")

    def test_locations_search_empty_query_returns_empty_list(self):
        res = self.client.get(reverse("locations-search"), {"q": ""})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_locations_search_upstream_failure_returns_502(self):
        LocationService._geocode_request_cached.cache_clear()
        # LocationService uses requests.Session().get(), not requests.get()
        with patch("trips.services.location_service.requests.Session") as mock_session_cls:
            mock_session_cls.return_value.get.side_effect = requests.RequestException("down")
            res = self.client.get(reverse("locations-search"), {"q": "denver"})
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(res.data.get("error"), "upstream_unavailable")
