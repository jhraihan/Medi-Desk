# MediDesk

A hospital management system built with Django REST Framework and React. It handles the
everyday flow of a small hospital: booking appointments, running the live waiting queue,
writing prescriptions, dispensing medicine, keeping medical records, matching blood donors,
and billing patients.

Five roles use the same application and each one sees a different system. A patient can book
a visit and watch their place in the queue; a receptionist runs the front desk; a doctor
consults and prescribes; a pharmacist dispenses and tracks stock; an admin sees everything.
Access is enforced on the server, not just hidden in the interface.


<img width="1875" height="847" alt="Screenshot 2026-09-14 175313" src="https://github.com/user-attachments/assets/74b23d8e-be5b-4d99-8bb9-1d14f360cb25" />
<img width="1886" height="856" alt="Screenshot 2026-09-14 175326" src="https://github.com/user-attachments/assets/73867c53-42e1-47b5-b889-23fed23a99dc" />
<img width="1885" height="851" alt="Screenshot 2026-09-14 175338" src="https://github.com/user-attachments/assets/c9fd62ae-8d9f-438f-86d2-72376003a27e" />
<img width="1902" height="850" alt="Screenshot 2026-09-14 175353" src="https://github.com/user-attachments/assets/dd80d352-bc53-4781-a1be-afc4c42ba4ed" />


## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Screenshots](#screenshots)
- [Running it locally](#running-it-locally)
- [Demo accounts](#demo-accounts)
- [Project layout](#project-layout)
- [Tests](#tests)
- [API documentation](#api-documentation)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

**Appointments and the live queue.** Patients book a slot, reception checks them in, and the
queue page shows position and estimated waiting time, calculated from each doctor's rolling
average consultation length. Double-booking the same doctor and time is rejected by a
database constraint, not just a form check.

**Prescriptions and dispensing.** Doctors write a prescription and attach medicines with
dosage and duration. The pharmacist dispenses against it, which decrements stock in the same
transaction, so a prescription cannot be dispensed twice.

**Medical records.** Patients upload reports and share them with a specific doctor for a set
period. Every open is written to an access log. Uploads are validated by reading the file's
signature bytes rather than trusting its extension or content type.

**Blood donor network.** A request goes out for a blood group and the system matches only
compatible donors who are past the 90-day donation cooldown. A donor's phone number stays
hidden until they answer yes.

**Medicine reminders.** A prescription's duration expands into a dose schedule. Missed doses
are flagged, and a repeated streak of them notifies the patient's care contact.

**Billing.** Itemised bills with partial payments and a running outstanding balance.

**Auditing.** Security-relevant actions are written to an append-only log that raises on any
attempt to edit or delete an existing entry.

## Tech stack

**Backend** — Python 3.12, Django 6.1, Django REST Framework 3.18, SimpleJWT (access and
refresh tokens with rotation and blacklisting), django-filter, drf-spectacular for the OpenAPI
schema, SQLite by default.

**Frontend** — React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios with an interceptor
that refreshes expired tokens, lucide-react for icons.



## Running it locally

You need **Python 3.12+**, **Node.js 18+** and **git**. The commands below are written for
Windows PowerShell; the differences for macOS and Linux are noted inline.

### 1. Clone the repository

```bash
git clone https://github.com/jhraihan/hospital-management-system-django-react.git
cd hospital-management-system-django-react
```

### 2. Create and activate a virtual environment

```powershell
python -m venv venv
venv\Scripts\activate
```

On macOS or Linux:

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install the Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Create the backend `.env` file

The backend refuses to start without a `SECRET_KEY`, on purpose — there is no insecure
fallback. Copy the template:

```powershell
copy hms\.env.example hms\.env
```

On macOS or Linux:

```bash
cp hms/.env.example hms/.env
```

Then generate a key and paste it into `hms/.env` as the value of `SECRET_KEY`:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Your `hms/.env` should end up looking like this:

```env
SECRET_KEY=the-50-character-key-you-just-generated
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
TIME_ZONE=Asia/Dhaka
```

Set `DEBUG=True` for local development. Leave it `False` anywhere public.

### 5. Set up the database

```bash
cd hms
python manage.py migrate
```

### 6. Load the demo data

This creates departments, doctors, patients, appointments, prescriptions, stock, bills,
queue entries, donors and reminders, so the app is worth looking at immediately.

```bash
python manage.py seed_demo
```

### 7. Start the backend

```bash
python manage.py runserver
```

The API is now at `http://127.0.0.1:8000/api/v1/`. Leave this terminal running.

### 8. Start the frontend

Open a **second terminal**, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and sign in with one of the demo accounts below.

The frontend defaults to `http://127.0.0.1:8000/api/v1/`. To point it elsewhere, copy
`frontend/.env.example` to `frontend/.env` and set `VITE_API_URL`.

## Demo accounts

Every demo account uses the password **`Demo!2345`**. The login page has a button for each
one, so you do not have to type them.

| Role | Username | What they can do |
|---|---|---|
| Admin | `hospital_admin` | Everything |
| Doctor | `aisha` | Clinic, queue, prescribing |
| Receptionist | `reception` | Front desk, booking, check-in, billing |
| Pharmacist | `pharmacy` | Dispensing and stock |
| Patient | `rafi` | Own queue, records, reminders, bills |

These accounts exist only in seeded demo data. Re-running `seed_demo` resets them.

To create your own admin account instead:

```bash
python manage.py createsuperuser
```

## Project layout

```
hospital-management-system-django-react/
├── hms/                     Django project
│   ├── hms/                 settings, root urls, wsgi
│   ├── backend/             the application
│   │   ├── models.py        users, clinical, pharmacy, billing, audit
│   │   ├── views.py         viewsets, all queryset-scoped by role
│   │   ├── serializers.py   validation and field exposure
│   │   ├── permissions.py   role rules for reads and writes
│   │   ├── services.py      queue, donor matching, dispensing, doses
│   │   ├── tests.py         the test suite
│   │   └── management/commands/seed_demo.py
│   ├── .env.example         template for hms/.env
│   └── manage.py
├── frontend/                React application
│   ├── src/
│   │   ├── pages/           one file per screen
│   │   ├── components/      shared UI, layout, the mascot
│   │   ├── api.js           axios client and token refresh
│   │   └── permissions.js   mirrors the server's write rules
│   └── .env.example
├── docs/                    PRD and screenshots
├── requirements.txt
└── README.md
```

A note on `frontend/src/permissions.js`: it decides which buttons to render, so the interface
never offers an action the API would reject. It is a usability layer, not a security one —
the server checks every request regardless of what the frontend shows.

## Tests

From the `hms/` directory:

```bash
python manage.py test
```

The suite covers the role and ownership permission matrix, queue ordering, blood group
compatibility and the donation cooldown, dispensing and stock, dose scheduling, upload
validation, and the append-only audit log.

## API documentation

With the backend running:

- Swagger UI — `http://127.0.0.1:8000/api/docs/`
- OpenAPI schema — `http://127.0.0.1:8000/api/schema/`

Authenticate at `POST /api/v1/login/` with a username and password to get an access and
refresh token pair, then send `Authorization: Bearer <access token>` on subsequent requests.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/login/` | POST | Exchange username and password for a token pair |
| `/api/v1/token/refresh/` | POST | Get a new access token from a refresh token |
| `/api/v1/logout/` | POST | Blacklist the refresh token |
| `/api/v1/register/` | POST | Self-registration; always creates a patient account |
| `/api/v1/auth/me/` | GET | The signed-in user and their role |

Staff accounts are created through the Django admin or `createsuperuser`, never through
registration — the register endpoint ignores any role sent to it and forces `patient`.

## Environment variables

`hms/.env` — never committed; `hms/.env.example` is the template.

| Variable | Required | Purpose |
|---|---|---|
| `SECRET_KEY` | yes | Django signing key. No fallback; the app will not start without it. |
| `DEBUG` | no | Defaults to `False`. Use `True` only locally. |
| `ALLOWED_HOSTS` | yes | Comma-separated hostnames the backend will answer for. |
| `CORS_ALLOWED_ORIGINS` | yes | Comma-separated frontend origins allowed to call the API. |
| `TIME_ZONE` | no | Defaults to `Asia/Dhaka`. Affects appointment and dose times. |

`frontend/.env` — optional.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | no | API base URL. Defaults to `http://127.0.0.1:8000/api/v1/`. |

Keep real secrets out of git. `.gitignore` already excludes `.env`, databases and key files,
but generate a fresh `SECRET_KEY` per environment and never reuse a development one in
production.

## Troubleshooting

**`django.core.exceptions.ImproperlyConfigured: Set the SECRET_KEY environment variable`**
`hms/.env` is missing or has no `SECRET_KEY`. Follow step 4.

**The frontend loads but every list is empty, and the browser console shows CORS errors.**
Vite is running on a port that is not in `CORS_ALLOWED_ORIGINS`. Add that origin to
`hms/.env` and restart the backend — changes to `.env` are only read at startup.

**`Port 5173 is in use`.** Vite will offer the next free port. Add that origin to
`CORS_ALLOWED_ORIGINS` too, or stop whatever holds 5173.

**Appointment or dose times are off by several hours.** Set `TIME_ZONE` in `hms/.env` to your
own zone and restart the backend.

**New API routes return 404 after pulling changes.** Restart `runserver`; the reloader does
not always pick up new URL patterns.

## License

No license is granted. All rights reserved by the author.

This repository is published for review as a portfolio project. You are welcome to read the
code, clone it and run it locally to evaluate it. You may not use it in a product, publish it,
or distribute modified copies without permission. If you would like to use any part of it,
please get in touch.

This is a demonstration project. It has not been assessed for HIPAA, GDPR or any other health
data regulation, and all data in it is synthetic. Do not put real patient information into it.
