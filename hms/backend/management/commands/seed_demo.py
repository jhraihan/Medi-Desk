import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
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
    LabTest,
    MedicationSchedule,
    Medicine,
    MedicineStock,
    Patient,
    Payment,
    Prescription,
    PrescriptionMedicine,
    TestOrder,
    User,
)
from backend.services import build_doses, recompute_bill, sync_visit_bill

PASSWORD = 'Demo!2345'

DEPARTMENTS = [
    ('Cardiology', 'Heart and vascular care'),
    ('Neurology', 'Brain, spine and nervous system'),
    ('Paediatrics', 'Care for infants and children'),
    ('Orthopaedics', 'Bones, joints and muscles'),
]

DESIGNATIONS = ['Senior Consultant', 'Associate Professor', 'Consultant', 'Junior Consultant']

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

# Name, generic name, unit, price per unit in taka. Roughly what a Dhaka pharmacy
# charges, so bills look believable in a demo.
MEDICINES = [
    ('Amoxicillin', 'Amoxicillin trihydrate', 'box', '12.50'),
    ('Atorvastatin', 'Atorvastatin calcium', 'strip', '18.00'),
    ('Ibuprofen', 'Ibuprofen', 'strip', '6.75'),
    ('Metformin', 'Metformin HCl', 'box', '9.20'),
    ('Salbutamol', 'Salbutamol sulfate', 'inhaler', '22.00'),
    ('Paracetamol 500 mg', 'Paracetamol', 'tablet', '1.20'),
    ('Paracetamol syrup 120 ml', 'Paracetamol', 'bottle', '35.00'),
    ('Omeprazole 20 mg', 'Omeprazole', 'capsule', '5.00'),
    ('Esomeprazole 20 mg', 'Esomeprazole magnesium', 'capsule', '7.00'),
    ('Pantoprazole 40 mg', 'Pantoprazole sodium', 'tablet', '7.00'),
    ('Cetirizine 10 mg', 'Cetirizine HCl', 'tablet', '3.00'),
    ('Fexofenadine 120 mg', 'Fexofenadine HCl', 'tablet', '8.00'),
    ('Montelukast 10 mg', 'Montelukast sodium', 'tablet', '16.00'),
    ('Azithromycin 500 mg', 'Azithromycin', 'tablet', '40.00'),
    ('Ciprofloxacin 500 mg', 'Ciprofloxacin', 'tablet', '15.00'),
    ('Cefixime 200 mg', 'Cefixime', 'capsule', '35.00'),
    ('Cefuroxime 500 mg', 'Cefuroxime axetil', 'tablet', '50.00'),
    ('Flucloxacillin 500 mg', 'Flucloxacillin', 'capsule', '12.00'),
    ('Metronidazole 400 mg', 'Metronidazole', 'tablet', '2.00'),
    ('Amlodipine 5 mg', 'Amlodipine besylate', 'tablet', '6.00'),
    ('Losartan 50 mg', 'Losartan potassium', 'tablet', '8.00'),
    ('Bisoprolol 5 mg', 'Bisoprolol fumarate', 'tablet', '8.00'),
    ('Rosuvastatin 10 mg', 'Rosuvastatin calcium', 'tablet', '18.00'),
    ('Clopidogrel 75 mg', 'Clopidogrel', 'tablet', '10.00'),
    ('Aspirin 75 mg', 'Acetylsalicylic acid', 'tablet', '1.00'),
    ('Gliclazide 80 mg', 'Gliclazide', 'tablet', '6.00'),
    ('Sitagliptin 50 mg', 'Sitagliptin', 'tablet', '40.00'),
    ('Insulin glargine pen', 'Insulin glargine 100 IU/ml', 'pen', '1200.00'),
    ('Levothyroxine 50 mcg', 'Levothyroxine sodium', 'tablet', '2.00'),
    ('Diclofenac 50 mg', 'Diclofenac sodium', 'tablet', '2.00'),
    ('Naproxen 500 mg', 'Naproxen', 'tablet', '8.00'),
    ('Tramadol 50 mg', 'Tramadol HCl', 'capsule', '8.00'),
    ('Domperidone 10 mg', 'Domperidone', 'tablet', '3.00'),
    ('Ondansetron 8 mg', 'Ondansetron', 'tablet', '15.00'),
    ('Oral rehydration salts', 'ORS', 'sachet', '6.00'),
    ('Zinc 20 mg', 'Zinc sulfate', 'tablet', '2.50'),
    ('Calcium + vitamin D3', 'Calcium carbonate, cholecalciferol', 'tablet', '8.00'),
    ('Iron + folic acid', 'Ferrous fumarate, folic acid', 'capsule', '4.00'),
    ('Vitamin B complex', 'B vitamins', 'tablet', '1.50'),
    ('Prednisolone 5 mg', 'Prednisolone', 'tablet', '1.00'),
    ('Hydrocortisone cream 1%', 'Hydrocortisone', 'tube', '60.00'),
    ('Clotrimazole cream 1%', 'Clotrimazole', 'tube', '45.00'),
    ('Budesonide inhaler 200 mcg', 'Budesonide', 'inhaler', '450.00'),
    ('Ceftriaxone 1 g injection', 'Ceftriaxone sodium', 'vial', '180.00'),
    ('Normal saline 0.9% 500 ml', 'Sodium chloride', 'bag', '90.00'),
    ('Lactulose syrup 100 ml', 'Lactulose', 'bottle', '160.00'),
]

