from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Appointment, Bill, Doctor, Patient, User


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
            user=self.alice, age=30, gender='female', blood_group='A+',
            address='1 Road', phone='0100000001')
        self.bob_patient = Patient.objects.create(
            user=self.bob, age=41, gender='male', blood_group='O-',
            address='2 Road', phone='0100000002')

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
