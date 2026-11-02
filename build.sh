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
