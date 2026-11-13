from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from .models import (
    COMPATIBLE_DONORS,
    DONATION_COOLDOWN_DAYS,
    Appointment,
    Bill,
    BillItem,
    Doctor,
    Donor,
    MedicationDose,
    MedicationSchedule,
    Medicine,
    MedicineStock,
    Notification,
    Patient,
    Prescription,
    TestOrder,
    User,
)


def available_slots(doctor, day):
    """Slots the doctor works that day, minus anything already booked."""
    schedules = doctor.schedules.filter(weekday=day.weekday())
    if not schedules:
        return []

    taken = set(
        Appointment.objects
        .filter(doctor=doctor, appointment_date__date=day)
        .exclude(status='cancelled')
        .values_list('appointment_date', flat=True)
    )

    step = timedelta(minutes=doctor.slot_duration_minutes or 30)
    slots = []

    for schedule in schedules:
        cursor = timezone.make_aware(datetime.combine(day, schedule.start_time))
        end = timezone.make_aware(datetime.combine(day, schedule.end_time))
        while cursor + step <= end:
            if cursor not in taken and cursor > timezone.now():
                slots.append(cursor)
            cursor += step

    return sorted(slots)


def dashboard_for(user, role):
    today = timezone.now().date()

    if role == User.Role.DOCTOR:
        doctor = getattr(user, 'doctor', None)
        if not doctor:
            return {}
        appointments = Appointment.objects.filter(doctor=doctor)
        return {
            'today_appointments': appointments.filter(appointment_date__date=today).count(),
            'pending_approvals': appointments.filter(status='pending').count(),
            'patients_seen_this_week': appointments.filter(
                status='completed',
                appointment_date__gte=today - timedelta(days=7),
            ).count(),
            'prescriptions_issued': appointments.filter(prescription__isnull=False).count(),
        }

    if role == User.Role.PATIENT:
        patient = getattr(user, 'patient', None)
        if not patient:
            return {}
        upcoming = (
            Appointment.objects
            .filter(patient=patient, appointment_date__gte=timezone.now())
            .exclude(status='cancelled')
            .order_by('appointment_date')
            .first()
        )
        bills = Bill.objects.filter(patient=patient)
        return {
            'next_appointment': upcoming.appointment_date if upcoming else None,
            'active_prescriptions': Appointment.objects.filter(
                patient=patient, prescription__isnull=False).count(),
            'outstanding_balance': sum((b.balance for b in bills.filter(paid=False)), 0),
        }

    if role == User.Role.RECEPTIONIST:
        return {
            'today_queue': Appointment.objects.filter(appointment_date__date=today).count(),
            'unconfirmed': Appointment.objects.filter(status='pending').count(),
            'unpaid_invoices': Bill.objects.filter(paid=False).count(),
        }

    if role == User.Role.PHARMACIST:
        return {
            'medicines': Medicine.objects.filter(is_active=True).count(),
            'low_stock': _low_stock_count(),
            'expiring_soon': MedicineStock.objects.filter(
                expiry_date__lte=today + timedelta(days=30)).count(),
        }

    revenue = Bill.objects.filter(
        created_at__year=today.year, created_at__month=today.month
    ).aggregate(total=Sum('amount'))['total'] or 0

    return {
        'today_appointments': Appointment.objects.filter(appointment_date__date=today).count(),
        'revenue_this_month': revenue,
        'outstanding_invoices': Bill.objects.filter(paid=False).count(),
        'active_doctors': Doctor.objects.filter(is_available=True).count(),
        'total_patients': Patient.objects.count(),
        'low_stock': _low_stock_count(),
        'appointments_by_status': list(
            Appointment.objects.values('status').annotate(count=Count('id')).order_by()
        ),
    }


def _low_stock_count():
    return MedicineStock.objects.filter(quantity__lte=F('reorder_level')).count()


class DispenseError(Exception):
    pass


@transaction.atomic
def dispense_prescription(prescription, actor=None):
    """
    Take stock for every item on a prescription, oldest usable batch first.

    Runs in one transaction and locks the batches it reads, so two pharmacists
    dispensing at once cannot both take the last box.
    """
    if prescription.status == Prescription.Status.DISPENSED:
        raise DispenseError('This prescription has already been dispensed.')

    taken = []

    for item in prescription.items.select_related('medicine'):
        needed = item.quantity
        batches = (
            MedicineStock.objects
            .select_for_update()
            .filter(medicine=item.medicine, quantity__gt=0, expiry_date__gte=date.today())
            .order_by('expiry_date')
        )

        available = sum(batch.quantity for batch in batches)
        if available < needed:
            raise DispenseError(
                f'Only {available} {item.medicine.unit} of {item.medicine.name} in stock, '
                f'{needed} needed.'
            )

        for batch in batches:
            if not needed:
                break
            used = min(batch.quantity, needed)
            batch.quantity -= used
            batch.save(update_fields=['quantity'])
            needed -= used
            taken.append((batch, used))

    prescription.status = Prescription.Status.DISPENSED
    prescription.save(update_fields=['status'])

    notify_low_stock({batch.medicine for batch, _ in taken})
    return taken


