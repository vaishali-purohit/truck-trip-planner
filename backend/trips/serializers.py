from rest_framework import serializers

from .models import TripPlan


class TripPlanCreateSerializer(serializers.Serializer):
    currentLocation = serializers.CharField(max_length=512)
    pickupLocation = serializers.CharField(max_length=512)
    dropoffLocation = serializers.CharField(max_length=512)
    cycleHoursUsed = serializers.FloatField(min_value=0, max_value=70)


class ApiErrorSerializer(serializers.Serializer):
    error = serializers.CharField()
    message = serializers.CharField()
    detail = serializers.CharField(required=False, allow_blank=True)


class LocationSuggestionSerializer(serializers.Serializer):
    label = serializers.CharField()
    lat = serializers.CharField(required=False, allow_blank=True)
    lon = serializers.CharField(required=False, allow_blank=True)


class TripPlanSummarySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()

    class Meta:
        model = TripPlan
        fields = ["id", "created_at", "result"]


class TripPlanListItemSerializer(serializers.Serializer):
    """
    Wrapper response used by GET /api/trip/ and related endpoints.
    """

    id = serializers.UUIDField()
    tripNo = serializers.IntegerField()
    createdAt = serializers.DateTimeField()
    result = serializers.JSONField()


class TripPlanDetailsSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()

    class Meta:
        model = TripPlan
        fields = ["id", "created_at", "result"]

