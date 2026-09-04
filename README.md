<img width="1912" height="844" alt="Screenshot 2026-08-15 223609" src="https://github.com/user-attachments/assets/e5566527-b976-4a11-9eb5-ac12b6dabcf6" />

A full-stack web application designed to streamline hospital operations. This system provides a comprehensive dashboard for managing patients, doctors, appointments, prescriptions, and billing, featuring secure role-based access control.

🚀 Features
Role-Based Authentication: Secure login and registration utilizing JWT (JSON Web Tokens). Access to specific modules is restricted based on user roles (Admin, Doctor, Patient, Receptionist).

Appointment Management: Book, approve, complete, or cancel appointments. Includes advanced filtering by doctor, patient, and date.

Prescription System: Doctors can issue digital prescriptions and dynamically link multiple medicines with specific dosages and durations.

Doctor & Patient Portals: Comprehensive CRUD (Create, Read, Update, Delete) operations for patient records and doctor profiles, including a real-time availability toggle for doctors.

Billing & Invoicing: Generate patient bills, track total amounts, and toggle payment statuses (Paid/Unpaid).

Medicine Inventory: A searchable catalog of hospital medicines and pharmacy registry.

🛠️ Tech Stack
Backend:

Python / Django

Django REST Framework (DRF)

SimpleJWT (Token Authentication)

SQLite / PostgreSQL

Django-Filter (Query parameter filtering)

Frontend:

React.js (Vite)

Tailwind CSS (Styling & UI)

React Router DOM (Protected routing)

Axios (API client with interceptors)

Lucide React (Icons)

## Running it

Everything is configured through environment variables. Copy the example and fill it in:

```bash
cp hms/.env.example hms/.env
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Put that key in `hms/.env`, then:

```bash
pip install -r requirements.txt
cd hms
python manage.py migrate
python manage.py seed_demo      # realistic demo data for every role
python manage.py runserver
```

```bash
cd frontend
npm install
npm run dev
```

With Docker instead (Postgres, Redis, API and the built frontend):

```bash
docker compose up --build
```

### Demo logins

`seed_demo` creates one account per role, all with the password `Demo!2345`:

| Role | Username |
|---|---|
| Admin | `hospital_admin` |
| Doctor | `aisha` |
| Receptionist | `reception` |
| Pharmacist | `pharmacy` |
| Patient | `rafi` |

### API docs

Swagger UI at `/api/docs/`, ReDoc at `/api/redoc/`. All endpoints live under `/api/v1/`.

### Tests and linting

```bash
cd hms && python manage.py test backend
ruff check hms/
cd frontend && npm run lint && npm run build
```

## Notes on access control

Roles decide which endpoints you can reach; querysets decide which rows you see. A patient
only ever sees their own records, and a doctor only sees patients they have an appointment
with. Anything outside your scope returns 404 rather than 403, so the API never confirms
that a record exists. Staff accounts are created in the Django admin — self-registration
always produces a patient.
