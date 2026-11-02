"""Regression tests for the authorization and abuse holes closed in the security review."""

from datetime import date, timedelta

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

# Imported as a module so the runner does not collect ScopingTests a second time here.
from . import tests as base
from .models import (
    Appointment,
    AuditLog,
    Bill,
    BloodRequest,
    CareContact,
    Doctor,
    Donor,
    MedicalDocument,
    Patient,
    Prescription,
    User,
)
from .tests import make_user

PASSWORD = 'Str0ngPassw0rd!x'


class LoginProtectionTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user('lockme', User.Role.PATIENT)

    def _login(self, password, client=None):
        return (client or self.client).post(
            '/api/v1/login/', {'username': 'lockme', 'password': password}, format='json')

    def test_account_locks_after_repeated_failures(self):
        for _ in range(5):
            self.assertEqual(self._login('wrong').status_code, 401)

        response = self._login(PASSWORD)
        self.assertEqual(response.status_code, 401)
        self.assertIn('Too many failed sign-in attempts', str(response.data['detail']))

    def test_a_successful_login_resets_the_count(self):
        for _ in range(4):
            self._login('wrong')
        self.assertEqual(self._login(PASSWORD).status_code, 200)
        for _ in range(4):
            self._login('wrong')
        self.assertEqual(self._login(PASSWORD).status_code, 200)

    def test_the_lock_holds_across_client_addresses(self):
        for index in range(5):
            self._login('wrong', APIClient(REMOTE_ADDR=f'10.0.0.{index + 1}'))
        response = self._login(PASSWORD, APIClient(REMOTE_ADDR='10.0.0.99'))
        self.assertEqual(response.status_code, 401)

    def test_login_is_rate_limited_per_address(self):
        codes = []
        for index in range(12):
            codes.append(self.client.post(
                '/api/v1/login/', {'username': f'nobody{index}', 'password': 'x'}, format='json',
            ).status_code)
        self.assertEqual(codes[-1], 429)

    @override_settings(SECURE_SSL_REDIRECT=False, STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
    })
    def test_django_admin_login_is_locked_too(self):
        User.objects.filter(pk=self.user.pk).update(role=User.Role.ADMIN, is_staff=True)
        for _ in range(5):
            self.client.post('/admin/login/', {'username': 'lockme', 'password': 'wrong'})

        response = self.client.post('/admin/login/', {'username': 'lockme', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200)  # the form re-rendered, no redirect
        self.assertContains(response, 'Too many failed sign-in attempts')


class AppointmentAuthorizationTests(base.ScopingTests):
    def _book(self, **payload):
        return self.client.post('/api/v1/appointments/', {
            'doctor': self.doctor.id,
            'appointment_date': (timezone.now() + timedelta(days=3)).isoformat(),
            **payload,
        }, format='json')

    def test_patient_cannot_book_for_someone_else(self):
        self.client.force_authenticate(self.alice)
        response = self._book(patient=self.bob_patient.id)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Appointment.objects.filter(patient=self.bob_patient).exists())

    def test_patient_booking_is_always_pending(self):
        self.client.force_authenticate(self.alice)
        response = self._book(patient=self.alice_patient.id, status='approved',
                              meeting_link='https://evil.example.com')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(response.data['meeting_link'], '')

    def test_patient_can_book_without_naming_themselves(self):
        self.client.force_authenticate(self.alice)
        response = self._book()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['patient'], self.alice_patient.id)

    def test_patient_can_cancel_but_not_approve(self):
        self.client.force_authenticate(self.alice)
        url = f'/api/v1/appointments/{self.alice_appt.id}/'
        self.assertEqual(self.client.patch(url, {'status': 'approved'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'doctor': self.other_doctor.id}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'status': 'cancelled'}, format='json').status_code, 200)

    def test_cancelling_works_after_the_doctor_stops_taking_bookings(self):
        Doctor.objects.filter(pk=self.doctor.pk).update(is_available=False)
        self.client.force_authenticate(self.alice)
        response = self.client.patch(
            f'/api/v1/appointments/{self.alice_appt.id}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_status_cannot_skip_the_visit_workflow(self):
        self.client.force_authenticate(make_user('desk1', User.Role.RECEPTIONIST))
        response = self.client.patch(
            f'/api/v1/appointments/{self.alice_appt.id}/', {'status': 'completed'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_patient_cannot_run_the_visit(self):
        Appointment.objects.filter(pk=self.alice_appt.pk).update(
            appointment_date=timezone.now(), status='approved')
        self.client.force_authenticate(self.alice)
        for step in ('check-in', 'start', 'complete'):
            response = self.client.post(f'/api/v1/appointments/{self.alice_appt.id}/{step}/')
            self.assertEqual(response.status_code, 403, step)

    def test_doctor_cannot_book_for_another_doctor(self):
        self.client.force_authenticate(self.doctor_user)
        response = self._book(patient=self.alice_patient.id, doctor=self.other_doctor.id)
        self.assertEqual(response.status_code, 400)

    def test_only_admin_deletes_appointments(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.delete(f'/api/v1/appointments/{self.alice_appt.id}/').status_code, 403)
        self.client.force_authenticate(make_user('desk2', User.Role.RECEPTIONIST))
        self.assertEqual(self.client.delete(f'/api/v1/appointments/{self.alice_appt.id}/').status_code, 403)
        self.assertTrue(Appointment.objects.filter(pk=self.alice_appt.pk).exists())


class PatientRecordTests(base.ScopingTests):
    def test_patient_cannot_delete_their_record_or_bills(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.delete(f'/api/v1/patients/{self.alice_patient.id}/').status_code, 403)
        self.assertTrue(Bill.objects.filter(pk=self.alice_bill.pk).exists())

    def test_patient_profile_always_belongs_to_the_caller(self):
        carol = make_user('carol', User.Role.PATIENT)
        self.client.force_authenticate(carol)
        response = self.client.post('/api/v1/patients/', {
            'user': self.doctor_user.id, 'gender': 'female', 'address': 'x', 'phone': '0100000099',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Patient.objects.get(pk=response.data['id']).user, carol)

    def test_patient_cannot_move_their_profile(self):
        self.client.force_authenticate(self.alice)
        self.client.patch(f'/api/v1/patients/{self.alice_patient.id}/', {'user': self.bob.id}, format='json')
        self.alice_patient.refresh_from_db()
        self.assertEqual(self.alice_patient.user, self.alice)

    def test_front_desk_registration_creates_the_account(self):
        self.client.force_authenticate(make_user('desk3', User.Role.RECEPTIONIST))
        response = self.client.post('/api/v1/patients/', {
            'first_name': 'Walk', 'last_name': 'In', 'email': 'walk@example.com',
            'gender': 'male', 'address': 'Somewhere', 'phone': '0100000098',
        }, format='json')
        self.assertEqual(response.status_code, 201)

        account = Patient.objects.get(pk=response.data['id']).user
        self.assertEqual(account.role, User.Role.PATIENT)
        self.assertEqual(account.get_full_name(), 'Walk In')
        self.assertFalse(account.has_usable_password())

    def test_front_desk_registration_needs_a_name(self):
        self.client.force_authenticate(make_user('desk4', User.Role.RECEPTIONIST))
        response = self.client.post('/api/v1/patients/', {
            'gender': 'male', 'address': 'Somewhere', 'phone': '0100000097'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('first_name', response.data)


class BillingIntegrityTests(base.ScopingTests):
    def setUp(self):
        super().setUp()
        self.desk = make_user('desk5', User.Role.RECEPTIONIST)

    def _as_desk(self):
        self.client.force_authenticate(self.desk)

    def test_paid_cannot_be_set_by_hand(self):
        self._as_desk()
        self.client.patch(f'/api/v1/bills/{self.alice_bill.id}/', {'paid': True}, format='json')
        self.alice_bill.refresh_from_db()
        self.assertFalse(self.alice_bill.paid)

    def test_negative_amounts_are_rejected(self):
        self._as_desk()
        response = self.client.post('/api/v1/bills/', {
            'patient': self.alice_patient.id, 'amount': '-50.00'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_discount_cannot_exceed_the_bill(self):
        self._as_desk()
        response = self.client.post('/api/v1/bills/', {
            'patient': self.alice_patient.id, 'amount': '50.00', 'discount': '80.00'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_payments_must_be_positive_and_within_the_balance(self):
        self._as_desk()
        url = f'/api/v1/bills/{self.alice_bill.id}/pay/'
        self.assertEqual(self.client.post(url, {'amount': '-10'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'amount': '0'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'amount': '100.01'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'amount': '100.00'}, format='json').status_code, 200)

    def test_only_admin_deletes_bills(self):
        self._as_desk()
        self.assertEqual(self.client.delete(f'/api/v1/bills/{self.alice_bill.id}/').status_code, 403)


class PrescriptionIntegrityTests(base.ScopingTests):
    def setUp(self):
        super().setUp()
        self.prescription = Prescription.objects.create(appointment=self.alice_appt, diagnosis='Flu')
        self.url = f'/api/v1/prescriptions/{self.prescription.id}/'

    def test_doctor_cannot_mark_dispensed(self):
        self.client.force_authenticate(self.doctor_user)
        response = self.client.patch(self.url, {'status': 'dispensed'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_a_dispensed_prescription_is_locked(self):
        Prescription.objects.filter(pk=self.prescription.pk).update(status=Prescription.Status.DISPENSED)
        self.client.force_authenticate(self.doctor_user)
        response = self.client.patch(self.url, {'diagnosis': 'Something else'}, format='json')
        self.assertEqual(response.status_code, 400)


class ClinicAccessTests(base.ScopingTests):
    def test_doctor_sets_own_clinic_status(self):
        self.client.force_authenticate(self.doctor_user)
        response = self.client.patch(f'/api/v1/doctors/{self.doctor.id}/availability/',
                                     {'clinic_status': 'on_break'}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_doctor_cannot_set_another_doctors_status(self):
        self.client.force_authenticate(self.doctor_user)
        response = self.client.patch(f'/api/v1/doctors/{self.other_doctor.id}/availability/',
                                     {'clinic_status': 'on_break'}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_pharmacist_cannot_read_a_doctor_queue(self):
        self.client.force_authenticate(make_user('pharm1', User.Role.PHARMACIST))
        self.assertEqual(self.client.get(f'/api/v1/queue/doctor/{self.doctor.id}/').status_code, 404)

    def test_doctor_profile_must_use_a_doctor_account(self):
        self.client.force_authenticate(make_user('desk6', User.Role.RECEPTIONIST))
        response = self.client.post('/api/v1/doctors/', {
            'user': self.bob.id, 'specialization': 'GP', 'phone': '0200000099', 'experience': 2,
        }, format='json')
        self.assertEqual(response.status_code, 400)


class SharedDocumentTests(APITestCase):
    def setUp(self):
        self.owner = make_user('shareowner', User.Role.PATIENT)
        self.patient = Patient.objects.create(user=self.owner, gender='female', address='x', phone='0100000071')
        self.doctor_user = make_user('sharedoc', User.Role.DOCTOR)
        Doctor.objects.create(user=self.doctor_user, specialization='GP', phone='0200000071', experience=4)

        self.client.force_authenticate(self.owner)
        self.document_id = self.client.post('/api/v1/documents/', {
            'title': 'X-ray', 'kind': 'scan', 'document_date': date.today().isoformat(),
            'file': SimpleUploadedFile('scan.pdf', b'%PDF-1.4 body', content_type='application/pdf'),
        }, format='multipart').data['id']
        self.client.post(f'/api/v1/documents/{self.document_id}/share/', {
            'shared_with': self.doctor_user.id,
            'expires_at': (timezone.now() + timedelta(days=2)).isoformat()}, format='json')
        self.client.force_authenticate(self.doctor_user)

    def test_shared_doctor_can_read(self):
        self.assertEqual(self.client.get(f'/api/v1/documents/{self.document_id}/').status_code, 200)

    def test_shared_doctor_cannot_edit_or_delete(self):
        url = f'/api/v1/documents/{self.document_id}/'
        self.assertEqual(self.client.patch(url, {'title': 'tampered'}, format='multipart').status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(MedicalDocument.objects.get(pk=self.document_id).title, 'X-ray')


class BloodRequestOwnershipTests(APITestCase):
    def setUp(self):
        self.requester = make_user('needsblood', User.Role.PATIENT)
        self.donor_user = make_user('givesblood', User.Role.PATIENT)
        Donor.objects.create(user=self.donor_user, blood_group='O-', district='Dhaka', phone='0100000072')
        self.blood_request = BloodRequest.objects.create(
            requested_by=self.requester, blood_group='A+', units=1, hospital='DMCH',
            district='Dhaka', needed_by=timezone.now() + timedelta(days=1))
        self.url = f'/api/v1/blood-requests/{self.blood_request.id}/'

    def test_donor_sees_but_cannot_change_someone_elses_request(self):
        self.client.force_authenticate(self.donor_user)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.patch(self.url, {'hospital': 'Elsewhere'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(self.url).status_code, 404)
        self.blood_request.refresh_from_db()
        self.assertEqual(self.blood_request.hospital, 'DMCH')

    def test_requester_can_edit_their_own(self):
        self.client.force_authenticate(self.requester)
        self.assertEqual(self.client.patch(self.url, {'note': 'Ward 4'}, format='json').status_code, 200)


class ReminderAbuseTests(APITestCase):
    def setUp(self):
        self.user = make_user('remindme', User.Role.PATIENT)
        Patient.objects.create(user=self.user, gender='male', address='x', phone='0100000073')
        self.client.force_authenticate(self.user)

    def test_schedule_length_is_capped(self):
        response = self.client.post('/api/v1/medication-schedules/', {
            'medicine_name': 'X', 'dosage': '1', 'times': ['08:00'],
            'start_date': date.today().isoformat(),
            'end_date': (date.today() + timedelta(days=3650)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('end_date', response.data)

    def test_bad_times_per_day_is_a_400_not_a_500(self):
        response = self.client.post('/api/v1/medication-schedules/from-prescription/',
                                    {'prescription': 1, 'times_per_day': 'lots'}, format='json')
        self.assertIn(response.status_code, (400, 404))

    def test_care_contact_cannot_target_another_account(self):
        stranger = make_user('stranger', User.Role.PATIENT)
        self.client.post('/api/v1/care-contacts/', {
            'name': 'Mum', 'phone': '0100000074', 'user': stranger.id, 'consent_given': True,
        }, format='json')
        self.assertIsNone(CareContact.objects.get().user)


class AuditTrailTests(base.ScopingTests):
    def test_writes_are_recorded_with_the_actor(self):
        desk = make_user('desk7', User.Role.RECEPTIONIST)
        self.client.force_authenticate(desk)
        self.client.patch(f'/api/v1/appointments/{self.alice_appt.id}/', {'status': 'approved'}, format='json')

        entry = AuditLog.objects.filter(target_model='Appointment', action=AuditLog.Action.UPDATE).latest('id')
        self.assertEqual(entry.actor, desk)
        self.assertEqual(entry.actor_role, User.Role.RECEPTIONIST)
        self.assertEqual(entry.changes, {'fields': ['status']})

    def test_opening_a_patient_record_is_recorded(self):
        self.client.force_authenticate(self.doctor_user)
        self.client.get(f'/api/v1/patients/{self.alice_patient.id}/')
        self.assertTrue(AuditLog.objects.filter(
            action=AuditLog.Action.READ, target_model='Patient',
            target_id=str(self.alice_patient.id), actor=self.doctor_user).exists())

    def test_values_are_never_copied_into_the_log(self):
        self.client.force_authenticate(self.alice)
        self.client.patch(f'/api/v1/patients/{self.alice_patient.id}/',
                          {'allergies': 'Peanuts'}, format='json')
        entry = AuditLog.objects.filter(target_model='Patient', action=AuditLog.Action.UPDATE).latest('id')
        self.assertEqual(entry.changes, {'fields': ['allergies']})
        self.assertNotIn('Peanuts', str(entry.changes))

    def test_deletes_are_recorded(self):
        self.client.force_authenticate(make_user('boss8', User.Role.ADMIN))
        self.client.delete(f'/api/v1/bills/{self.bob_bill.id}/')
        self.assertTrue(AuditLog.objects.filter(
            action=AuditLog.Action.DELETE, target_model='Bill', target_id=str(self.bob_bill.id)).exists())


class ApiDocsTests(APITestCase):
    def test_schema_is_closed_to_the_public(self):
        self.assertIn(self.client.get('/api/schema/').status_code, (401, 403))

    def test_schema_is_open_to_admins(self):
        self.client.force_authenticate(make_user('docsadmin', User.Role.ADMIN))
        self.assertEqual(self.client.get('/api/schema/').status_code, 200)


class DemoSeedGuardTests(APITestCase):
    @override_settings(DEBUG=False, DEMO_MODE=False)
    def test_seed_refuses_without_demo_mode(self):
        with self.assertRaises(CommandError):
            call_command('seed_demo')
        self.assertFalse(User.objects.filter(username='hospital_admin').exists())


class StaffFlagTests(APITestCase):
    def test_admin_role_grants_and_demotion_removes_admin_site_access(self):
        user = make_user('promoted', User.Role.RECEPTIONIST)
        self.assertFalse(user.is_staff)

        user.role = User.Role.ADMIN
        user.save()
        self.assertTrue(User.objects.get(pk=user.pk).is_staff)

        user.role = User.Role.DOCTOR
        user.save()
        self.assertFalse(User.objects.get(pk=user.pk).is_staff)
