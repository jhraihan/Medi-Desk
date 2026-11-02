"""The Django admin and the admin-only API behind the React admin section."""

from datetime import date, time, timedelta

from django.contrib import admin
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import (
    AuditLog,
    Department,
    Doctor,
    DoctorSchedule,
    Medicine,
    MedicineStock,
    Patient,
    User,
)
from .security import record_failure
from .tests import make_user

PASSWORD = 'Str0ngPassw0rd!x'


# The manifest storage needs collectstatic first; tests render admin templates without it.
PLAIN_STATIC = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


@override_settings(SECURE_SSL_REDIRECT=False, STORAGES=PLAIN_STATIC)
class DjangoAdminTests(APITestCase):
    def setUp(self):
        # A hospital admin with no Django permission rows: the role alone must be enough.
        self.hospital_admin = make_user('siteadmin', User.Role.ADMIN)
        self.client.force_login(self.hospital_admin)

    def test_every_model_is_registered(self):
        from django.apps import apps

        registered = set(admin.site._registry)
        missing = [model.__name__ for model in apps.get_app_config('backend').get_models()
                   if model not in registered]
        self.assertEqual(missing, [])

    def test_every_changelist_and_add_page_opens(self):
        for model, model_admin in admin.site._registry.items():
            if model._meta.app_label != 'backend':
                continue
            info = (model._meta.app_label, model._meta.model_name)
            changelist = self.client.get(reverse(f'admin:{info[0]}_{info[1]}_changelist'))
            self.assertEqual(changelist.status_code, 200, model.__name__)

            if model_admin.has_add_permission(self._request()):
                add = self.client.get(reverse(f'admin:{info[0]}_{info[1]}_add'))
                self.assertEqual(add.status_code, 200, model.__name__)

    def test_change_pages_open_with_inlines(self):
        department = Department.objects.create(name='Cardiology', description='Heart')
        doctor_user = make_user('admindoc', User.Role.DOCTOR)
        doctor = Doctor.objects.create(user=doctor_user, department=department,
                                       specialization='Cardio', phone='0200000081', experience=3)
        DoctorSchedule.objects.create(doctor=doctor, weekday=0, start_time=time(9), end_time=time(12))
        medicine = Medicine.objects.create(name='Aspirin', unit='strip')
        MedicineStock.objects.create(medicine=medicine, batch_number='B1', quantity=5,
                                     expiry_date=date.today() + timedelta(days=90))

        for obj in (doctor, medicine, doctor_user):
            info = (obj._meta.app_label, obj._meta.model_name)
            response = self.client.get(reverse(f'admin:{info[0]}_{info[1]}_change', args=[obj.pk]))
            self.assertEqual(response.status_code, 200, type(obj).__name__)

    def test_hospital_admin_cannot_edit_or_delete_a_superuser(self):
        root = User.objects.create_superuser('root', 'root@example.com', PASSWORD)
        url = reverse('admin:backend_user_change', args=[root.pk])
        response = self.client.post(url, {'username': 'hijacked', 'role': 'admin', 'is_active': 'on',
                                          'date_joined_0': '2026-01-01', 'date_joined_1': '00:00'})
        self.assertEqual(response.status_code, 403)
        root.refresh_from_db()
        self.assertEqual(root.username, 'root')

        self.assertEqual(self.client.get(reverse('admin:backend_user_delete', args=[root.pk])).status_code, 403)

    def test_hospital_admin_cannot_grant_superuser(self):
        target = make_user('climber', User.Role.RECEPTIONIST)
        url = reverse('admin:backend_user_change', args=[target.pk])
        page = self.client.get(url)
        self.assertNotContains(page, 'name="is_superuser"')

    def test_audit_log_is_read_only(self):
        entry = AuditLog.objects.create(action=AuditLog.Action.READ, target_model='Patient', target_id='1')
        change = reverse('admin:backend_auditlog_change', args=[entry.pk])
        self.assertEqual(self.client.get(change).status_code, 200)
        self.assertEqual(self.client.get(reverse('admin:backend_auditlog_add')).status_code, 403)
        self.assertEqual(self.client.get(reverse('admin:backend_auditlog_delete', args=[entry.pk])).status_code, 403)

    def test_csv_export_neutralises_formulas(self):
        Department.objects.create(name='=HYPERLINK("http://evil")', description='x')
        response = self.client.post(reverse('admin:backend_department_changelist'), {
            'action': 'export_csv',
            '_selected_action': list(Department.objects.values_list('pk', flat=True)),
        })
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn("'=HYPERLINK", response.content.decode())

    def test_non_admin_roles_are_kept_out(self):
        self.client.force_login(make_user('notadmin', User.Role.RECEPTIONIST))
        response = self.client.get(reverse('admin:index'))
        self.assertEqual(response.status_code, 302)

    def _request(self):
        from django.test import RequestFactory

        request = RequestFactory().get('/')
        request.user = self.hospital_admin
        return request


class AdminUserApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin_user = make_user('boss', User.Role.ADMIN)
        self.client.force_authenticate(self.admin_user)

    def test_other_roles_are_refused(self):
        for role in (User.Role.RECEPTIONIST, User.Role.DOCTOR, User.Role.PATIENT, User.Role.PHARMACIST):
            self.client.force_authenticate(make_user(f'not-{role}', role))
            self.assertEqual(self.client.get('/api/v1/admin/users/').status_code, 403, role)
            self.assertEqual(self.client.get('/api/v1/admin/overview/').status_code, 403, role)
            self.assertEqual(self.client.get('/api/v1/admin/audit-logs/').status_code, 403, role)

    def test_create_staff_account(self):
        response = self.client.post('/api/v1/admin/users/', {
            'username': 'newdesk', 'email': 'desk@example.com', 'first_name': 'New', 'last_name': 'Desk',
            'role': 'receptionist', 'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertNotIn('password', response.data)

        user = User.objects.get(username='newdesk')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.is_staff)

    def test_weak_passwords_are_refused(self):
        response = self.client.post('/api/v1/admin/users/', {
            'username': 'weak', 'role': 'pharmacist', 'password': '12345678'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)

    def test_a_doctor_account_needs_its_profile(self):
        payload = {'username': 'newdoc', 'first_name': 'New', 'last_name': 'Doc',
                   'role': 'doctor', 'password': PASSWORD}
        self.assertEqual(self.client.post('/api/v1/admin/users/', payload, format='json').status_code, 400)

        payload['doctor_profile'] = {'specialization': 'GP', 'phone': '0200000091', 'experience': 4}
        response = self.client.post('/api/v1/admin/users/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Doctor.objects.filter(user__username='newdoc').exists())

    def test_a_patient_account_can_carry_its_profile(self):
        response = self.client.post('/api/v1/admin/users/', {
            'username': 'newpatient', 'first_name': 'New', 'role': 'patient', 'password': PASSWORD,
            'patient_profile': {'gender': 'female', 'phone': '0100000091', 'address': 'Road 1'},
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Patient.objects.filter(user__username='newpatient').exists())

    def test_role_change_moves_admin_site_access(self):
        target = make_user('riser', User.Role.RECEPTIONIST)
        self.client.patch(f'/api/v1/admin/users/{target.id}/', {'role': 'admin'}, format='json')
        self.assertTrue(User.objects.get(pk=target.pk).is_staff)

    def test_cannot_touch_a_superuser_or_lock_yourself_out(self):
        root = User.objects.create_superuser('root', 'root@example.com', PASSWORD)
        self.assertEqual(self.client.patch(
            f'/api/v1/admin/users/{root.id}/', {'is_active': False}, format='json').status_code, 403)

        for change in ({'is_active': False}, {'role': 'doctor'}):
            response = self.client.patch(f'/api/v1/admin/users/{self.admin_user.id}/', change, format='json')
            self.assertEqual(response.status_code, 400, change)

    def test_password_cannot_be_changed_through_a_plain_update(self):
        target = make_user('keepsecret', User.Role.PHARMACIST)
        response = self.client.patch(f'/api/v1/admin/users/{target.id}/', {'password': 'N3wPassw0rd!x'},
                                     format='json')
        self.assertEqual(response.status_code, 400)

    def test_deactivating_signs_the_user_out(self):
        target = make_user('leaver', User.Role.RECEPTIONIST)
        tokens = self.client.post('/api/v1/login/', {'username': 'leaver', 'password': PASSWORD},
                                  format='json').data

        self.client.force_authenticate(self.admin_user)
        self.client.patch(f'/api/v1/admin/users/{target.id}/', {'is_active': False}, format='json')

        self.client.force_authenticate(None)
        response = self.client.post('/api/v1/token/refresh/', {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_set_password_and_unlock(self):
        target = make_user('forgetful', User.Role.PATIENT)
        for _ in range(5):
            record_failure('forgetful')

        listed = self.client.get('/api/v1/admin/users/', {'search': 'forgetful'}).data['results'][0]
        self.assertTrue(listed['is_locked'])

        response = self.client.post(f'/api/v1/admin/users/{target.id}/set-password/',
                                    {'password': 'Fresh!Passw0rd9'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_locked'])
        target.refresh_from_db()
        self.assertTrue(target.check_password('Fresh!Passw0rd9'))

        for _ in range(5):
            record_failure('forgetful')
        self.assertFalse(self.client.post(f'/api/v1/admin/users/{target.id}/unlock/').data['is_locked'])

    def test_accounts_cannot_be_deleted_through_the_api(self):
        target = make_user('stays', User.Role.PATIENT)
        self.assertEqual(self.client.delete(f'/api/v1/admin/users/{target.id}/').status_code, 405)


class AdminOverviewAndAuditTests(APITestCase):
    def setUp(self):
        self.admin_user = make_user('overseer', User.Role.ADMIN)
        self.client.force_authenticate(self.admin_user)

    def test_overview_reports_each_area(self):
        Department.objects.create(name='ENT', description='Ears')
        data = self.client.get('/api/v1/admin/overview/').data
        for key in ('users', 'clinic', 'appointments', 'billing', 'pharmacy', 'blood', 'recent_activity'):
            self.assertIn(key, data)
        self.assertEqual(data['clinic']['departments'], 1)
        self.assertTrue(data['django_admin_url'].endswith('/admin/'))

    def test_audit_log_filters(self):
        Department.objects.create(name='Neuro', description='Brain')
        response = self.client.get('/api/v1/admin/audit-logs/', {'target_model': 'Department', 'action': 'create'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertIn('Department', self.client.get('/api/v1/admin/audit-logs/models/').data)


class StockAndScheduleApiTests(APITestCase):
    def setUp(self):
        self.medicine = Medicine.objects.create(name='Paracetamol', unit='strip')
        doctor_user = make_user('sched-doc', User.Role.DOCTOR)
        self.doctor = Doctor.objects.create(user=doctor_user, specialization='GP',
                                            phone='0200000092', experience=2)

    def test_pharmacist_manages_stock_and_receptionist_cannot(self):
        payload = {'medicine': self.medicine.id, 'batch_number': 'P-1', 'quantity': 40,
                   'expiry_date': (date.today() + timedelta(days=200)).isoformat()}

        self.client.force_authenticate(make_user('stock-desk', User.Role.RECEPTIONIST))
        self.assertEqual(self.client.post('/api/v1/medicine-stock/', payload, format='json').status_code, 403)

        self.client.force_authenticate(make_user('stock-pharm', User.Role.PHARMACIST))
        self.assertEqual(self.client.post('/api/v1/medicine-stock/', payload, format='json').status_code, 201)

    def test_overlapping_sessions_are_refused(self):
        self.client.force_authenticate(make_user('sched-desk', User.Role.RECEPTIONIST))
        first = {'doctor': self.doctor.id, 'weekday': 1, 'start_time': '09:00', 'end_time': '12:00'}
        self.assertEqual(self.client.post('/api/v1/doctor-schedules/', first, format='json').status_code, 201)

        overlap = {**first, 'start_time': '11:00', 'end_time': '13:00'}
        self.assertEqual(self.client.post('/api/v1/doctor-schedules/', overlap, format='json').status_code, 400)

        backwards = {**first, 'weekday': 2, 'start_time': '12:00', 'end_time': '09:00'}
        self.assertEqual(self.client.post('/api/v1/doctor-schedules/', backwards, format='json').status_code, 400)