def notify_low_stock(medicines):
    staff = User.objects.filter(role__in=[User.Role.PHARMACIST, User.Role.ADMIN])
    if not staff:
        return

    alerts = []
    for medicine in medicines:
        if medicine.quantity_on_hand <= _reorder_level_for(medicine):
            alerts += [
                Notification(
                    recipient=person,
                    message=f'{medicine.name} is low on stock ({medicine.quantity_on_hand} left).',
                )
                for person in staff
            ]

    Notification.objects.bulk_create(alerts)


def _reorder_level_for(medicine):
    levels = [batch.reorder_level for batch in medicine.batches.all()]
    return max(levels) if levels else 0


def recompute_bill(bill):
    """A bill with line items is worth the sum of its lines; paid follows the payments."""
    if bill.items.exists():
        bill.amount = sum((item.line_total for item in bill.items.all()), Decimal('0'))
    bill.paid = bill.total > 0 and bill.amount_paid >= bill.total
    bill.save(update_fields=['amount', 'paid'])
    return bill


@transaction.atomic
def sync_visit_bill(appointment):
    """Keep a visit's bill in step with its consultation, prescription and tests.

    The first prescription or test order for a visit opens its bill. Later changes
    rebuild only the lines generated here, so anything the front desk added by hand
    stays. Once a payment has been taken the bill is left alone and the front desk
    adjusts it, so a receipt already handed over never changes underneath them.
    """
    bill = appointment.bills.order_by('created_at').first()
    if bill is None:
        bill = Bill.objects.create(patient=appointment.patient, appointment=appointment, amount=0)
    elif bill.payments.exists():
        return bill

    bill.items.filter(generated=True).delete()
    lines = []

    doctor = appointment.doctor
    hand_billed_consultation = bill.items.filter(service_type=BillItem.ServiceType.CONSULTATION).exists()
    if doctor.consultation_fee and not hand_billed_consultation:
        lines.append(BillItem(
            bill=bill, generated=True, service_type=BillItem.ServiceType.CONSULTATION,
            description=f'Consultation — {doctor}', quantity=1, unit_price=doctor.consultation_fee))

    prescription = Prescription.objects.filter(appointment=appointment).first()
    if prescription:
        for item in prescription.items.select_related('medicine'):
            medicine = item.medicine
            if medicine.unit_price:
                lines.append(BillItem(
                    bill=bill, generated=True, service_type=BillItem.ServiceType.MEDICINE,
                    description=f'{medicine.name} ({medicine.unit})', quantity=item.quantity,
                    unit_price=medicine.unit_price))

    for order in appointment.test_orders.exclude(status=TestOrder.Status.CANCELLED).select_related('test'):
        lines.append(BillItem(
            bill=bill, generated=True, service_type=BillItem.ServiceType.LAB,
            description=order.test.name, quantity=1, unit_price=order.test.price))

    BillItem.objects.bulk_create(lines)
    return recompute_bill(bill)


def queue_for_doctor(doctor, day=None):
    day = day or timezone.localdate()
    return (
        Appointment.objects
        .filter(doctor=doctor, appointment_date__date=day, checked_in_at__isnull=False)
        .filter(status__in=Appointment.WAITING_STATUSES)
        .select_related('patient__user')
        .order_by('checked_in_at')
    )


def queue_position(appointment):
    if not appointment.checked_in_at:
        return None
    if appointment.status not in Appointment.WAITING_STATUSES:
        return None

    ahead = (
        queue_for_doctor(appointment.doctor, appointment.appointment_date.date())
        .filter(checked_in_at__lt=appointment.checked_in_at)
        .count()
    )
    return ahead + 1


def queue_state(appointment):
    doctor = appointment.doctor
    position = queue_position(appointment)

    if position is None:
        return {
            'position': None,
            'people_ahead': None,
            'estimated_wait_minutes': None,
            'is_next': False,
            'doctor_status': doctor.clinic_status,
            'doctor_status_note': doctor.status_note,
            'status': appointment.status,
        }

    ahead = position - 1
    return {
        'position': position,
        'people_ahead': ahead,
        'estimated_wait_minutes': ahead * doctor.average_consult_minutes,
        'is_next': ahead == 0,
        'doctor_status': doctor.clinic_status,
        'doctor_status_note': doctor.status_note,
        'status': appointment.status,
    }


