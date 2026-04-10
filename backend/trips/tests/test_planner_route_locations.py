from __future__ import annotations

from django.test import SimpleTestCase

from trips.eld import enrich_eld_log_segment_locations_from_route


class TestEldRouteLocations(SimpleTestCase):
    def test_enrich_sets_locations_and_labels(self):
        logs = [
            {"date": "2026-01-01", "dayIndex": 0, "dutyTotals": {}, "events": []},
            {"date": "2026-01-02", "dayIndex": 1, "dutyTotals": {}, "events": []},
        ]
        line = [[-87.0, 41.0], [-90.0, 40.0]]

        enrich_eld_log_segment_locations_from_route(
            logs,
            line,
            pickup_line="Chicago, IL",
            dropoff_line="Denver, CO",
            distance_mi=100.0,
        )

        self.assertIn("location", logs[0])
        self.assertIn("location", logs[1])
        self.assertEqual(logs[0]["locationLabel"], "Chicago, IL")
        self.assertEqual(logs[-1]["locationLabel"], "Denver, CO")
