from datetime import date, datetime, timedelta

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
    Medicine,
    MedicineStock,
    Notification,
    Patient,
    Prescription,
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


def bill_for_appointment(appointment, actor=None):
    """Draft a bill seeded with the doctor's consultation fee."""
    bill = Bill.objects.create(
        patient=appointment.patient,
        appointment=appointment,
        amount=appointment.doctor.consultation_fee,
    )
    BillItem.objects.create(
        bill=bill,
        description=f'Consultation with {appointment.doctor}',
        service_type=BillItem.ServiceType.CONSULTATION,
        quantity=1,
        unit_price=appointment.doctor.consultation_fee,
    )
    return bill


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
