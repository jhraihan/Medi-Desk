from datetime import date, time, timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    Appointment,
    AuditLog,
    Bill,
    Doctor,
    DoctorSchedule,
    DocumentAccessLog,
    DocumentShare,
    MedicalDocument,
    Medicine,
    MedicineStock,
    Notification,
    Patient,
    Payment,
    Prescription,
    PrescriptionMedicine,
    User,
)
from .services import queue_position, queue_state


def make_user(username, role, **extra):
    return User.objects.create_user(
        username=username, password='Str0ngPassw0rd!x', role=role, **extra
    )


class RegistrationTests(APITestCase):
    def test_cannot_self_register_as_admin(self):
        response = self.client.post('/api/v1/register/', {
            'username': 'sneaky',
            'email': 'sneaky@example.com',
            'password': 'Str0ngPassw0rd!x',
            'role': 'admin',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(username='sneaky').role, User.Role.PATIENT)

    def test_registration_does_not_leak_role_field(self):
        response = self.client.post('/api/v1/register/', {
            'username': 'plain',
            'email': 'plain@example.com',
            'password': 'Str0ngPassw0rd!x',
        }, format='json')
        self.assertNotIn('role', response.data)

    def test_password_is_hashed(self):
        self.client.post('/api/v1/register/', {
            'username': 'hashme',
            'email': 'h@example.com',
            'password': 'Str0ngPassw0rd!x',
        }, format='json')
        user = User.objects.get(username='hashme')
        self.assertNotEqual(user.password, 'Str0ngPassw0rd!x')
        self.assertTrue(user.password.startswith('pbkdf2_'))


class ScopingTests(APITestCase):
    """A patient must never see another patient's data, by list or by direct URL."""

    def setUp(self):
        self.alice = make_user('alice', User.Role.PATIENT)
        self.bob = make_user('bob', User.Role.PATIENT)
        self.doctor_user = make_user('drwho', User.Role.DOCTOR)
        self.other_doctor_user = make_user('drother', User.Role.DOCTOR)

        self.alice_patient = Patient.objects.create(
            user=self.alice, date_of_birth=date(1995, 6, 1), gender='female',
            blood_group='A+', address='1 Road', phone='0100000001')
        self.bob_patient = Patient.objects.create(
            user=self.bob, date_of_birth=date(1984, 2, 20), gender='male',
            blood_group='O-', address='2 Road', phone='0100000002')

        self.doctor = Doctor.objects.create(
            user=self.doctor_user, specialization='Cardiology',
            phone='0200000001', experience=5)
        self.other_doctor = Doctor.objects.create(
            user=self.other_doctor_user, specialization='Neurology',
            phone='0200000002', experience=8)

        self.alice_appt = Appointment.objects.create(
            patient=self.alice_patient, doctor=self.doctor,
            appointment_date=timezone.now() + timezone.timedelta(days=1))

        self.alice_bill = Bill.objects.create(patient=self.alice_patient, amount='100.00')
        self.bob_bill = Bill.objects.create(patient=self.bob_patient, amount='250.00')

    def test_patient_list_only_returns_self(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get('/api/v1/patients/')
        ids = [row['id'] for row in response.data['results']]
        self.assertEqual(ids, [self.alice_patient.id])

    def test_patient_cannot_read_another_patient_by_id(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get(f'/api/v1/patients/{self.bob_patient.id}/')
        self.assertEqual(response.status_code, 404)

    def test_patient_cannot_read_another_patients_bill(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.get(f'/api/v1/bills/{self.bob_bill.id}/').status_code, 404)
        self.assertEqual(
            self.client.get(f'/api/v1/bills/{self.alice_bill.id}/').status_code, 200)

    def test_doctor_only_sees_patients_they_have_appointments_with(self):
        self.client.force_authenticate(self.doctor_user)
        ids = [row['id'] for row in self.client.get('/api/v1/patients/').data['results']]
        self.assertEqual(ids, [self.alice_patient.id])

        self.client.force_authenticate(self.other_doctor_user)
        self.assertEqual(self.client.get('/api/v1/patients/').data['results'], [])

    def test_admin_sees_everything(self):
        admin = make_user('boss', User.Role.ADMIN)
        self.client.force_authenticate(admin)
        self.assertEqual(len(self.client.get('/api/v1/patients/').data['results']), 2)

    def test_anonymous_is_rejected(self):
        self.assertEqual(self.client.get('/api/v1/patients/').status_code, 401)

    def test_patient_cannot_write_bills(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post('/api/v1/bills/', {
            'patient': self.alice_patient.id, 'amount': '1.00', 'paid': True,
        }, format='json')
        self.assertEqual(response.status_code, 403)


class PrescriptionAuthorshipTests(ScopingTests):
    def test_doctor_cannot_prescribe_for_another_doctors_appointment(self):
        self.client.force_authenticate(self.other_doctor_user)
        response = self.client.post('/api/v1/prescriptions/', {
            'appointment': self.alice_appt.id,
            'diagnosis': 'nothing',
            'notes': '',
            'medicines': [],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_doctor_can_prescribe_for_own_appointment(self):
        self.client.force_authenticate(self.doctor_user)
        response = self.client.post('/api/v1/prescriptions/', {
            'appointment': self.alice_appt.id,
            'diagnosis': 'checked',
            'notes': '',
            'medicines': [],
        }, format='json')
        self.assertEqual(response.status_code, 201)


class FilteringTests(ScopingTests):
    def test_appointment_filter_actually_filters(self):
        admin = make_user('boss2', User.Role.ADMIN)
        Appointment.objects.create(
            patient=self.bob_patient, doctor=self.other_doctor,
            appointment_date=timezone.now() + timezone.timedelta(days=2))

        self.client.force_authenticate(admin)
        self.assertEqual(len(self.client.get('/api/v1/appointments/').data['results']), 2)

        filtered = self.client.get(f'/api/v1/appointments/?doctor={self.doctor.id}')
        self.assertEqual(len(filtered.data['results']), 1)

    def test_responses_are_paginated(self):
        admin = make_user('boss3', User.Role.ADMIN)
        self.client.force_authenticate(admin)
        self.assertIn('count', self.client.get('/api/v1/patients/').data)


class ModelRuleTests(ScopingTests):
    def test_age_is_derived_from_date_of_birth(self):
        born = date(1995, 6, 1)
        today = date.today()
        expected = today.year - born.year - (
            0 if (today.month, today.day) >= (born.month, born.day) else 1)
        self.assertEqual(self.alice_patient.age, expected)

    def test_patient_gets_a_medical_record_number(self):
        self.assertTrue(self.alice_patient.medical_record_number.startswith('MRN'))
        self.assertNotEqual(
            self.alice_patient.medical_record_number,
            self.bob_patient.medical_record_number)

    def test_doctor_cannot_be_double_booked(self):
        with self.assertRaises(IntegrityError):
            Appointment.objects.create(
                patient=self.bob_patient,
                doctor=self.doctor,
                appointment_date=self.alice_appt.appointment_date,
            )

    def test_cancelled_slot_can_be_rebooked(self):
        self.alice_appt.status = 'cancelled'
        self.alice_appt.save()
        Appointment.objects.create(
            patient=self.bob_patient,
            doctor=self.doctor,
            appointment_date=self.alice_appt.appointment_date,
        )

    def test_bill_totals_are_derived(self):
        bill = Bill.objects.create(
            patient=self.alice_patient, amount=Decimal('100'),
            tax=Decimal('10'), discount=Decimal('5'))
        self.assertEqual(bill.total, Decimal('105'))
        self.assertEqual(bill.balance, Decimal('105'))

        Payment.objects.create(bill=bill, amount=Decimal('40'))
        bill.refresh_from_db()
        self.assertEqual(bill.amount_paid, Decimal('40'))
        self.assertEqual(bill.balance, Decimal('65'))

    def test_audit_log_is_append_only(self):
        entry = AuditLog.objects.create(
            action=AuditLog.Action.READ, target_model='Patient', target_id='1')
        with self.assertRaises(ValueError):
            entry.save()
        with self.assertRaises(ValueError):
            entry.delete()


class BookingApiTests(ScopingTests):
    def test_booking_a_taken_slot_is_rejected(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post('/api/v1/appointments/', {
            'patient': self.alice_patient.id,
            'doctor': self.doctor.id,
            'appointment_date': self.alice_appt.appointment_date.isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('appointment_date', response.data)

    def test_cannot_book_in_the_past(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post('/api/v1/appointments/', {
            'patient': self.alice_patient.id,
            'doctor': self.doctor.id,
            'appointment_date': (timezone.now() - timezone.timedelta(days=1)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cannot_book_an_unavailable_doctor(self):
        self.doctor.is_available = False
        self.doctor.save()

        self.client.force_authenticate(self.alice)
        response = self.client.post('/api/v1/appointments/', {
            'patient': self.alice_patient.id,
            'doctor': self.doctor.id,
            'appointment_date': (timezone.now() + timezone.timedelta(days=5)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_available_slots_needs_a_date(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get(f'/api/v1/doctors/{self.doctor.id}/available-slots/')
        self.assertEqual(response.status_code, 400)

    def test_available_slots_excludes_booked_times(self):
        DoctorSchedule.objects.create(
            doctor=self.doctor,
            weekday=self.alice_appt.appointment_date.weekday(),
            start_time=time(9, 0), end_time=time(17, 0))

        self.client.force_authenticate(self.alice)
        day = self.alice_appt.appointment_date.date().isoformat()
        response = self.client.get(
            f'/api/v1/doctors/{self.doctor.id}/available-slots/?date={day}')

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.alice_appt.appointment_date.isoformat(), response.data['slots'])


class DashboardTests(ScopingTests):
    def test_each_role_gets_its_own_shape(self):
        self.client.force_authenticate(self.alice)
        patient_view = self.client.get('/api/v1/dashboard/')
        self.assertEqual(patient_view.status_code, 200)
        self.assertEqual(patient_view.data['role'], 'patient')
        self.assertIn('outstanding_balance', patient_view.data)

        self.client.force_authenticate(self.doctor_user)
        doctor_view = self.client.get('/api/v1/dashboard/')
        self.assertIn('today_appointments', doctor_view.data)
        self.assertNotIn('revenue_this_month', doctor_view.data)

        self.client.force_authenticate(make_user('boss4', User.Role.ADMIN))
        admin_view = self.client.get('/api/v1/dashboard/')
        self.assertIn('revenue_this_month', admin_view.data)

    def test_dashboard_requires_login(self):
        self.assertEqual(self.client.get('/api/v1/dashboard/').status_code, 401)


class DispensingTests(ScopingTests):
    def setUp(self):
        super().setUp()
        self.pharmacist = make_user('pharm', User.Role.PHARMACIST)
        self.medicine = Medicine.objects.create(name='Amoxicillin', unit='box')
        self.prescription = Prescription.objects.create(
            appointment=self.alice_appt, diagnosis='infection')
        PrescriptionMedicine.objects.create(
            prescription=self.prescription, medicine=self.medicine,
            dosage='1 daily', duration='5 days', quantity=3)

    def _stock(self, quantity, days_to_expiry=90, batch='B1'):
        return MedicineStock.objects.create(
            medicine=self.medicine, batch_number=batch, quantity=quantity,
            reorder_level=2, expiry_date=date.today() + timedelta(days=days_to_expiry))

    def test_dispensing_decrements_stock(self):
        batch = self._stock(10)
        self.client.force_authenticate(self.pharmacist)
        response = self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')

        self.assertEqual(response.status_code, 200)
        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 7)
        self.prescription.refresh_from_db()
        self.assertEqual(self.prescription.status, Prescription.Status.DISPENSED)

    def test_cannot_dispense_more_than_stock(self):
        self._stock(1)
        self.client.force_authenticate(self.pharmacist)
        response = self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')

        self.assertEqual(response.status_code, 400)
        self.assertIn('in stock', response.data['detail'])
        self.prescription.refresh_from_db()
        self.assertNotEqual(self.prescription.status, Prescription.Status.DISPENSED)

    def test_oldest_batch_is_used_first(self):
        soon = self._stock(2, days_to_expiry=10, batch='OLD')
        later = self._stock(10, days_to_expiry=200, batch='NEW')

        self.client.force_authenticate(self.pharmacist)
        self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')

        soon.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(soon.quantity, 0)
        self.assertEqual(later.quantity, 9)

    def test_expired_stock_is_not_used(self):
        self._stock(50, days_to_expiry=-1, batch='EXPIRED')
        self.client.force_authenticate(self.pharmacist)
        response = self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')
        self.assertEqual(response.status_code, 400)

    def test_dispensing_twice_is_refused(self):
        self._stock(20)
        self.client.force_authenticate(self.pharmacist)
        first = self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')
        second = self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)

    def test_only_pharmacists_can_dispense(self):
        self._stock(20)
        self.client.force_authenticate(self.doctor_user)
        response = self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')
        self.assertEqual(response.status_code, 403)

    def test_low_stock_raises_a_notification(self):
        self._stock(4)
        self.client.force_authenticate(self.pharmacist)
        self.client.post(f'/api/v1/prescriptions/{self.prescription.id}/dispense/')
        self.assertTrue(
            Notification.objects.filter(recipient=self.pharmacist, message__icontains='low on stock').exists())


class PaymentApiTests(ScopingTests):
    def test_paying_in_full_marks_the_bill_paid(self):
        admin = make_user('boss5', User.Role.ADMIN)
        self.client.force_authenticate(admin)

        response = self.client.post(
            f'/api/v1/bills/{self.alice_bill.id}/pay/',
            {'amount': '100.00', 'method': 'cash'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.alice_bill.refresh_from_db()
        self.assertTrue(self.alice_bill.paid)

    def test_partial_payment_leaves_a_balance(self):
        admin = make_user('boss6', User.Role.ADMIN)
        self.client.force_authenticate(admin)

        self.client.post(f'/api/v1/bills/{self.alice_bill.id}/pay/',
                         {'amount': '30.00', 'method': 'card'}, format='json')

        self.alice_bill.refresh_from_db()
        self.assertFalse(self.alice_bill.paid)
        self.assertEqual(self.alice_bill.balance, Decimal('70.00'))

    def test_invoice_renders(self):
        admin = make_user('boss7', User.Role.ADMIN)
        self.client.force_authenticate(admin)
        response = self.client.get(f'/api/v1/bills/{self.alice_bill.id}/invoice/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.alice_bill.invoice_number, response.content.decode())


class NotificationApiTests(ScopingTests):
    def test_you_only_see_your_own_notifications(self):
        Notification.objects.create(recipient=self.alice, message='yours')
        Notification.objects.create(recipient=self.bob, message='not yours')

        self.client.force_authenticate(self.alice)
        results = self.client.get('/api/v1/notifications/').data['results']
        self.assertEqual([row['message'] for row in results], ['yours'])

    def test_mark_all_read(self):
        Notification.objects.create(recipient=self.alice, message='one')
        Notification.objects.create(recipient=self.alice, message='two')

        self.client.force_authenticate(self.alice)
        response = self.client.post('/api/v1/notifications/mark-all-read/')
        self.assertEqual(response.data['marked_read'], 2)
        self.assertFalse(Notification.objects.filter(recipient=self.alice, is_read=False).exists())


class QueueTests(APITestCase):
    def setUp(self):
        self.doctor_user = make_user('queuedoc', User.Role.DOCTOR)
        self.doctor = Doctor.objects.create(
            user=self.doctor_user, specialization='GP',
            phone='0200000009', experience=4, average_consult_minutes=10)

        self.reception = make_user('desk', User.Role.RECEPTIONIST)
        self.patients = []
        for name in ['pa', 'pb', 'pc']:
            user = make_user(name, User.Role.PATIENT)
            self.patients.append(Patient.objects.create(
                user=user, date_of_birth=date(1990, 1, 1), gender='male',
                blood_group='O+', address='x', phone='0100000000'))

    def _appointment(self, patient, hour):
        when = timezone.now().replace(hour=hour, minute=0, second=0, microsecond=0)
        if when < timezone.now():
            when = when + timedelta(days=0)
        return Appointment.objects.create(
            patient=patient, doctor=self.doctor,
            appointment_date=when, status='approved')

    def test_checking_in_gives_sequential_positions(self):
        appointments = [self._appointment(p, 9 + i) for i, p in enumerate(self.patients)]
        self.client.force_authenticate(self.reception)

        for appointment in appointments:
            response = self.client.post(f'/api/v1/appointments/{appointment.id}/check-in/')
            self.assertEqual(response.status_code, 200)

        for expected, appointment in enumerate(appointments, start=1):
            appointment.refresh_from_db()
            self.assertEqual(queue_position(appointment), expected)

    def test_completing_moves_the_queue_up(self):
        appointments = [self._appointment(p, 9 + i) for i, p in enumerate(self.patients)]
        self.client.force_authenticate(self.reception)
        for appointment in appointments:
            self.client.post(f'/api/v1/appointments/{appointment.id}/check-in/')

        self.client.post(f'/api/v1/appointments/{appointments[0].id}/complete/')

        appointments[1].refresh_from_db()
        self.assertEqual(queue_position(appointments[1]), 1)

    def test_estimated_wait_uses_average_consult_time(self):
        appointments = [self._appointment(p, 9 + i) for i, p in enumerate(self.patients)]
        self.client.force_authenticate(self.reception)
        for appointment in appointments:
            self.client.post(f'/api/v1/appointments/{appointment.id}/check-in/')

        appointments[2].refresh_from_db()
        state = queue_state(appointments[2])
        self.assertEqual(state['people_ahead'], 2)
        self.assertEqual(state['estimated_wait_minutes'], 20)
        self.assertFalse(state['is_next'])

    def test_first_in_line_is_next(self):
        appointment = self._appointment(self.patients[0], 9)
        self.client.force_authenticate(self.reception)
        self.client.post(f'/api/v1/appointments/{appointment.id}/check-in/')

        appointment.refresh_from_db()
        self.assertTrue(queue_state(appointment)['is_next'])

    def test_cannot_check_in_on_another_day(self):
        future = timezone.now() + timedelta(days=3)
        appointment = Appointment.objects.create(
            patient=self.patients[0], doctor=self.doctor,
            appointment_date=future, status='approved')

        self.client.force_authenticate(self.reception)
        response = self.client.post(f'/api/v1/appointments/{appointment.id}/check-in/')
        self.assertEqual(response.status_code, 400)

    def test_cannot_start_before_check_in(self):
        appointment = self._appointment(self.patients[0], 9)
        self.client.force_authenticate(self.reception)
        response = self.client.post(f'/api/v1/appointments/{appointment.id}/start/')
        self.assertEqual(response.status_code, 400)

    def test_patient_sees_own_queue_position(self):
        appointment = self._appointment(self.patients[0], 9)
        self.client.force_authenticate(self.reception)
        self.client.post(f'/api/v1/appointments/{appointment.id}/check-in/')

        self.client.force_authenticate(self.patients[0].user)
        response = self.client.get('/api/v1/queue/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['position'], 1)

    def test_patient_cannot_read_a_doctor_queue(self):
        self.client.force_authenticate(self.patients[0].user)
        response = self.client.get(f'/api/v1/queue/doctor/{self.doctor.id}/')
        self.assertEqual(response.status_code, 404)

    def test_doctor_reads_own_queue_only(self):
        other_user = make_user('otherdoc2', User.Role.DOCTOR)
        other = Doctor.objects.create(
            user=other_user, specialization='ENT', phone='0200000010', experience=2)

        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(
            self.client.get(f'/api/v1/queue/doctor/{self.doctor.id}/').status_code, 200)
        self.assertEqual(
            self.client.get(f'/api/v1/queue/doctor/{other.id}/').status_code, 404)

    def test_doctor_can_set_clinic_status(self):
        self.client.force_authenticate(make_user('bossq', User.Role.ADMIN))
        response = self.client.patch(
            f'/api/v1/doctors/{self.doctor.id}/availability/',
            {'clinic_status': 'running_late', 'status_note': 'About 20 minutes'},
            format='json')

        self.assertEqual(response.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.clinic_status, 'running_late')

    def test_unknown_clinic_status_is_rejected(self):
        self.client.force_authenticate(make_user('bossq2', User.Role.ADMIN))
        response = self.client.patch(
            f'/api/v1/doctors/{self.doctor.id}/availability/',
            {'clinic_status': 'on_holiday'}, format='json')
        self.assertEqual(response.status_code, 400)


def fake_pdf(name='report.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4 fake report body', content_type='application/pdf')


class DocumentTests(APITestCase):
    def setUp(self):
        self.alice = make_user('docalice', User.Role.PATIENT)
        self.bob = make_user('docbob', User.Role.PATIENT)
        self.doctor_user = make_user('docdoc', User.Role.DOCTOR)
        self.other_doctor = make_user('docother', User.Role.DOCTOR)

        self.alice_patient = Patient.objects.create(
            user=self.alice, date_of_birth=date(1990, 5, 5), gender='female',
            blood_group='A+', address='1 Road', phone='0100000011')
        self.bob_patient = Patient.objects.create(
            user=self.bob, date_of_birth=date(1988, 3, 3), gender='male',
            blood_group='B+', address='2 Road', phone='0100000012')

        Doctor.objects.create(user=self.doctor_user, specialization='GP',
                              phone='0200000011', experience=6)
        Doctor.objects.create(user=self.other_doctor, specialization='ENT',
                              phone='0200000012', experience=3)

    def _upload(self, user, **overrides):
        self.client.force_authenticate(user)
        payload = {
            'title': 'Blood test',
            'kind': 'lab_report',
            'document_date': date.today().isoformat(),
            'file': fake_pdf(),
        }
        payload.update(overrides)
        return self.client.post('/api/v1/documents/', payload, format='multipart')

    def _share(self, document_id, doctor, days=3):
        return self.client.post(
            f'/api/v1/documents/{document_id}/share/',
            {'shared_with': doctor.id,
             'expires_at': (timezone.now() + timedelta(days=days)).isoformat()},
            format='json')

    def test_patient_can_upload_a_document(self):
        response = self._upload(self.alice)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(MedicalDocument.objects.get().patient, self.alice_patient)

    def test_upload_rejects_a_disguised_executable(self):
        bad = SimpleUploadedFile('evil.pdf', b'MZ\x90\x00 windows executable',
                                 content_type='application/pdf')
        response = self._upload(self.alice, file=bad)
        self.assertEqual(response.status_code, 400)
        self.assertIn('file', response.data)

    def test_upload_rejects_a_mismatched_extension(self):
        mismatched = SimpleUploadedFile('report.png', b'%PDF-1.4 actually a pdf',
                                        content_type='image/png')
        response = self._upload(self.alice, file=mismatched)
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_an_oversized_file(self):
        big = SimpleUploadedFile('big.pdf', b'%PDF-1.4' + b'x' * (11 * 1024 * 1024),
                                 content_type='application/pdf')
        response = self._upload(self.alice, file=big)
        self.assertEqual(response.status_code, 400)

    def test_future_dated_documents_are_rejected(self):
        response = self._upload(
            self.alice, document_date=(date.today() + timedelta(days=2)).isoformat())
        self.assertEqual(response.status_code, 400)

    def test_patient_sees_only_their_own_documents(self):
        self._upload(self.alice)
        self._upload(self.bob)

        self.client.force_authenticate(self.alice)
        rows = self.client.get('/api/v1/documents/').data['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['patient'], self.alice_patient.id)

    def test_doctor_sees_nothing_until_a_record_is_shared(self):
        self._upload(self.alice)
        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(self.client.get('/api/v1/documents/').data['results'], [])

    def test_sharing_grants_access_and_revoking_removes_it(self):
        document_id = self._upload(self.alice).data['id']

        self.client.force_authenticate(self.alice)
        share = self._share(document_id, self.doctor_user)
        self.assertEqual(share.status_code, 201)

        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(len(self.client.get('/api/v1/documents/').data['results']), 1)

        self.client.force_authenticate(self.alice)
        self.client.delete(f'/api/v1/document-shares/{share.data["id"]}/')

        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(self.client.get('/api/v1/documents/').data['results'], [])

    def test_an_expired_share_stops_working(self):
        document_id = self._upload(self.alice).data['id']

        self.client.force_authenticate(self.alice)
        self._share(document_id, self.doctor_user)

        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(len(self.client.get('/api/v1/documents/').data['results']), 1)

        share = DocumentShare.objects.get()
        share.expires_at = timezone.now() - timedelta(minutes=1)
        share.save(update_fields=['expires_at'])

        self.assertEqual(self.client.get('/api/v1/documents/').data['results'], [])
        self.assertEqual(
            self.client.get(f'/api/v1/documents/{document_id}/').status_code, 404)

    def test_a_share_does_not_leak_to_other_doctors(self):
        document_id = self._upload(self.alice).data['id']

        self.client.force_authenticate(self.alice)
        self._share(document_id, self.doctor_user)

        self.client.force_authenticate(self.other_doctor)
        self.assertEqual(self.client.get('/api/v1/documents/').data['results'], [])

    def test_cannot_share_a_record_you_do_not_own(self):
        document_id = self._upload(self.alice).data['id']

        self.client.force_authenticate(self.bob)
        response = self._share(document_id, self.doctor_user)
        self.assertIn(response.status_code, [403, 404])

    def test_records_can_only_be_shared_with_doctors(self):
        document_id = self._upload(self.alice).data['id']

        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f'/api/v1/documents/{document_id}/share/',
            {'shared_with': self.bob.id,
             'expires_at': (timezone.now() + timedelta(days=1)).isoformat()},
            format='json')
        self.assertEqual(response.status_code, 400)

    def test_downloading_writes_an_access_log_entry(self):
        document_id = self._upload(self.alice).data['id']

        self.client.force_authenticate(self.alice)
        self._share(document_id, self.doctor_user)

        self.client.force_authenticate(self.doctor_user)
        self.client.get(f'/api/v1/documents/{document_id}/download/')

        self.client.force_authenticate(self.alice)
        log = self.client.get(f'/api/v1/documents/{document_id}/access-log/').data
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]['viewed_by'], self.doctor_user.id)

    def test_access_log_is_append_only(self):
        document = MedicalDocument.objects.create(
            patient=self.alice_patient, title='x', kind='other',
            document_date=date.today(), file='documents/x.pdf')
        entry = DocumentAccessLog.objects.create(document=document, viewed_by=self.doctor_user)

        with self.assertRaises(ValueError):
            entry.save()
        with self.assertRaises(ValueError):
            entry.delete()