# Name, category, price in taka, sample result shown once a seeded test is done.
LAB_TESTS = [
    ('Complete blood count (CBC)', 'blood', '400', 'Hb 13.4 g/dL, WBC 7,800/µL, platelets 2.6 lakh/µL.'),
    ('Fasting blood sugar', 'blood', '150', '5.4 mmol/L'),
    ('Random blood sugar', 'blood', '120', '7.1 mmol/L'),
    ('HbA1c', 'blood', '900', '6.1 %'),
    ('Lipid profile', 'blood', '1000', 'Total cholesterol 192 mg/dL, LDL 118, HDL 46, TG 140.'),
    ('Liver function tests (LFT)', 'blood', '1200', 'ALT 32 U/L, AST 28 U/L, bilirubin 0.8 mg/dL.'),
    ('Serum creatinine', 'blood', '350', '0.9 mg/dL'),
    ('Serum electrolytes', 'blood', '900', 'Na 139, K 4.1, Cl 102 mmol/L.'),
    ('Thyroid stimulating hormone (TSH)', 'blood', '800', '2.3 mIU/L'),
    ('C-reactive protein (CRP)', 'blood', '600', '4 mg/L'),
    ('Dengue NS1 antigen', 'blood', '500', 'Negative'),
    ('Blood grouping & Rh', 'blood', '150', 'B positive'),
    ('Serum uric acid', 'blood', '350', '5.6 mg/dL'),
    ('Vitamin D (25-OH)', 'blood', '2500', '24 ng/mL (insufficient)'),
    ('Urine routine examination', 'urine', '250', 'Pus cells 2-4/HPF, no RBC, no casts.'),
    ('Stool routine examination', 'urine', '250', 'No ova or parasites seen.'),
    ('Urine culture & sensitivity', 'urine', '800', 'No growth after 48 hours.'),
    ('Chest X-ray (PA view)', 'imaging', '600', 'Lung fields clear. Heart size normal.'),
    ('Ultrasound whole abdomen', 'imaging', '1500', 'Mild fatty liver. Otherwise normal study.'),
    ('X-ray knee (AP/lateral)', 'imaging', '700', 'Early degenerative change, medial compartment.'),
    ('CT scan brain', 'imaging', '5000', 'No acute intracranial abnormality.'),
    ('ECG (12-lead)', 'cardiac', '400', 'Sinus rhythm, 76 bpm. No ST changes.'),
    ('Echocardiogram', 'cardiac', '2500', 'LVEF 60%. Normal valves.'),
    ('Exercise tolerance test (ETT)', 'cardiac', '3500', 'Negative for inducible ischaemia.'),
]

# Sunday to Thursday, the Bangladeshi working week (Monday is 0).
CLINIC_DAYS = [6, 0, 1, 2, 3]


# A dose and a dispensed quantity that make sense for the form the medicine comes in.
DOSE_BY_UNIT = {
    'tablet': '1 tablet', 'capsule': '1 capsule', 'strip': '1 tablet', 'box': '1 capsule',
    'bottle': '10 ml', 'tube': 'Apply thinly', 'inhaler': '2 puffs', 'pen': '10 units',
    'vial': '1 g IV', 'bag': '500 ml IV', 'sachet': '1 sachet in 500 ml water',
}


def dose_for(medicine):
    dosage = DOSE_BY_UNIT.get(medicine.unit, f'1 {medicine.unit}')
    quantity = random.choice([10, 14, 20]) if medicine.unit in ('tablet', 'capsule') else random.choice([1, 2])
    return dosage, quantity


