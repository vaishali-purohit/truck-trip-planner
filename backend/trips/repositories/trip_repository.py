from trips.models import TripPlan

class TripRepository:

    @staticmethod
    def list(limit=20):
        # Keep default payload small (Swagger UI can struggle with huge JSON)
        try:
            limit_i = int(limit)
        except (TypeError, ValueError):
            limit_i = 20

        limit_i = max(0, min(200, limit_i))
        return TripPlan.objects.all().order_by("-created_at")[:limit_i]

    @staticmethod
    def get_by_trip_no(trip_no):
        return TripPlan.objects.filter(trip_no=trip_no).first()
