# CLAUDE.md

MediDesk: a hospital management system. Django REST API in `hms/`, React SPA in `frontend/`,
PostgreSQL everywhere (local, CI, production). Repo: `jhraihan/Medi-Desk` on GitHub.

## Working rules (from the owner)

- Commit and push only when the user says "push". Branch off `main` first, never push to
  `main` directly. The user opens and merges the PR on GitHub (the `gh` CLI is not installed;
  give them the `https://github.com/jhraihan/Medi-Desk/pull/new/<branch>` link).
- No `Co-Authored-By: Claude` trailer in commits or PR descriptions.
- Never commit `docs/MediDesk-Complete-Guide.pdf` (the user's own file), `hms/.env`,
  `frontend/.env` or `hms/db.sqlite3`. Stage files by name, not with `git add -A`.
- Database passwords (especially the postgres superuser's) never go through the chat. The
  user runs psql commands themselves.
- The user's email is private: never send it to an external service.
- After any change, verify before reporting: tests, lint, build, and for UI or printing work,
  a real browser run.

## Commands

The virtualenv lives at the repo root (`venv/`, Windows: `venv/Scripts/python`).

```bash
# Backend (reads hms/.env: SECRET_KEY, DEBUG, DATABASE_URL to local Postgres db "medidesk", ...)
cd hms
../venv/Scripts/python manage.py runserver            # API on :8000
../venv/Scripts/python manage.py seed_demo            # demo data; needs DEBUG or DEMO_MODE; --flush wipes non-superusers
SECURE_SSL_REDIRECT=False ../venv/Scripts/python manage.py test backend
ruff check .                                          # config in pyproject.toml (line length 110)
../venv/Scripts/python manage.py makemigrations --check --dry-run

# Frontend (reads frontend/.env: VITE_API_URL, VITE_DEMO_MODE)
cd frontend
npm run dev        # :5173
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) runs on every PR: ruff, the missing-migrations check,
`check --deploy --fail-level WARNING`, the backend tests on Postgres 17, then frontend lint
and build. There are no frontend unit tests; UI changes are checked in a browser.

Demo accounts (all `Demo!2345`): `hospital_admin`, `aisha` (doctor), `reception`,
`pharmacy`, `rafi` (patient). With `VITE_DEMO_MODE=true` the login page shows one-click
buttons for each role. That publishes an admin password, so only on demo deployments.

## Architecture

### Roles and access
- Five roles: admin, doctor, receptionist, pharmacist, patient (`User.Role`). `is_staff` is
  derived from the role in `User.save`; superusers count as admin.
- The server is the authority. Rules live in `backend/permissions.py` as `RolePermission`
  subclasses with `read_roles`, `write_roles` and optional `delete_roles`. Reads are checked
  too.
- `ScopedViewSet.scope_queryset` narrows rows per role (a patient sees only their own).
  Rows outside the scope 404 rather than 403.
- The frontend mirrors the rules only to hide what would fail: `frontend/src/permissions.js`
  (`canWrite`), `navigation.js` (`NAV` roles, `canVisit`) and the `RoleRoute` guards in
  `App.jsx`. Keep all three in step with the backend when a rule changes.

### Admin control
- The React app is the main admin panel. Records are edited on their own pages (Doctors,
  Patients, Medicines, Appointments, Prescriptions, Billing, Lab tests). The Admin section
  (`pages/admin/`) holds Users & roles, Departments, Doctor schedules, Pharmacy stock, the
  lab test catalogue, Hospital details, Audit log, and a link to the Django admin.
- The Django admin (`backend/admin.py`) covers every model. `HospitalPermissions` gives the
  admin role full rights without permission rows. A test fails if a model is not registered,
  so register every new model.
- Deletes of clinical and billing records are admin-only and go through
  `components/DeleteRecordButton.jsx` (confirm step).
- Catalogue items in use are never deleted. A prescribed medicine or an ordered lab test is
  refused with a "retire/deactivate instead" message. A `ProtectedError` becomes a 409 in
  `backend/exceptions.py`.
- Accounts are deactivated, not deleted (`admin_api.py`), because deleting a user cascades
  into medical history.

### Billing
- `services.sync_visit_bill(appointment)` rebuilds a visit's generated bill lines
  (consultation fee, prescribed medicines at catalogue price, non-cancelled test orders).
  Call it after any prescription or test-order create, update or delete.
- Lines added by hand (`BillItem.generated=False`) survive a rebuild. Once a bill has a
  payment it is never rebuilt. Totals: `recompute_bill`. A discount may not push the total
  below what was paid.

### Printing and PDFs (two paths, keep them in step)
1. Browser print pages in the SPA: `/print/prescription/:id`, `/print/bill/:id`,
   `/print/lab/:id`, built on `components/PrintShell.jsx`. `?auto=1` opens the print dialog
   (`openPrintable` in `api.js`). Print CSS is the `@media print` block in `index.css`.
   Do not give the sheet a full A4 `min-height` in print: the page margins then spill a
   blank second page.
2. Server PDFs (reportlab) in `backend/pdf.py`, served at `prescriptions/{id}/pdf/`,
   `bills/{id}/pdf/` and `test-orders/{id}/pdf/`. Downloaded through `DownloadPdfButton`,
   because the request needs the JWT.

The letterhead (name, address, phone, email) comes from `HospitalProfile`. That is a
single-row model edited in Admin → Hospital details (`/api/v1/admin/hospital/`) or the
Django admin. The `HOSPITAL_*` env settings only seed the row the first time it is read.
The public `GET /api/v1/clinic/` returns it for the print pages.

### Auditing and security
- `backend/audit.py`: model signals log every write to the models in `AUDITED_MODELS`; add
  new sensitive models there. Only field names are stored, never values. `AuditLog` rows
  cannot be edited or deleted.
- Login protection (`backend/security.py`): a per-username lockout (5 failures, 15 min) and
  a per-IP counter of failures only (20). Never count successful logins: a hospital shares
  one IP. The `login` throttle is 30/min, and `api_exception_handler` turns 429s into
  readable "Try again in N minutes" text.
- Password change and reset live in `account_api.py`. Reset links point to
  `{FRONTEND_URL}/reset-password`. Without `EMAIL_URL`, mail goes to the server log.

### Conventions
- Time zone is `Asia/Dhaka`. Use `timezone.localdate()` and `timezone.localtime()` in date
  logic; UTC dates caused flaky queue tests.
- drf-spectacular: a second model with a `status` choices field needs an entry in
  `ENUM_NAME_OVERRIDES` (settings) or the schema warns.
- Frontend:
  - Shared components are exported from `components/index.js`.
  - Show API errors with `apiError()` from `errors.js`; it handles `{detail}`, field errors
    and plain `["message"]` lists.
  - Format amounts with `money()` from `format.js`.
  - Load lists with `useLoader` from `hooks.js`.
  - `Table` turns into stacked cards on phones.
- `seed_demo` only adds what is missing and must stay safe to rerun: it runs on every
  deploy, and must not rewind today's queue.

## Deployment (Render)

- Blueprint: `render.yaml`. Resources: `medidesk-db` (Postgres), `medidesk-api` (gunicorn,
  build `./build.sh`) and `medidesk-web` (static site).
  - The database and the API must be in the same region (`singapore`) for the internal URL.
- `build.sh` steps:
  - install, `collectstatic`, `migrate`, `createcachetable`;
  - `createsuperuser --no-input` from `DJANGO_SUPERUSER_*` (free instances have no Shell);
  - `seed_demo` when `DEMO_MODE=True`.
- `render.yaml` hardcodes `https://medidesk-api.onrender.com` and
  `https://medidesk-web.onrender.com`: `VITE_API_URL`, CORS/CSRF origins, `FRONTEND_URL`,
  and the CSP `connect-src`. If Render assigns other names, update all of them.
- Blank `CACHE_URL` and `EMAIL_URL` are treated as unset.
- Free-tier limits:
  - the Postgres database expires after 30 days, with no backups;
  - the API sleeps after 15 minutes idle;
  - uploaded media is lost on redeploy.
- Full guide: `docs/DEPLOYMENT.md`.

## Status (2026-11-14)

- Merged into `main`: PR #1 (printing, lab tests, itemised billing, demo logins), PR #2
  (server PDFs, doctor designation, prescription editing), PR #3 (Render deploy fixes).
- Not yet committed (waiting for "push", then PR #4):
  - full admin control: doctor add/edit, medicine edit/retire/delete, admin deletes, bill
    VAT/discount edits;
  - `HospitalProfile` (migration 0015);
  - the blank-second-page print fix;
  - the `apiError` list fix.
- Render deployment: not confirmed yet.
