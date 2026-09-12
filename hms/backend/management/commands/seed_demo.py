import random
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from backend.models import (
    Appointment,
    Bill,
    BillItem,
    BloodRequest,
    CareContact,
    Department,
    Doctor,
    DoctorSchedule,
    Donor,
    MedicationSchedule,
    Medicine,
    MedicineStock,
    Patient,
    Payment,
    Prescription,
    PrescriptionMedicine,
    User,
)
from backend.services import build_doses

PASSWORD = 'Demo!2345'

DEPARTMENTS = [
    ('Cardiology', 'Heart and vascular care'),
    ('Neurology', 'Brain, spine and nervous system'),
    ('Paediatrics', 'Care for infants and children'),
    ('Orthopaedics', 'Bones, joints and muscles'),
]

DOCTORS = [
    ('aisha', 'Aisha', 'Rahman', 'Cardiology', 'Interventional Cardiology', 12, '850.00'),
    ('daniel', 'Daniel', 'Okoye', 'Neurology', 'Clinical Neurology', 8, '900.00'),
    ('mei', 'Mei', 'Tanaka', 'Paediatrics', 'General Paediatrics', 6, '600.00'),
    ('samir', 'Samir', 'Haque', 'Orthopaedics', 'Sports Injury', 15, '750.00'),
]

PATIENTS = [
    ('rafi', 'Rafi', 'Ahmed', date(1991, 3, 14), 'male', 'B+', 'Penicillin'),
    ('nadia', 'Nadia', 'Islam', date(1985, 11, 2), 'female', 'O-', ''),
    ('tom', 'Tom', 'Whitfield', date(1974, 7, 21), 'male', 'A+', 'Latex'),
    ('priya', 'Priya', 'Nair', date(2001, 1, 9), 'female', 'AB+', ''),
    ('lucas', 'Lucas', 'Silva', date(1996, 5, 30), 'male', 'O+', ''),
]

MEDICINES = [
    ('Amoxicillin', 'Amoxicillin trihydrate', 'box', '12.50'),
    ('Atorvastatin', 'Atorvastatin calcium', 'strip', '18.00'),
    ('Ibuprofen', 'Ibuprofen', 'strip', '6.75'),
    ('Metformin', 'Metformin HCl', 'box', '9.20'),
    ('Salbutamol', 'Salbutamol sulfate', 'inhaler', '22.00'),
]

DIAGNOSES = [
    'Seasonal viral infection',
    'Mild hypertension, monitor weekly',
    'Lower back strain',
    'Type 2 diabetes review',
    'Asthma follow-up',
]


