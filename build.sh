#!/usr/bin/env bash
# Render build step for the Django API. Runs on every deploy, before the start command.
set -o errexit

pip install --no-cache-dir -r requirements.txt

cd hms

# Collected into hms/staticfiles and served by WhiteNoise at runtime.
python manage.py collectstatic --no-input

python manage.py migrate

# Lockout counters and throttle buckets when CACHE_URL=dbcache://hms_cache. Does
# nothing for other cache backends, and skips the table if it already exists.
python manage.py createcachetable

# Free Render instances have no shell, so the one-off setup steps run here instead.
# Both are safe to repeat on every deploy.

# The first admin, from DJANGO_SUPERUSER_USERNAME / _EMAIL / _PASSWORD. Once the
# account exists this reports "That username is already taken" and moves on.
if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
    python manage.py createsuperuser --no-input || echo "Superuser already exists; leaving it as it is."
fi

# Demo accounts, catalogue and sample visits. Only with DEMO_MODE=True, and it only
# adds what is missing, so real records are never touched.
if [ "${DEMO_MODE:-}" = "True" ]; then
    python manage.py seed_demo
fi
