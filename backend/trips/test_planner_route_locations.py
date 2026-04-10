from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase

from trips.planner import (
    enrich_eld_log_segment_locations_from_route,
    interp_route_point_by_fraction,
)


class TestPlannerRouteLocations(SimpleTestCase):
    def test_interp_route_point_endpoints(self):
        coords = [[-87.0, 41.0], [-88.0, 42.0], [-90.0, 43.0]]
        a = interp_route_point_by_fraction(coords, 0.0)
        b = interp_route_point_by_fraction(coords, 1.0)
        self.assertAlmostEqual(a[0], -87.0, places=5)
        self.assertAlmostEqual(a[1], 41.0, places=5)
        self.assertAlmostEqual(b[0], -90.0, places=5)
        self.assertAlmostEqual(b[1], 43.0, places=5)

    def test_enrich_sets_location_from_reverse_geocode(self):
        logs = [
            {
                "totalMilesDrivingToday": 50.0,
                "segments": [
                    {
                        "status": "On Duty",
                        "fromHour": 8.0,
                        "toHour": 9.0,
                        "label": "Pre-trip inspection",
                    },
                    {
                        "status": "Driving",
                        "fromHour": 9.0,
                        "toHour": 14.0,
                        "label": "Driving",
                    },
                ],
            }
        ]
        line = [[-87.0, 41.0], [-90.0, 40.0]]

        call_points: list[tuple[float, float]] = []

        def fake_reverse(lng: float, lat: float) -> str:
            call_points.append((lng, lat))
            return f"Place-{len(call_points)}"

        with patch("trips.planner.reverse_geocode_lng_lat", side_effect=fake_reverse):
            enrich_eld_log_segment_locations_from_route(
                logs,
                line,
                pickup_line="Chicago, IL",
                dropoff_line="Denver, CO",
                distance_mi=100.0,
            )

        segs = logs[0]["segments"]
        self.assertEqual(segs[0]["location"], "Chicago, IL")
        self.assertTrue(segs[1].get("location"))
        self.assertIn("Place-", segs[1]["location"])
