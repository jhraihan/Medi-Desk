from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

PHONE_VALIDATOR = RegexValidator(
    r'^\+?[0-9 \-()]{7,20}$',
    'Enter a valid phone number.',
)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        DOCTOR = 'doctor', 'Doctor'
        PATIENT = 'patient', 'Patient'
        RECEPTIONIST = 'receptionist', 'Receptionist'
        PHARMACIST = 'pharmacist', 'Pharmacist'

    ROLE_CHOICES = Role.choices

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.PATIENT,
    )

    def __str__(self):
        full_name = self.get_full_name()
        label = full_name or self.username
        return f'{label} ({self.get_role_display()})'

class Department(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

class Doctor(models.Model):
    class ClinicStatus(models.TextChoices):
        IN_CLINIC = 'in_clinic', 'In clinic'
        ON_BREAK = 'on_break', 'On a break'
        RUNNING_LATE = 'running_late', 'Running late'
        UNAVAILABLE = 'unavailable', 'Unavailable today'

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='doctor')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, related_name='doctors')
    specialization = models.CharField(max_length=255)
    license_number = models.CharField(max_length=50, unique=True, null=True, blank=True)
    qualification = models.CharField(max_length=255, blank=True)
    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    slot_duration_minutes = models.PositiveIntegerField(default=30)
    phone = models.CharField(max_length=20, validators=[PHONE_VALIDATOR])
    experience = models.PositiveIntegerField()
    is_available = models.BooleanField(default=True)
    clinic_status = models.CharField(
        max_length=20, choices=ClinicStatus.choices, default=ClinicStatus.IN_CLINIC)
    status_note = models.CharField(max_length=120, blank=True)
    average_consult_minutes = models.PositiveIntegerField(default=15)

    class Meta:
        ordering = ['user__first_name', 'user__username']

    def __str__(self):
        return f'Dr. {self.user.get_full_name() or self.user.username}'

class Patient(models.Model):
    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'
        OTHER = 'other', 'Other'

    class BloodGroup(models.TextChoices):
        A_POS = 'A+', 'A+'
        A_NEG = 'A-', 'A-'
        B_POS = 'B+', 'B+'
        B_NEG = 'B-', 'B-'
        AB_POS = 'AB+', 'AB+'
        AB_NEG = 'AB-', 'AB-'
        O_POS = 'O+', 'O+'
        O_NEG = 'O-', 'O-'

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='patient')
    medical_record_number = models.CharField(max_length=20, unique=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    blood_group = models.CharField(max_length=5, choices=BloodGroup.choices, blank=True)
    address = models.TextField()
    phone = models.CharField(max_length=20, validators=[PHONE_VALIDATOR])
    emergency_contact_name = models.CharField(max_length=255, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True, validators=[PHONE_VALIDATOR])
    allergies = models.TextField(blank=True)
    chronic_conditions = models.TextField(blank=True)

    class Meta:
        ordering = ['user__first_name', 'user__username']

    def __str__(self):
        return self.user.get_full_name() or self.user.username

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        today = date.today()
        had_birthday = (today.month, today.day) >= (self.date_of_birth.month, self.date_of_birth.day)
        return today.year - self.date_of_birth.year - (0 if had_birthday else 1)

    def save(self, *args, **kwargs):
        if not self.medical_record_number:
            self.medical_record_number = f'MRN{uuid4().hex[:8].upper()}'
        super().save(*args, **kwargs)

class Appointment(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('checked_in', 'Checked in'),
        ('in_consultation', 'In consultation'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    WAITING_STATUSES = ['approved', 'checked_in', 'in_consultation']
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='appointments')
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='appointments')
    appointment_date = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    reason = models.CharField(max_length=255, blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    cancelled_reason = models.CharField(max_length=255, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    consultation_type = models.CharField(
        max_length=20,
        choices=[('in_person', 'In person'), ('online', 'Online')],
        default='in_person')
    meeting_link = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-appointment_date']
        constraints = [
            models.UniqueConstraint(
                fields=['doctor', 'appointment_date'],
                condition=~models.Q(status='cancelled'),
                name='no_double_booking',
            ),
        ]

    def __str__(self):
        return f'{self.patient} with {self.doctor} on {self.appointment_date:%d %b %Y %H:%M}'

class Prescription(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ISSUED = 'issued', 'Issued'
        DISPENSED = 'dispensed', 'Dispensed'

    appointment = models.OneToOneField(Appointment, on_delete=models.CASCADE, related_name='prescription')
    prescribed_by = models.ForeignKey(
        Doctor, on_delete=models.SET_NULL, null=True, blank=True, related_name='prescriptions')
    diagnosis = models.TextField()
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ISSUED)
    follow_up_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Prescription for {self.appointment.patient}'

class Medicine(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    generic_name = models.CharField(max_length=255, blank=True)
    manufacturer = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=50)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    requires_prescription = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def quantity_on_hand(self):
        return sum(batch.quantity for batch in self.batches.all())


class MedicineStock(models.Model):
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='batches')
    batch_number = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=10)
    expiry_date = models.DateField()
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ['expiry_date']
        unique_together = [('medicine', 'batch_number')]

    def __str__(self):
        return f'{self.medicine} batch {self.batch_number}'

    @property
    def is_expired(self):
        return self.expiry_date < date.today()

    @property
    def needs_reorder(self):
        return self.quantity <= self.reorder_level

class PrescriptionMedicine(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='items')
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='prescribed_in')
    dosage = models.CharField(max_length=100)
    duration = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100, blank=True)
    instructions = models.CharField(max_length=255, blank=True)
    quantity = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f'{self.medicine} ({self.dosage})'

