import math

from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler


class LoginBlocked(Throttled):
    reason = 'Too many failed sign-in attempts from your network.'


def api_exception_handler(exc, context):
    """DRF's default with two changes: rate-limit replies people can read, and a
    blocked delete answered with 409 instead of a server error.

    The stock message, "Request was throttled. Expected available in 3152 seconds.",
    reaches users verbatim through the frontend's error banners.
    """
    if isinstance(exc, (ProtectedError, RestrictedError)):
        # A delete blocked by on_delete=PROTECT would otherwise surface as a 500.
        return Response(
            {'detail': 'Other records still depend on this one, so it cannot be deleted. '
                       'Deactivate or retire it instead.'},
            status=status.HTTP_409_CONFLICT)

    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, Throttled):
        minutes = max(1, math.ceil((exc.wait or 60) / 60))
        reason = getattr(exc, 'reason', 'Too many requests.')
        response.data = {'detail': f'{reason} Try again in {minutes} minute{"" if minutes == 1 else "s"}.'}
    return response
