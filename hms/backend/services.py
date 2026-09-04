from datetime import datetime, timedelta

from django.db.models import Count, F, Sum
from django.utils import timezone

from .models import Appointment, Bill, Doctor, Medicine, MedicineStock, Patient, User


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