def clinic_time(day, hour, minute=0):
    """A wall-clock time at the clinic (TIME_ZONE), whatever the hour the seed runs.

    Basing visits on now() put them at 10 PM or midnight when seeded in the evening,
    outside every doctor's hours.
    """
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


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
        # Every seeded account, the admin included, shares one published password, and
        # --flush deletes every account that is not a superuser. Neither belongs near
        # real patient data, so production has to opt in with DEMO_MODE.
        if not (settings.DEBUG or settings.DEMO_MODE):
            raise CommandError(
                'seed_demo creates accounts with a public password. Set DEMO_MODE=True '
                'to run it with DEBUG off, and only on a deployment without real data.')

        random.seed(7)

        if options['flush']:
            self._flush()

        departments = self._departments()
        self._staff()
        doctors = self._doctors(departments)
        patients = self._patients()
        medicines = self._medicines()
        lab_tests = self._lab_tests()
        appointments = self._appointments(doctors, patients)
        self._prescriptions(appointments, medicines, lab_tests)
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
        TestOrder.objects.all().delete()
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
        for index, (username, first, last, dept, specialisation, years, fee) in enumerate(DOCTORS):
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
            if not doctor.designation:
                doctor.designation = DESIGNATIONS[index % len(DESIGNATIONS)]
                doctor.save(update_fields=['designation'])
            for weekday in CLINIC_DAYS:
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
                    'quantity': random.randint(60, 600),
                    'reorder_level': 10,
                    'expiry_date': date.today() + timedelta(days=random.randint(45, 500)),
                    'purchase_price': Decimal(price) * Decimal('0.6'),
                },
            )
            medicines.append(medicine)
        return medicines

    def _lab_tests(self):
        return [
            LabTest.objects.get_or_create(
                name=name, defaults={'category': category, 'price': Decimal(price)})[0]
            for name, category, price, _ in LAB_TESTS
        ]

    def _appointments(self, doctors, patients):
        if Appointment.objects.exists():
            return list(Appointment.objects.all())

        appointments = []
        today = timezone.localdate()

        # a spread of past (completed) and upcoming appointments, inside clinic hours
        for offset in range(-11, 10):
            doctor = doctors[offset % len(doctors)]
            patient = patients[offset % len(patients)]
            day = today + timedelta(days=offset)
            if day.weekday() not in CLINIC_DAYS:
                continue
            when = clinic_time(day, random.choice([9, 10, 11, 12, 14, 15]), random.choice([0, 30]))

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

    def _prescriptions(self, appointments, medicines, lab_tests):
        results = {name: result for name, _, _, result in LAB_TESTS}
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
                dosage, quantity = dose_for(medicine)
                PrescriptionMedicine.objects.create(
                    prescription=prescription,
                    medicine=medicine,
                    dosage=dosage,
                    frequency=random.choice(['Once daily', 'Twice daily', 'Every 8 hours']),
                    duration=random.choice(['5 days', '7 days', '14 days']),
                    quantity=quantity,
                )
            # About half the visits come with tests, already reported since the visit is past.
            if random.random() < 0.5:
                for test in random.sample(lab_tests, random.randint(1, 2)):
                    TestOrder.objects.create(
                        appointment=appointment, test=test, ordered_by=appointment.doctor,
                        status=TestOrder.Status.COMPLETED, completed_at=timezone.now(),
                        result=results.get(test.name, 'Within normal limits.'),
                        result_flag=random.choice([TestOrder.Flag.NORMAL, TestOrder.Flag.NORMAL,
                                                   TestOrder.Flag.ABNORMAL]))

    def _bills(self, appointments):
        for appointment in appointments:
            if appointment.status != 'completed':
                continue
            if Bill.objects.filter(appointment=appointment).exists():
                continue

            # Consultation, prescribed medicines and tests, exactly as the app bills a visit.
            bill = sync_visit_bill(appointment)
            bill.due_date = date.today() + timedelta(days=14)
            bill.save(update_fields=['due_date'])

            if random.random() < 0.6:
                Payment.objects.create(bill=bill, amount=bill.total, method=random.choice(['cash', 'card']))
                recompute_bill(bill)

    def _queue(self, appointments):
        today = timezone.localdate()
        todays = [a for a in appointments if a.appointment_date.date() == today]

        doctor = Doctor.objects.first()
        patients = list(Patient.objects.all())
        reasons = ['Fever and cough', 'Follow-up review', 'Chest pain', 'Rash on arms']

        index = 0
        while len(todays) < 4 and index < len(patients):
            when = clinic_time(today, 9, 0) + timedelta(minutes=30 * index)
            if not Appointment.objects.filter(doctor=doctor, appointment_date=when).exists():
                todays.append(Appointment.objects.create(
                    patient=patients[index], doctor=doctor, appointment_date=when,
                    status='approved', reason=reasons[index % len(reasons)]))
            index += 1

        # build.sh reseeds on every deploy; a queue already under way must not rewind.
        if any(a.status in ('checked_in', 'in_consultation', 'completed') for a in todays):
            return

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
