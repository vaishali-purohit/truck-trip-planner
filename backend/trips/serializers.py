from rest_framework import serializers

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
    lat = serializers.CharField()
    lon = serializers.CharField()

class TripPlanListItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    tripNo = serializers.IntegerField(required=False, allow_null=True)
    createdAt = serializers.DateTimeField()
    result = serializers.DictField()
