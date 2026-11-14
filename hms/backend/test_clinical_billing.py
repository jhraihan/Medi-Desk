"""Prescriptions and tests feeding the visit bill, line-item bills, test results, printing data."""

from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Appointment, Bill, BillItem, Doctor, LabTest, Medicine, Patient, Payment, TestOrder, User
from .tests import make_user


class VisitFixture(APITestCase):
    def setUp(self):
        self.doctor_user = make_user('billdoc', User.Role.DOCTOR, first_name='Nusrat', last_name='Karim')
        self.doctor = Doctor.objects.create(user=self.doctor_user, specialization='Medicine', phone='0200000101',
                                            experience=9, consultation_fee=Decimal('800.00'),
                                            qualification='MBBS, FCPS')
        self.other_doctor_user = make_user('otherbilldoc', User.Role.DOCTOR)
        self.other_doctor = Doctor.objects.create(user=self.other_doctor_user, specialization='ENT',
                                                  phone='0200000102', experience=3)
        self.patient_user = make_user('billpatient', User.Role.PATIENT)
        self.patient = Patient.objects.create(user=self.patient_user, gender='female', address='Dhaka',
                                              phone='0100000101')
        self.desk = make_user('billdesk', User.Role.RECEPTIONIST)

        self.visit = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
                                                appointment_date=timezone.now(), status='in_consultation')
        self.paracetamol = Medicine.objects.create(name='Paracetamol 500 mg', unit='tablet',
                                                   unit_price=Decimal('1.20'))
        self.cbc = LabTest.objects.create(name='CBC', category='blood', price=Decimal('400.00'))
        self.xray = LabTest.objects.create(name='Chest X-ray', category='imaging', price=Decimal('600.00'))

    def prescribe(self, user=None, **extra):
        self.client.force_authenticate(user or self.doctor_user)
        payload = {
            'appointment': self.visit.id, 'diagnosis': 'Viral fever',
            'medicines': [{'medicine': self.paracetamol.id, 'dosage': '1 tablet', 'frequency': '3 times daily',
                           'duration': '5 days', 'quantity': 15}],
            'tests': [{'test': self.cbc.id, 'instructions': 'Fasting not needed'}],
        }
        payload.update(extra)
        return self.client.post('/api/v1/prescriptions/', payload, format='json')

    def bill(self):
        return Bill.objects.get(appointment=self.visit)


class PrescriptionBillingTests(VisitFixture):
    def test_prescribing_bills_consultation_medicines_and_tests(self):
        response = self.prescribe()
        self.assertEqual(response.status_code, 201)

        bill = self.bill()
        lines = {item.service_type: item for item in bill.items.all()}
        self.assertEqual(lines['consultation'].unit_price, Decimal('800.00'))
        self.assertEqual((lines['medicine'].quantity, lines['medicine'].unit_price), (15, Decimal('1.20')))
        self.assertEqual(lines['lab'].description, 'CBC')
        self.assertEqual(bill.amount, Decimal('800.00') + Decimal('18.00') + Decimal('400.00'))
        self.assertTrue(all(item.generated for item in bill.items.all()))
        self.assertEqual(response.data['bill_id'], bill.id)

    def test_prescription_is_signed_and_tests_are_ordered(self):
        data = self.prescribe().data
        self.assertEqual(data['doctor_qualification'], 'MBBS, FCPS')
        self.assertEqual(data['patient_mrn'], self.patient.medical_record_number)
        self.assertEqual([order['test_name'] for order in data['test_orders']], ['CBC'])
        self.assertEqual(TestOrder.objects.get().ordered_by, self.doctor)

    def test_changes_rebuild_generated_lines_but_keep_hand_added_ones(self):
        prescription_id = self.prescribe().data['id']
        BillItem.objects.create(bill=self.bill(), description='Dressing', service_type='procedure',
                                quantity=1, unit_price=Decimal('150.00'))

        self.client.patch(f'/api/v1/prescriptions/{prescription_id}/', {
            'medicines': [], 'tests': [{'test': self.xray.id}],
        }, format='json')

        bill = self.bill()
        descriptions = sorted(item.description for item in bill.items.all())
        self.assertIn('Dressing', descriptions)
        self.assertIn('Chest X-ray', descriptions)
        self.assertNotIn('CBC', descriptions)
        self.assertFalse(bill.items.filter(service_type='medicine').exists())
        self.assertEqual(bill.amount, Decimal('800.00') + Decimal('150.00') + Decimal('600.00'))

    def test_a_bill_with_payments_is_not_rebuilt(self):
        prescription_id = self.prescribe().data['id']
        bill = self.bill()
        Payment.objects.create(bill=bill, amount=Decimal('100.00'))
        before = bill.amount

        self.client.patch(f'/api/v1/prescriptions/{prescription_id}/', {'tests': []}, format='json')
        self.assertEqual(self.bill().amount, before)

    def test_doctor_reads_and_cannot_change_own_patients_bill(self):
        self.prescribe()
        bill = self.bill()
        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(self.client.get(f'/api/v1/bills/{bill.id}/').status_code, 200)
        self.assertEqual(self.client.patch(f'/api/v1/bills/{bill.id}/', {'discount': '10'},
                                           format='json').status_code, 403)

        self.client.force_authenticate(self.other_doctor_user)
        self.assertEqual(self.client.get(f'/api/v1/bills/{bill.id}/').status_code, 404)


class LineItemBillTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.desk)

    def create(self, lines, **extra):
        return self.client.post('/api/v1/bills/', {'patient': self.patient.id, 'line_items': lines, **extra},
                                format='json')

    def test_bill_total_is_the_sum_of_its_lines(self):
        response = self.create([
            {'description': 'Consultation', 'service_type': 'consultation', 'quantity': 1, 'unit_price': '800'},
            {'description': 'Paracetamol 500 mg', 'service_type': 'medicine', 'quantity': 10,
             'unit_price': '1.20'},
        ], tax='20', discount='12')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Decimal(response.data['amount']), Decimal('812.00'))
        self.assertEqual(Decimal(response.data['total']), Decimal('820.00'))
        self.assertEqual(len(response.data['items']), 2)

    def test_a_bill_needs_lines_or_an_amount(self):
        self.assertEqual(self.create([]).status_code, 400)

    def test_lines_can_be_added_and_removed(self):
        bill_id = self.create([{'description': 'Consultation', 'service_type': 'consultation',
                                'quantity': 1, 'unit_price': '800'}]).data['id']
        added = self.client.post(f'/api/v1/bills/{bill_id}/add-item/', {
            'description': 'ECG', 'service_type': 'lab', 'quantity': 1, 'unit_price': '400'}, format='json')
        self.assertEqual(Decimal(added.data['amount']), Decimal('1200.00'))

        ecg = next(item for item in added.data['items'] if item['description'] == 'ECG')
        removed = self.client.post(f'/api/v1/bills/{bill_id}/remove-item/{ecg["id"]}/')
        self.assertEqual(Decimal(removed.data['amount']), Decimal('800.00'))

    def test_a_line_cannot_be_removed_below_what_was_paid(self):
        bill_id = self.create([
            {'description': 'Consultation', 'service_type': 'consultation', 'quantity': 1, 'unit_price': '800'},
            {'description': 'X-ray', 'service_type': 'lab', 'quantity': 1, 'unit_price': '600'},
        ]).data['id']
        self.client.post(f'/api/v1/bills/{bill_id}/pay/', {'amount': '1000'}, format='json')
        xray = Bill.objects.get(pk=bill_id).items.get(description='X-ray')
        self.assertEqual(self.client.post(f'/api/v1/bills/{bill_id}/remove-item/{xray.id}/').status_code, 400)

    def test_bad_lines_are_refused(self):
        self.assertEqual(self.create([{'description': 'x', 'service_type': 'lab', 'quantity': 0,
                                       'unit_price': '5'}]).status_code, 400)
        self.assertEqual(self.create([{'description': 'x', 'service_type': 'lab', 'quantity': 1,
                                       'unit_price': '-5'}]).status_code, 400)


class TestOrderTests(VisitFixture):
    def order(self, user=None, test=None):
        self.client.force_authenticate(user or self.doctor_user)
        return self.client.post('/api/v1/test-orders/', {'appointment': self.visit.id,
                                                         'test': (test or self.xray).id}, format='json')

    def test_doctor_orders_a_test_and_it_is_billed(self):
        response = self.order()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.bill().items.get(service_type='lab').unit_price, Decimal('600.00'))

    def test_doctor_cannot_order_for_another_doctors_patient(self):
        self.assertEqual(self.order(user=self.other_doctor_user).status_code, 400)

    def test_front_desk_records_the_result(self):
        order_id = self.order().data['id']
        self.client.force_authenticate(self.desk)
        url = f'/api/v1/test-orders/{order_id}/'

        self.assertEqual(self.client.patch(url, {'status': 'completed'}, format='json').status_code, 400)
        response = self.client.patch(url, {'status': 'completed', 'result': 'Lungs clear.',
                                           'result_flag': 'normal'}, format='json')
        self.assertEqual(response.status_code, 200)
        order = TestOrder.objects.get(pk=order_id)
        self.assertEqual((order.status, order.completed_by), ('completed', self.desk))
        self.assertIsNotNone(order.completed_at)

    def test_patient_reads_own_results_and_cannot_edit_them(self):
        order_id = self.order().data['id']
        self.client.force_authenticate(self.patient_user)
        self.assertEqual(len(self.client.get('/api/v1/test-orders/').data['results']), 1)
        self.assertEqual(self.client.patch(f'/api/v1/test-orders/{order_id}/', {'result': 'fake'},
                                           format='json').status_code, 403)

        stranger = make_user('notmytests', User.Role.PATIENT)
        Patient.objects.create(user=stranger, gender='male', address='x', phone='0100000102')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.get('/api/v1/test-orders/').data['results'], [])

    def test_cancelling_removes_it_from_the_bill(self):
        order_id = self.order().data['id']
        self.client.patch(f'/api/v1/test-orders/{order_id}/', {'status': 'cancelled'}, format='json')
        self.assertFalse(self.bill().items.filter(service_type='lab').exists())

    def test_only_result_fields_change(self):
        order_id = self.order().data['id']
        response = self.client.patch(f'/api/v1/test-orders/{order_id}/', {'test': self.cbc.id}, format='json')
        self.assertEqual(response.status_code, 400)


class CatalogueAndClinicTests(APITestCase):
    def test_only_admin_edits_the_test_catalogue(self):
        payload = {'name': 'HbA1c', 'category': 'blood', 'price': '900'}
        self.client.force_authenticate(make_user('catdesk', User.Role.RECEPTIONIST))
        self.assertEqual(self.client.get('/api/v1/lab-tests/').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/lab-tests/', payload, format='json').status_code, 403)

        self.client.force_authenticate(make_user('catadmin', User.Role.ADMIN))
        self.assertEqual(self.client.post('/api/v1/lab-tests/', payload, format='json').status_code, 201)

    @override_settings(HOSPITAL={'name': 'Test Hospital', 'address': 'Somewhere', 'phone': '1', 'email': 'e'})
    def test_clinic_details_are_public(self):
        response = self.client.get('/api/v1/clinic/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Test Hospital')