class Command(BaseCommand):
    help = 'Populate the database with realistic demo data for every role.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush',
            action='store_true',
            help='Delete existing demo rows before seeding.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(7)

        if options['flush']:
            self._flush()

        departments = self._departments()
        self._staff()
        doctors = self._doctors(departments)
        patients = self._patients()
        medicines = self._medicines()
        appointments = self._appointments(doctors, patients)
        self._prescriptions(appointments, medicines)
        self._bills(appointments)
        self._queue(appointments)
        self._donors(patients)
        self._reminders(patients, medicines)

        self.stdout.write(self.style.SUCCESS(
            f'\nSeeded {len(departments)} departments, {len(doctors)} doctors, '
            f'{len(patients)} patients, {len(appointments)} appointments.'
        ))
        self.stdout.write(f'\nEveryone signs in with: {PASSWORD}')
        self.stdout.write('  admin      hospital_admin')
        self.stdout.write('  doctor     aisha')
        self.stdout.write('  reception  reception')
        self.stdout.write('  pharmacist pharmacy')
        self.stdout.write('  patient    rafi')

    def _flush(self):
        MedicationSchedule.objects.all().delete()
        CareContact.objects.all().delete()
        BloodRequest.objects.all().delete()
        Donor.objects.all().delete()
        Payment.objects.all().delete()
        BillItem.objects.all().delete()
        Bill.objects.all().delete()
        PrescriptionMedicine.objects.all().delete()
        Prescription.objects.all().delete()
        Appointment.objects.all().delete()
        MedicineStock.objects.all().delete()
        Medicine.objects.all().delete()
        DoctorSchedule.objects.all().delete()
        Doctor.objects.all().delete()
        Patient.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()
        Department.objects.all().delete()
        self.stdout.write('Cleared existing demo data.')

    def _user(self, username, first, last, role):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'first_name': first,
                'last_name': last,
                'email': f'{username}@example.com',
                'role': role,
            },
        )
        if created:
            user.set_password(PASSWORD)
            user.save(update_fields=['password'])
        return user

    def _departments(self):
        return {
            name: Department.objects.get_or_create(
                name=name, defaults={'description': description})[0]
            for name, description in DEPARTMENTS
        }

    def _staff(self):
        admin = self._user('hospital_admin', 'Hospital', 'Admin', User.Role.ADMIN)
        admin.is_staff = True
        admin.save(update_fields=['is_staff'])
        self._user('reception', 'Rita', 'Costa', User.Role.RECEPTIONIST)
        self._user('pharmacy', 'Paul', 'Mensah', User.Role.PHARMACIST)
        return admin

    def _doctors(self, departments):
        doctors = []
        for username, first, last, dept, specialisation, years, fee in DOCTORS:
            user = self._user(username, first, last, User.Role.DOCTOR)
            doctor, _ = Doctor.objects.get_or_create(
                user=user,
                defaults={
                    'department': departments[dept],
                    'specialization': specialisation,
                    'experience': years,
                    'consultation_fee': Decimal(fee),
                    'phone': f'020{random.randint(1000000, 9999999)}',
                    'qualification': 'MBBS, FCPS',
                    'license_number': f'LIC{random.randint(10000, 99999)}',
                },
            )
            for weekday in range(0, 5):
                DoctorSchedule.objects.get_or_create(
                    doctor=doctor, weekday=weekday, start_time=time(9, 0),
                    defaults={'end_time': time(16, 0)},
                )
            doctors.append(doctor)
        return doctors

    def _patients(self):
        patients = []
        for username, first, last, dob, gender, blood, allergies in PATIENTS:
            user = self._user(username, first, last, User.Role.PATIENT)
            patient, _ = Patient.objects.get_or_create(
                user=user,
                defaults={
                    'date_of_birth': dob,
                    'gender': gender,
                    'blood_group': blood,
                    'address': f'{random.randint(1, 200)} Hospital Road',
                    'phone': f'017{random.randint(10000000, 99999999)}',
                    'allergies': allergies,
                    'emergency_contact_name': 'Next of kin',
                    'emergency_contact_phone': '01700000000',
                },
            )
            patients.append(patient)
        return patients

    def _medicines(self):
        medicines = []
        for name, generic, unit, price in MEDICINES:
            medicine, _ = Medicine.objects.get_or_create(
                name=name,
                defaults={
                    'generic_name': generic,
                    'unit': unit,
                    'unit_price': Decimal(price),
                    'manufacturer': 'Generic Pharma',
                },
            )
            MedicineStock.objects.get_or_create(
                medicine=medicine, batch_number='B2026A',
                defaults={
                    'quantity': random.randint(4, 60),
                    'reorder_level': 10,
                    'expiry_date': date.today() + timedelta(days=random.randint(45, 500)),
                    'purchase_price': Decimal(price) * Decimal('0.6'),
                },
            )
            medicines.append(medicine)
        return medicines

    def _appointments(self, doctors, patients):
        if Appointment.objects.exists():
            return list(Appointment.objects.all())

        appointments = []
        base = timezone.now().replace(minute=0, second=0, microsecond=0)

        # a spread of past (completed) and upcoming appointments
        for offset in range(-8, 7):
            doctor = doctors[offset % len(doctors)]
            patient = patients[offset % len(patients)]
            when = base + timedelta(days=offset, hours=random.choice([1, 2, 3, 4]))

            if Appointment.objects.filter(doctor=doctor, appointment_date=when).exists():
                continue

            status = 'completed' if offset < 0 else random.choice(['pending', 'approved'])
            appointments.append(Appointment.objects.create(
                patient=patient,
                doctor=doctor,
                appointment_date=when,
                status=status,
                reason=random.choice(['Routine check', 'Follow-up', 'New symptoms']),
            ))
        return appointments

    def _prescriptions(self, appointments, medicines):
        for appointment in appointments:
            if appointment.status != 'completed':
                continue
            if hasattr(appointment, 'prescription'):
                continue

            prescription = Prescription.objects.create(
                appointment=appointment,
                prescribed_by=appointment.doctor,
                diagnosis=random.choice(DIAGNOSES),
                notes='Rest and fluids. Return if symptoms persist.',
            )
            for medicine in random.sample(medicines, random.randint(1, 3)):
                PrescriptionMedicine.objects.create(
                    prescription=prescription,
                    medicine=medicine,
                    dosage=random.choice(['1 tablet', '2 tablets', '5 ml']),
                    frequency=random.choice(['Once daily', 'Twice daily', 'Every 8 hours']),
                    duration=random.choice(['5 days', '7 days', '14 days']),
                    quantity=random.randint(1, 3),
                )

    def _bills(self, appointments):
        for appointment in appointments:
            if appointment.status != 'completed':
                continue
            if Bill.objects.filter(appointment=appointment).exists():
                continue

            fee = appointment.doctor.consultation_fee
            bill = Bill.objects.create(
                patient=appointment.patient,
                appointment=appointment,
                amount=fee,
                tax=(fee * Decimal('0.05')).quantize(Decimal('0.01')),
                due_date=date.today() + timedelta(days=14),
            )
            BillItem.objects.create(
                bill=bill,
                description=f'Consultation with {appointment.doctor}',
                service_type=BillItem.ServiceType.CONSULTATION,
                quantity=1,
                unit_price=fee,
            )

            if random.random() < 0.6:
                Payment.objects.create(bill=bill, amount=bill.total, method='card')
                bill.paid = True
                bill.save(update_fields=['paid'])

    def _queue(self, appointments):
        today = timezone.localdate()
        todays = [a for a in appointments if a.appointment_date.date() == today]

        doctor = Doctor.objects.first()
        patients = list(Patient.objects.all())
        base = timezone.now().replace(minute=0, second=0, microsecond=0)
        reasons = ['Fever and cough', 'Follow-up review', 'Chest pain', 'Rash on arms']

        index = 0
        while len(todays) < 4 and index < len(patients):
            when = base + timedelta(hours=index + 1)
            if not Appointment.objects.filter(doctor=doctor, appointment_date=when).exists():
                todays.append(Appointment.objects.create(
                    patient=patients[index], doctor=doctor, appointment_date=when,
                    status='approved', reason=reasons[index % len(reasons)]))
            index += 1

        for index, appointment in enumerate(todays[:3]):
            appointment.checked_in_at = timezone.now() - timedelta(minutes=30 - index * 10)
            appointment.status = 'checked_in'
            appointment.save(update_fields=['checked_in_at', 'status'])

    def _donors(self, patients):
        if Donor.objects.exists():
            return

        groups = ['O-', 'O+', 'B+', 'A+', 'AB+']
        districts = ['Dhaka', 'Dhaka', 'Gazipur', 'Dhaka', 'Chattogram']

        for index, patient in enumerate(patients):
            Donor.objects.create(
                user=patient.user,
                blood_group=groups[index % len(groups)],
                district=districts[index % len(districts)],
                area=random.choice(['Mirpur', 'Dhanmondi', 'Uttara', 'Banani']),
                phone=f'017{random.randint(10000000, 99999999)}',
                last_donation_date=(
                    date.today() - timedelta(days=20) if index == 3 else None),
            )

        BloodRequest.objects.create(
            requested_by=patients[0].user,
            blood_group='O+',
            units=2,
            hospital='Dhaka Medical College Hospital',
            district='Dhaka',
            needed_by=timezone.now() + timedelta(hours=8),
            urgency='critical',
            note='Surgery scheduled for tomorrow morning.',
        )

    def _reminders(self, patients, medicines):
        if MedicationSchedule.objects.exists():
            return

        patient = patients[0]
        for medicine, times in [(medicines[3], ['08:00', '20:00']), (medicines[1], ['21:00'])]:
            schedule = MedicationSchedule.objects.create(
                patient=patient,
                medicine=medicine,
                medicine_name=medicine.name,
                dosage='1 tablet',
                instructions='After food',
                times=times,
                start_date=date.today() - timedelta(days=3),
                end_date=date.today() + timedelta(days=10),
            )
            build_doses(schedule)

        past = schedule.doses.filter(due_at__lt=timezone.now()).order_by('due_at')
        for index, dose in enumerate(past):
            dose.state = 'missed' if index % 4 == 3 else 'taken'
            dose.confirmed_at = dose.due_at
            dose.save(update_fields=['state', 'confirmed_at'])

        CareContact.objects.get_or_create(
            patient=patient,
            defaults={
                'name': 'Shirin Ahmed',
                'phone': '01711111111',
                'relationship': 'Daughter',
                'user': patients[1].user,
                'alert_after_misses': 3,
                'consent_given': True,
            },
        )
