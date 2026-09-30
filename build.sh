#!/usr/bin/env bash
# Render build step for the Django API. Runs on every deploy, before the start command.
set -o errexit

pip install --no-cache-dir -r requirements.txt

cd hms

# Collected into hms/staticfiles and served by WhiteNoise at runtime.
python manage.py collectstatic --no-input

python manage.py migrate
