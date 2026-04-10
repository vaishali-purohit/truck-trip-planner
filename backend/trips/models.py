import uuid
from django.db import models

class TripPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip_no = models.BigIntegerField(unique=True, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    current_location = models.CharField(max_length=512)
    pickup_location = models.CharField(max_length=512)
    dropoff_location = models.CharField(max_length=512)
    cycle_hours_used = models.FloatField(default=0)

    result = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]
