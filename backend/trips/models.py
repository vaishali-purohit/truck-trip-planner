import uuid

from django.db import models
from django.db import IntegrityError
from django.db import transaction


class TripPlan(models.Model):
    """
    Persisted trip plan used by the dashboard:
    - Input: current/pickup/dropoff + cycle hours used
    - Output: planned route geometry + stops/rest + multi-day logs (stored as JSON)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip_no = models.BigIntegerField(unique=True, null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    current_location = models.CharField(max_length=512)
    pickup_location = models.CharField(max_length=512)
    dropoff_location = models.CharField(max_length=512)
    cycle_hours_used = models.FloatField(default=0)

    result = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if self.trip_no is None:
            # SQLite ignores select_for_update(), so concurrent creates can race.
            # We retry on unique constraint errors to make trip_no generation robust.
            for _ in range(5):
                try:
                    with transaction.atomic():
                        last = TripPlan.objects.select_for_update().order_by("-trip_no").first()
                        self.trip_no = (last.trip_no + 1) if (last and last.trip_no) else 1900
                        super().save(*args, **kwargs)
                    return
                except IntegrityError:
                    self.trip_no = None
            raise
        super().save(*args, **kwargs)
