from django.db import connection
from django.http import JsonResponse


def healthz(request):
    """Liveness probe that does not require the database."""
    return JsonResponse({"status": "ok"})


def readyz(request):
    """Readiness probe for the load balancer and deployment platform."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return JsonResponse({"status": "not_ready", "database": "unavailable"}, status=503)
    return JsonResponse({"status": "ready", "database": "ok"})
