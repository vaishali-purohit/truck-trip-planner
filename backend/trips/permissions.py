from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import BasePermission


class ApiKeyIfConfigured(BasePermission):
    """
    If API_KEY is configured in settings, require clients to send it via X-API-Key.
    If API_KEY is not configured, allow all requests (dev-friendly).
    """

    message = "Missing or invalid API key."

    def has_permission(self, request, view) -> bool:
        expected = getattr(settings, "API_KEY", None)
        if not expected:
            return True
        provided = (request.headers.get("X-API-Key") or "").strip()
        return bool(provided) and provided == str(expected)

