from django.urls import path

from .views import LocationSearchView, TripDetailView, TripListView, TripPlanView


urlpatterns = [
    path("trip/plan/", TripPlanView.as_view(), name="trip-plan"),
    path("trip/", TripListView.as_view(), name="trip-list"),
    path("trip/<int:trip_no>/", TripDetailView.as_view(), name="trip-detail"),
    path("locations/search/", LocationSearchView.as_view(), name="locations-search"),
]

