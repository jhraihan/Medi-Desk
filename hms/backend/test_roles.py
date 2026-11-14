"""Each role gets the work that is theirs: consultations, history, dashboards, stock, reports."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .models import Appointment, MedicineStock, User
from .test_clinical_billing import VisitFixture
from .tests import make_user


class ConsultationRoleTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.visit.status = 'approved'
        self.visit.save()

    def test_front_desk_checks_in_but_never_runs_the_consultation(self):
        self.client.force_authenticate(self.desk)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/check-in/').status_code, 200)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/start/').status_code, 403)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/complete/').status_code, 403)

    def test_doctor_runs_own_consultation_but_does_not_check_in(self):
        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/check-in/').status_code, 403)

        self.client.force_authenticate(self.desk)
        self.client.post(f'/api/v1/appointments/{self.visit.id}/check-in/')
        self.client.force_authenticate(self.doctor_user)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/start/').status_code, 200)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/complete/').status_code, 200)

    def test_another_doctor_cannot_start_the_visit(self):
        self.client.force_authenticate(self.desk)
        self.client.post(f'/api/v1/appointments/{self.visit.id}/check-in/')
        self.client.force_authenticate(self.other_doctor_user)
        self.assertEqual(self.client.post(f'/api/v1/appointments/{self.visit.id}/start/').status_code, 404)


class PatientHistoryTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.patient.allergies = 'Penicillin'
        self.patient.save()
        self.prescribe()

    def test_treating_doctor_reads_the_full_history(self):
        self.client.force_authenticate(self.doctor_user)
        response = self.client.get(f'/api/v1/patients/{self.patient.id}/history/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['patient']['allergies'], 'Penicillin')
        visit = response.data['visits'][0]
        self.assertEqual(visit['prescription']['diagnosis'], 'Viral fever')
        self.assertEqual(visit['prescription']['medicines'][0]['name'], 'Paracetamol 500 mg')
        self.assertEqual(visit['tests'][0]['name'], 'CBC')

    def test_who_may_read_it(self):
        admin = make_user('histadmin', User.Role.ADMIN)
        cases = [(admin, 200), (self.other_doctor_user, 404), (self.desk, 403), (self.patient_user, 403)]
        for user, expected in cases:
            self.client.force_authenticate(user)
            response = self.client.get(f'/api/v1/patients/{self.patient.id}/history/')
            self.assertEqual(response.status_code, expected, user.username)


class DashboardTests(VisitFixture):
    def dashboard(self, user):
        self.client.force_authenticate(user)
        response = self.client.get('/api/v1/dashboard/')
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_each_role_sees_its_own_numbers(self):
        self.prescribe()
        pharmacist = make_user('dashpharm', User.Role.PHARMACIST)
        admin = make_user('dashadmin', User.Role.ADMIN)

        self.assertEqual(self.dashboard(pharmacist)['to_dispense'], 1)
        self.assertEqual(self.dashboard(self.doctor_user)['waiting_now'], 1)
        self.assertEqual(self.dashboard(self.desk)['tests_awaiting_results'], 1)
        self.assertEqual(self.dashboard(self.patient_user)['medicines_to_collect'], 1)
        self.assertIn('collected_this_month', self.dashboard(admin))

    def test_collections_count_payments_received_today(self):
        self.prescribe()
        bill = self.bill()
        self.client.force_authenticate(self.desk)
        self.client.post(f'/api/v1/bills/{bill.id}/pay/', {'amount': '500', 'method': 'cash'}, format='json')
        self.assertEqual(Decimal(str(self.dashboard(self.desk)['collected_today'])), Decimal('500'))

    def test_cancelled_visits_are_not_counted_as_today(self):
        Appointment.objects.create(patient=self.patient, doctor=self.doctor, appointment_date=timezone.now(),
                                   status='cancelled')
        self.assertEqual(self.dashboard(self.doctor_user)['today_appointments'], 1)


class DispensingStockTests(VisitFixture):
    def test_prescription_shows_usable_stock_per_medicine(self):
        today = timezone.localdate()
        MedicineStock.objects.create(medicine=self.paracetamol, batch_number='A1', quantity=10,
                                     expiry_date=today + timedelta(days=90))
        MedicineStock.objects.create(medicine=self.paracetamol, batch_number='OLD', quantity=50,
                                     expiry_date=today - timedelta(days=1))
        rx = self.prescribe().data
        self.client.force_authenticate(make_user('stockpharm', User.Role.PHARMACIST))
        response = self.client.get(f'/api/v1/prescriptions/{rx["id"]}/')
        self.assertEqual(response.data['prescription_medicines'][0]['in_stock'], 10)


class ReportTests(VisitFixture):
    def setUp(self):
        super().setUp()
        self.admin = make_user('reportadmin', User.Role.ADMIN)
        self.prescribe()
        self.client.force_authenticate(self.desk)
        self.client.post(f'/api/v1/bills/{self.bill().id}/pay/', {'amount': '300', 'method': 'mobile'},
                         format='json')

    def test_admin_report_adds_up(self):
        self.client.force_authenticate(self.admin)
        today = timezone.localdate().isoformat()
        response = self.client.get('/api/v1/admin/reports/', {'from': today, 'to': today})
        self.assertEqual(response.status_code, 200, response.data)
        totals = response.data['totals']
        self.assertEqual(totals['billed'], self.bill().total)
        self.assertEqual(totals['collected'], Decimal('300'))
        self.assertEqual(totals['tests_ordered'], 1)
        services = {row['service_type'] for row in response.data['by_service']}
        self.assertEqual(services, {'consultation', 'medicine', 'lab'})
        self.assertEqual(response.data['by_payment_method'][0]['method'], 'mobile')
        self.assertEqual(response.data['top_medicines'][0]['name'], 'Paracetamol 500 mg')
        self.assertEqual(response.data['by_doctor'][0]['appointments'], 1)

    def test_only_admin_and_sane_periods(self):
        self.client.force_authenticate(self.desk)
        self.assertEqual(self.client.get('/api/v1/admin/reports/').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/v1/admin/reports/', {'from': '2026-05-01', 'to': '2026-04-01'})
                         .status_code, 400)
        self.assertEqual(self.client.get('/api/v1/admin/reports/', {'from': 'yesterday'}).status_code, 400)
        self.assertEqual(self.client.get('/api/v1/admin/reports/', {'from': '2024-01-01', 'to': '2026-01-01'})
                         .status_code, 400)

