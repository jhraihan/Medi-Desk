"""
Login lockout shared by the API and the Django admin.

Both sign-in paths go through django.contrib.auth.authenticate(), so an auth backend
is the one place that sees every password attempt. Failures are counted per username
in the cache rather than per IP, so guessing one account's password from many
addresses still trips the lock.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.core.cache import cache
from django.core.exceptions import PermissionDenied

LOCKOUT_MESSAGE = 'Too many failed sign-in attempts. Try again in {minutes} minutes.'


def _key(username):
    return f'login-failures:{str(username or "").strip().lower()}'


def _address_key(address):
    return f'login-address-failures:{address}'


def address_is_blocked(address):
    """Too many wrong passwords from one address, across any number of usernames.

    Only failures count. Staff in one hospital usually share a public address, so
    counting every sign-in would lock the whole building out at shift change.
    """
    return cache.get(_address_key(address), 0) >= settings.LOGIN_ADDRESS_FAILURES


def record_address_failure(address):
    key = _address_key(address)
    cache.set(key, cache.get(key, 0) + 1, settings.LOGIN_LOCKOUT_SECONDS)


def failure_count(username):
    return cache.get(_key(username), 0)


def is_locked_out(username):
    return failure_count(username) >= settings.LOGIN_LOCKOUT_ATTEMPTS


def lockout_message():
    return LOCKOUT_MESSAGE.format(minutes=max(1, settings.LOGIN_LOCKOUT_SECONDS // 60))


def record_failure(username):
    # get-then-set rather than incr(): the database cache's incr() rewrites the row with
    # the default timeout, which would quietly shorten the lockout window.
    cache.set(_key(username), failure_count(username) + 1, settings.LOGIN_LOCKOUT_SECONDS)


def clear_failures(username):
    cache.delete(_key(username))


class LockoutModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(get_user_model().USERNAME_FIELD)
        if username is None:
            return None

        if is_locked_out(username):
            # PermissionDenied stops authenticate() from trying any later backend.
            raise PermissionDenied(lockout_message())

        user = super().authenticate(request, username=username, password=password, **kwargs)
        if user is None:
            record_failure(username)
        else:
            clear_failures(username)
        return user
