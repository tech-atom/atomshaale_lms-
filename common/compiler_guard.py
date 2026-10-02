"""Admission control for the in-process compiler fallback.

The production compiler should run in isolated worker containers. This guard
keeps the Django process from being overwhelmed while that worker service is
being deployed and provides a clear overload response to clients.
"""

import threading
from functools import wraps

from django.conf import settings
from django.http import JsonResponse


_capacity = threading.BoundedSemaphore(settings.COMPILER_MAX_CONCURRENT)


def compiler_capacity(view):
    """Reject compiler work when this web process has reached its ceiling."""
    @wraps(view)
    def guarded_view(request, *args, **kwargs):
        if not _capacity.acquire(blocking=False):
            return JsonResponse(
                {
                    "success": False,
                    "error": "Compiler capacity is currently full. Please retry shortly.",
                    "retryable": True,
                },
                status=429,
                headers={"Retry-After": str(settings.COMPILER_RETRY_AFTER)},
            )
        try:
            return view(request, *args, **kwargs)
        finally:
            _capacity.release()

    return guarded_view