def refresh_average_consult_time(doctor):
    recent = (
        Appointment.objects
        .filter(doctor=doctor, status='completed',
                started_at__isnull=False, completed_at__isnull=False)
        .order_by('-completed_at')[:20]
    )

    lengths = []
    for appointment in recent:
        minutes = (appointment.completed_at - appointment.started_at).total_seconds() / 60
        if 0 < minutes < 180:
            lengths.append(minutes)

    if lengths:
        doctor.average_consult_minutes = max(5, round(sum(lengths) / len(lengths)))
        doctor.save(update_fields=['average_consult_minutes'])


def matching_donors(blood_request):
    compatible = COMPATIBLE_DONORS[blood_request.blood_group]
    cutoff = date.today() - timedelta(days=DONATION_COOLDOWN_DAYS)

    donors = (
        Donor.objects
        .filter(blood_group__in=compatible, is_available=True)
        .filter(Q(last_donation_date__isnull=True) | Q(last_donation_date__lte=cutoff))
        .exclude(user=blood_request.requested_by)
        .select_related('user')
    )

    same_district = [d for d in donors if d.district == blood_request.district]
    elsewhere = [d for d in donors if d.district != blood_request.district]
    return same_district + elsewhere


def notify_matching_donors(blood_request):
    donors = matching_donors(blood_request)
    if not donors:
        return 0

    message = (
        f'{blood_request.get_urgency_display()}: {blood_request.units} unit(s) of '
        f'{blood_request.blood_group} needed at {blood_request.hospital}, '
        f'{blood_request.district}.'
    )
    Notification.objects.bulk_create([
        Notification(recipient=donor.user, message=message) for donor in donors
    ])
    return len(donors)


MISSED_AFTER_MINUTES = 120


def build_doses(schedule):
    schedule.doses.filter(state=MedicationDose.State.PENDING).delete()

    doses = []
    day = schedule.start_date
    while day <= schedule.end_date:
        for clock in schedule.times:
            hour, minute = (int(part) for part in clock.split(':'))
            due = timezone.make_aware(datetime.combine(day, time(hour, minute)))
            doses.append(MedicationDose(schedule=schedule, due_at=due))
        day += timedelta(days=1)

    MedicationDose.objects.bulk_create(doses, ignore_conflicts=True)
    return len(doses)


def mark_overdue_doses(patient):
    cutoff = timezone.now() - timedelta(minutes=MISSED_AFTER_MINUTES)
    overdue = MedicationDose.objects.filter(
        schedule__patient=patient,
        state=MedicationDose.State.PENDING,
        due_at__lt=cutoff,
    )
    count = overdue.update(state=MedicationDose.State.MISSED)
    if count:
        check_missed_streak(patient)
    return count


def check_missed_streak(patient):
    contact = getattr(patient, 'care_contact', None)
    if not contact or not contact.consent_given:
        return

    since = timezone.now() - timedelta(days=7)
    for schedule in patient.medication_schedules.filter(is_active=True):
        misses = schedule.doses.filter(
            state=MedicationDose.State.MISSED, due_at__gte=since).count()

        if misses < contact.alert_after_misses:
            continue

        message = (
            f'{patient} has missed {misses} doses of {schedule.medicine_name} this week.'
        )
        already_sent = Notification.objects.filter(
            recipient=contact.user, message=message, created_at__gte=since).exists()

        if contact.user and not already_sent:
            Notification.objects.create(recipient=contact.user, message=message)


def schedule_from_prescription(prescription, times_per_day=2):
    default_times = {1: ['09:00'], 2: ['09:00', '21:00'], 3: ['08:00', '14:00', '20:00']}
    times = default_times.get(times_per_day, ['09:00'])
    created = []

    for item in prescription.items.select_related('medicine'):
        days = parse_duration_days(item.duration)
        schedule = MedicationSchedule.objects.create(
            patient=prescription.appointment.patient,
            medicine=item.medicine,
            medicine_name=item.medicine.name,
            dosage=item.dosage,
            instructions=item.instructions,
            times=times,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=days - 1),
            prescription=prescription,
        )
        build_doses(schedule)
        created.append(schedule)

    return created


def parse_duration_days(text):
    digits = ''.join(char for char in str(text) if char.isdigit())
    if not digits:
        return 7
    days = int(digits)
    if 'week' in str(text).lower():
        days *= 7
    if 'month' in str(text).lower():
        days *= 30
    return max(1, min(days, 180))
