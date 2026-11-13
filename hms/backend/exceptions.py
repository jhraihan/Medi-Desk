import math

from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler


class LoginBlocked(Throttled):
    reason = 'Too many failed sign-in attempts from your network.'


def api_exception_handler(exc, context):
    """DRF's default with one change: rate-limit replies people can read.

    The stock message, "Request was throttled. Expected available in 3152 seconds.",
    reaches users verbatim through the frontend's error banners.
    """
    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, Throttled):
        minutes = max(1, math.ceil((exc.wait or 60) / 60))
        reason = getattr(exc, 'reason', 'Too many requests.')
        response.data = {'detail': f'{reason} Try again in {minutes} minute{"" if minutes == 1 else "s"}.'}
    return response