class Bill(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='bills')
    appointment = models.ForeignKey(
        Appointment, on_delete=models.SET_NULL, null=True, blank=True, related_name='bills')
    invoice_number = models.CharField(max_length=20, unique=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    paid = models.BooleanField(default=False)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.invoice_number or f"Bill #{self.pk}"} for {self.patient}'

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = f'INV{uuid4().hex[:8].upper()}'
        super().save(*args, **kwargs)

    @property
    def total(self):
        return self.amount + self.tax - self.discount

    @property
    def amount_paid(self):
        return sum((p.amount for p in self.payments.all()), Decimal('0'))

    @property
    def balance(self):
        return self.total - self.amount_paid


class BillItem(models.Model):
    class ServiceType(models.TextChoices):
        CONSULTATION = 'consultation', 'Consultation'
        PROCEDURE = 'procedure', 'Procedure'
        MEDICINE = 'medicine', 'Medicine'
        LAB = 'lab', 'Lab'
        ROOM = 'room', 'Room'

    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name='items')
    description = models.CharField(max_length=255)
    service_type = models.CharField(
        max_length=20, choices=ServiceType.choices, default=ServiceType.CONSULTATION)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f'{self.description} x{self.quantity}'

    @property
    def line_total(self):
        return self.unit_price * self.quantity


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = 'cash', 'Cash'
        CARD = 'card', 'Card'
        INSURANCE = 'insurance', 'Insurance'
        TRANSFER = 'transfer', 'Transfer'

    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=100, blank=True)
    received_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='payments_taken')
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f'{self.amount} via {self.get_method_display()}'

class DoctorSchedule(models.Model):
    class Weekday(models.IntegerChoices):
        MONDAY = 0, 'Monday'
        TUESDAY = 1, 'Tuesday'
        WEDNESDAY = 2, 'Wednesday'
        THURSDAY = 3, 'Thursday'
        FRIDAY = 4, 'Friday'
        SATURDAY = 5, 'Saturday'
        SUNDAY = 6, 'Sunday'

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='schedules')
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['weekday', 'start_time']
        unique_together = [('doctor', 'weekday', 'start_time')]

    def __str__(self):
        return f'{self.doctor} {self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class AuditLog(models.Model):
    """Append-only record of who touched patient data. Rows are never edited or deleted."""

    class Action(models.TextChoices):
        CREATE = 'create', 'Create'
        UPDATE = 'update', 'Update'
        DELETE = 'delete', 'Delete'
        READ = 'read', 'Read'

    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_entries')
    actor_role = models.CharField(max_length=20, blank=True)
    action = models.CharField(max_length=10, choices=Action.choices)
    target_model = models.CharField(max_length=50)
    target_id = models.CharField(max_length=50)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.actor_role or "system"} {self.action} {self.target_model}#{self.target_id}'

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError('Audit entries cannot be modified.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Audit entries cannot be deleted.')


class Notification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    message = models.CharField(max_length=500)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'To {self.recipient}: {self.message[:40]}'


def document_path(instance, filename):
    suffix = Path(filename).suffix.lower()
    return f'documents/{instance.patient_id}/{uuid4().hex}{suffix}'


class MedicalDocument(models.Model):
    class Kind(models.TextChoices):
        PRESCRIPTION = 'prescription', 'Prescription'
        LAB_REPORT = 'lab_report', 'Lab report'
        SCAN = 'scan', 'Scan or imaging'
        DISCHARGE = 'discharge', 'Discharge summary'
        OTHER = 'other', 'Other'

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='documents')
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='uploaded_documents')
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.OTHER)
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to=document_path)
    document_date = models.DateField()
    issued_by = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-document_date', '-created_at']

    def __str__(self):
        return f'{self.title} ({self.get_kind_display()})'


class DocumentShare(models.Model):
    document = models.ForeignKey(MedicalDocument, on_delete=models.CASCADE, related_name='shares')
    shared_with = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shared_documents')
    shared_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='shares_created')
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.document} shared with {self.shared_with}'

    @property
    def is_active(self):
        return self.revoked_at is None and self.expires_at > timezone.now()


class DocumentAccessLog(models.Model):
    document = models.ForeignKey(MedicalDocument, on_delete=models.CASCADE, related_name='access_log')
    viewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='documents_viewed')
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-viewed_at']

    def __str__(self):
        return f'{self.viewed_by} viewed {self.document}'

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError('Access log entries cannot be modified.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('Access log entries cannot be deleted.')
