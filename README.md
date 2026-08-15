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
