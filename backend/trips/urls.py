"""
Trip + location API routes (all under ``/api/`` from config.urls).

- ``POST /api/trip/plan/`` - create a plan (geocode + route + persist).
- ``GET /api/trip/`` - list saved trips (optional ``?limit=``).
- ``GET /api/trip/<trip_no>/`` - one trip by numeric ``trip_no``.
- ``GET /api/locations/search/?q=...`` - geocoder suggestions for the UI.
"""

from django.urls import path

from .views import (
    TripPlanView,
    TripListView,
    TripDetailView,
    LocationSearchView,
)

urlpatterns = [
    path("trip/plan/", TripPlanView.as_view(), name="trip-plan"),
    path("trip/", TripListView.as_view(), name="trip-list"),
    path("trip/<int:trip_no>/", TripDetailView.as_view(), name="trip-detail"),
    path("locations/search/", LocationSearchView.as_view(), name="locations-search"),
]
