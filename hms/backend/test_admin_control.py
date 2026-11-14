"""What the admin role controls beyond accounts: hospital details and safe deletes."""

from decimal import Decimal

from django.test import override_settings

from .models import AuditLog, Bill, HospitalProfile, LabTest, Medicine, Prescription, TestOrder, User
from .test_clinical_billing import VisitFixture
from .tests import make_user

NEW_DETAILS = {'name': 'Green Life Hospital', 'address': '7 Lake Road, Dhaka', 'phone': '+880 1700 000000',
               'email': 'desk@greenlife.example'}


class HospitalDetailsTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.admin = make_user('hospadmin', User.Role.ADMIN)

    @override_settings(HOSPITAL={'name': 'From Env', 'address': 'Env Street', 'phone': '1', 'email': ''})
    def test_environment_values_seed_the_first_row(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/v1/admin/hospital/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['name'], response.data['address']), ('From Env', 'Env Street'))

    def test_admin_edits_and_every_printout_uses_the_new_details(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put('/api/v1/admin/hospital/', NEW_DETAILS, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.assertEqual(self.client.get('/api/v1/clinic/').data, NEW_DETAILS)
        self.assertEqual(HospitalProfile.objects.count(), 1)
        self.assertTrue(AuditLog.objects.filter(target_model='HospitalProfile', action='update').exists())

        rx = self.prescribe().data
        self.client.force_authenticate(self.doctor_user)
        pdf = self.client.get(f'/api/v1/prescriptions/{rx["id"]}/pdf/').content
        self.assertIn(b'Green Life Hospital', pdf)

    def test_only_admin_reaches_it(self):
        for role in (User.Role.RECEPTIONIST, User.Role.DOCTOR, User.Role.PATIENT, User.Role.PHARMACIST):
            self.client.force_authenticate(make_user(f'hosp-{role}', role))
            self.assertEqual(self.client.get('/api/v1/admin/hospital/').status_code, 403, role)
            self.assertEqual(self.client.patch('/api/v1/admin/hospital/', {'name': 'x'}, format='json').status_code,
                             403, role)

    def test_name_is_required(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch('/api/v1/admin/hospital/', {'name': ''}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_the_row_cannot_be_deleted(self):
        with self.assertRaises(ValueError):
            HospitalProfile.current().delete()


class AdminDeleteTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.admin = make_user('deladmin', User.Role.ADMIN)

    def test_unused_medicine_and_test_delete(self):
        spare = Medicine.objects.create(name='Spare syrup', unit='bottle', unit_price=Decimal('90'))
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'/api/v1/medicines/{spare.id}/').status_code, 204)
        self.assertEqual(self.client.delete(f'/api/v1/lab-tests/{self.xray.id}/').status_code, 204)

    def test_prescribed_medicine_and_ordered_test_are_kept(self):
        self.prescribe()
        self.client.force_authenticate(self.admin)

        response = self.client.delete(f'/api/v1/medicines/{self.paracetamol.id}/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Retire it instead', str(response.data))
        self.assertTrue(Medicine.objects.filter(pk=self.paracetamol.pk).exists())

        response = self.client.delete(f'/api/v1/lab-tests/{self.cbc.id}/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Deactivate it instead', str(response.data))
        self.assertTrue(LabTest.objects.filter(pk=self.cbc.pk).exists())

    def test_deleting_a_prescription_takes_its_lines_off_the_bill(self):
        rx = self.prescribe().data
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'/api/v1/prescriptions/{rx["id"]}/').status_code, 204)

        self.assertFalse(Prescription.objects.filter(pk=rx['id']).exists())
        services = set(self.bill().items.values_list('service_type', flat=True))
        # The CBC order made with the prescription is its own record and stays billed.
        self.assertEqual(services, {'consultation', 'lab'})
        self.assertTrue(TestOrder.objects.filter(appointment=self.visit).exists())

    def test_admin_deletes_visits_bills_and_orders(self):
        self.prescribe()
        bill = self.bill()
        order = TestOrder.objects.get(appointment=self.visit)
        self.client.force_authenticate(self.admin)

        self.assertEqual(self.client.delete(f'/api/v1/test-orders/{order.id}/').status_code, 204)
        self.assertEqual(self.client.delete(f'/api/v1/bills/{bill.id}/').status_code, 204)
        self.assertEqual(self.client.delete(f'/api/v1/appointments/{self.visit.id}/').status_code, 204)
        self.assertFalse(Bill.objects.filter(pk=bill.pk).exists())

    def test_other_roles_cannot_delete_clinical_records(self):
        rx = self.prescribe().data
        bill = self.bill()
        for user in (self.doctor_user, self.desk, self.patient_user):
            self.client.force_authenticate(user)
            self.assertIn(self.client.delete(f'/api/v1/prescriptions/{rx["id"]}/').status_code, (403, 404))
            self.assertEqual(self.client.delete(f'/api/v1/appointments/{self.visit.id}/').status_code, 403)
        self.client.force_authenticate(self.desk)
        self.assertEqual(self.client.delete(f'/api/v1/bills/{bill.id}/').status_code, 403)


class BillAdjustmentTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.prescribe()
        self.bill_row = self.bill()
        self.client.force_authenticate(self.desk)

    def test_tax_discount_and_due_date_change_after_the_bill_is_raised(self):
        response = self.client.patch(f'/api/v1/bills/{self.bill_row.id}/',
                                     {'tax': '60.00', 'discount': '100.00', 'due_date': '2026-12-31'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data['total']), self.bill_row.amount + Decimal('60') - Decimal('100'))
        self.assertEqual(self.bill().items.count(), 3)

    def test_a_discount_cannot_undercut_what_was_paid(self):
        self.client.post(f'/api/v1/bills/{self.bill_row.id}/pay/', {'amount': '1000', 'method': 'cash'},
                         format='json')
        response = self.client.patch(f'/api/v1/bills/{self.bill_row.id}/', {'discount': '500'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('already paid', str(response.data))
