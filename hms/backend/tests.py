from datetime import date, time, timedelta
from decimal import Decimal

from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    Appointment,
    AuditLog,
    Bill,
    Doctor,
    DoctorSchedule,
    Medicine,
    MedicineStock,
    Notification,
    Patient,
    Payment,
    Prescription,
    PrescriptionMedicine,
    User,
)


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
