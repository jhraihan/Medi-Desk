from django.conf import settings
from django.contrib import admin
from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


@csrf_exempt
def healthz(request):
    """Liveness probe for the platform load balancer.

    Deliberately does not touch the database: this answers "is the process up",
    and a health check that fails on a slow query would take the service down
    over something a retry would have survived.
    """
    return JsonResponse({'status': 'ok'})


@csrf_exempt
def readyz(request):
    """Readiness: can this instance reach the database? For monitors and uptime checks,
    not for the platform's liveness probe (see healthz)."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except DatabaseError:
        return JsonResponse({'status': 'unavailable', 'database': 'down'}, status=503)
    return JsonResponse({'status': 'ok', 'database': 'up'})


urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('readyz/', readyz, name='readyz'),

    path(settings.ADMIN_URL, admin.site.urls),

    path('api/v1/', include('backend.urls')),

    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
