import secrets
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    Appointment,
    AuditLog,
    Bill,
    BillItem,
    BloodRequest,
    CareContact,
    Department,
    Doctor,
    DoctorSchedule,
    DocumentAccessLog,
    DocumentShare,
    DonationRecord,
    Donor,
    DonorResponse,
    MedicalDocument,
    MedicationDose,
    MedicationSchedule,
    Medicine,
    MedicineStock,
    Notification,
    Patient,
    Payment,
    Prescription,
    PrescriptionMedicine,
    User,
)
from .permissions import role_of
from .security import is_locked_out, lockout_message


class LoginSerializer(TokenObtainPairSerializer):
    """Says why a locked account is refused instead of the generic bad-password reply."""

    def validate(self, attrs):
        if is_locked_out(attrs.get(self.username_field)):
            raise AuthenticationFailed(lockout_message(), code='locked_out')
        return super().validate(attrs)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role']
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """Signup always creates a patient. Staff are added through the admin panels."""

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name']
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': True},
        }

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=User.Role.PATIENT,
        )


def unique_username(first_name, last_name=''):
    base = slugify(f'{first_name} {last_name}')[:30] or 'patient'
    candidate = base
    while User.objects.filter(username=candidate).exists():
        candidate = f'{base}-{secrets.randbelow(9000) + 1000}'
    return candidate


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class DoctorSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)

    class Meta:
        model = Doctor
        fields = [
            'id', 'user', 'user_details', 'department', 'specialization', 'phone',
            'experience', 'is_available', 'clinic_status', 'status_note',
            'consultation_fee', 'qualification', 'average_consult_minutes',
        ]
        read_only_fields = ['average_consult_minutes']

    def validate_user(self, user):
        if self.instance is not None and user != self.instance.user:
            raise serializers.ValidationError('A doctor profile cannot be moved to another account.')
        if user.role != User.Role.DOCTOR:
            raise serializers.ValidationError('Pick an account that has the doctor role.')
        return user

class PatientSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    age = serializers.IntegerField(read_only=True)

    # The front desk registering a walk-in creates the sign-in account from these.
    # A patient filling in their own profile reuses the account they signed up with.
    first_name = serializers.CharField(write_only=True, required=False, max_length=150)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=150)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)

    ACCOUNT_FIELDS = ('first_name', 'last_name', 'email')

    class Meta:
        model = Patient
        fields = [
            'id', 'user', 'user_details', 'medical_record_number', 'date_of_birth', 'age',
            'gender', 'blood_group', 'address', 'phone',
            'emergency_contact_name', 'emergency_contact_phone',
            'allergies', 'chronic_conditions',
            'first_name', 'last_name', 'email',
        ]
        # Writable, this let a patient attach a profile to someone else's account.
        read_only_fields = ['medical_record_number', 'user']

    def _pop_account(self, validated_data):
        return {name: validated_data.pop(name) for name in self.ACCOUNT_FIELDS if name in validated_data}

    @transaction.atomic
    def create(self, validated_data):
        account = self._pop_account(validated_data)
        if 'user' not in validated_data:
            if not account.get('first_name'):
                raise serializers.ValidationError({'first_name': "Enter the patient's first name."})
            validated_data['user'] = User.objects.create_user(
                username=unique_username(account['first_name'], account.get('last_name', '')),
                password=None,
                role=User.Role.PATIENT,
                **account,
            )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        account = self._pop_account(validated_data)
        if account:
            for name, value in account.items():
                setattr(instance.user, name, value)
            instance.user.save(update_fields=list(account))
        return super().update(instance, validated_data)

class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    doctor_name = serializers.CharField(source='doctor.__str__', read_only=True)
    has_prescription = serializers.SerializerMethodField()

    # Status changes a booking accepts directly, keyed by the new status, listing the
    # statuses it may come from. Checked-in, in-consultation and completed carry
    # timestamps, so they only come from the check-in, start and complete actions.
    DESK_TRANSITIONS = {
        'pending': {'approved'},
        'approved': {'pending'},
        'cancelled': {'pending', 'approved', 'checked_in'},
    }
    PATIENT_EDITABLE = {'status', 'reason', 'cancelled_reason'}

    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ['created_at', 'checked_in_at', 'started_at', 'completed_at']
        # validate() fills the patient in for a patient booking for themselves.
        extra_kwargs = {'patient': {'required': False}}
        # The model constraint drives DRF to add a unique-together validator whose
        # message is generic and lands on non_field_errors. validate() below reports
        # the clash against the date field instead, which is what the UI needs.
        validators = []

    def get_has_prescription(self, obj) -> bool:
        # The view selects the prescription alongside, so this costs no extra query.
        return hasattr(obj, 'prescription')

    def validate_appointment_date(self, when):
        if when < timezone.now():
            raise serializers.ValidationError('Appointments cannot be booked in the past.')
        return when

    def validate(self, attrs):
        user = self.context['request'].user
        role = role_of(user)

        if role == User.Role.PATIENT:
            self._limit_to_own_patient(attrs, user)
        elif role == User.Role.DOCTOR:
            self._limit_to_own_doctor(attrs, user)

        if self.instance is None and not attrs.get('patient'):
            raise serializers.ValidationError({'patient': 'This field is required.'})

        self._check_status(attrs)

        doctor = attrs.get('doctor') or getattr(self.instance, 'doctor', None)
        when = attrs.get('appointment_date') or getattr(self.instance, 'appointment_date', None)
        rebooking = self.instance is None or {'doctor', 'appointment_date'} & attrs.keys()

        # Only a new or moved booking needs a free, available doctor. Checking on every
        # edit meant nobody could cancel a visit with a doctor who had since gone away.
        if rebooking and doctor and not doctor.is_available:
            raise serializers.ValidationError({'doctor': 'This doctor is not accepting appointments.'})

        if rebooking and doctor and when:
            clash = Appointment.objects.filter(
                doctor=doctor, appointment_date=when
            ).exclude(status='cancelled')
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {'appointment_date': 'That slot is already booked for this doctor.'}
                )

        return attrs

    def _limit_to_own_patient(self, attrs, user):
        own = getattr(user, 'patient', None)
        if own is None:
            raise serializers.ValidationError('Complete your patient profile before booking.')

        if self.instance is None:
            if attrs.get('patient', own) != own:
                raise serializers.ValidationError(
                    {'patient': 'You can only book appointments for yourself.'})
            attrs['patient'] = own
            # Approval and the meeting link stay with the clinic.
            attrs['status'] = 'pending'
            attrs.pop('meeting_link', None)
            return

        blocked = sorted(set(attrs) - self.PATIENT_EDITABLE)
        if blocked:
            raise serializers.ValidationError(
                {field: 'Patients can only cancel a booking or update its reason.' for field in blocked})
        if attrs.get('status', 'cancelled') != 'cancelled':
            raise serializers.ValidationError({'status': 'Patients can only cancel a booking.'})

    def _limit_to_own_doctor(self, attrs, user):
        own = getattr(user, 'doctor', None)
        doctor = attrs.get('doctor') or getattr(self.instance, 'doctor', None)
        if own is None or doctor != own:
            raise serializers.ValidationError({'doctor': 'You can only manage your own appointments.'})
        if self.instance is not None and attrs.get('patient', self.instance.patient) != self.instance.patient:
            raise serializers.ValidationError(
                {'patient': 'Cancel this booking and make a new one for another patient.'})

    def _check_status(self, attrs):
        new = attrs.get('status')
        if new is None:
            return

        if self.instance is None:
            if new not in ('pending', 'approved'):
                raise serializers.ValidationError({'status': 'A new booking starts as pending or approved.'})
            return

        current = self.instance.status
        if new == current:
            return
        allowed_from = self.DESK_TRANSITIONS.get(new)
        if allowed_from is None:
            raise serializers.ValidationError(
                {'status': 'Use check-in, start and complete to move a visit along.'})
        if current not in allowed_from:
            raise serializers.ValidationError(
                {'status': f'A {self.instance.get_status_display().lower()} appointment cannot be set to {new}.'})

class MedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicine
        fields = '__all__'

    def validate_unit_price(self, price):
        if price < 0:
            raise serializers.ValidationError('The price cannot be negative.')
        return price


class MedicineStockSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    needs_reorder = serializers.BooleanField(read_only=True)

    class Meta:
        model = MedicineStock
        fields = [
            'id', 'medicine', 'medicine_name', 'batch_number', 'quantity', 'reorder_level',
            'expiry_date', 'purchase_price', 'is_expired', 'needs_reorder',
        ]

    def validate_purchase_price(self, price):
        if price < 0:
            raise serializers.ValidationError('The price cannot be negative.')
        return price


class DoctorScheduleSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.__str__', read_only=True)
    weekday_display = serializers.CharField(source='get_weekday_display', read_only=True)

    class Meta:
        model = DoctorSchedule
        fields = ['id', 'doctor', 'doctor_name', 'weekday', 'weekday_display', 'start_time', 'end_time']
        # The overlap check in validate() covers the unique-together rule with a clearer message.
        validators = []

    def validate(self, attrs):
        def current(name):
            return attrs.get(name, getattr(self.instance, name, None))

        doctor, weekday = current('doctor'), current('weekday')
        start, end = current('start_time'), current('end_time')

        if start and end and end <= start:
            raise serializers.ValidationError({'end_time': 'The session must end after it starts.'})

        overlapping = DoctorSchedule.objects.filter(
            doctor=doctor, weekday=weekday, start_time__lt=end, end_time__gt=start)
        if self.instance:
            overlapping = overlapping.exclude(pk=self.instance.pk)
        if overlapping.exists():
            raise serializers.ValidationError(
                {'start_time': 'This overlaps another session for the same doctor that day.'})
        return attrs

class PrescriptionMedicineSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)

    class Meta:
        model = PrescriptionMedicine
        fields = ['medicine', 'medicine_name', 'dosage', 'duration', 'frequency', 'instructions', 'quantity']

class PrescriptionSerializer(serializers.ModelSerializer):
    medicines = PrescriptionMedicineSerializer(many=True, write_only=True)
    prescription_medicines = PrescriptionMedicineSerializer(source='items', many=True, read_only=True)
    patient_name = serializers.CharField(source='appointment.patient.__str__', read_only=True)
    doctor_name = serializers.CharField(source='appointment.doctor.__str__', read_only=True)
    appointment_date = serializers.DateTimeField(source='appointment.appointment_date', read_only=True)

    class Meta:
        model = Prescription
        fields = [
            'id', 'appointment', 'patient_name', 'doctor_name', 'appointment_date',
            'diagnosis', 'notes', 'status', 'follow_up_date', 'created_at',
            'medicines', 'prescription_medicines',
        ]
        read_only_fields = ['created_at']

    def validate_appointment(self, appointment):
        user = self.context['request'].user
        if user.role == User.Role.DOCTOR and appointment.doctor.user_id != user.id:
            raise serializers.ValidationError(
                'You can only write prescriptions for your own appointments.'
            )
        return appointment

    def validate_status(self, status):
        if status == Prescription.Status.DISPENSED:
            raise serializers.ValidationError(
                'The pharmacy marks a prescription dispensed when it issues the stock.')
        return status

    def validate(self, attrs):
        if self.instance and self.instance.status == Prescription.Status.DISPENSED:
            raise serializers.ValidationError('A dispensed prescription can no longer be changed.')
        return attrs

    def create(self, validated_data):
        medicines_data = validated_data.pop('medicines')
        prescription = Prescription.objects.create(**validated_data)
        self._write_items(prescription, medicines_data)
        return prescription

    def update(self, instance, validated_data):
        medicines_data = validated_data.pop('medicines', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if medicines_data is not None:
            instance.items.all().delete()
            self._write_items(instance, medicines_data)
        return instance

    def _write_items(self, prescription, medicines_data):
        PrescriptionMedicine.objects.bulk_create([
            PrescriptionMedicine(prescription=prescription, **item)
            for item in medicines_data
        ])

class BillItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = BillItem
        fields = ['id', 'description', 'service_type', 'quantity', 'unit_price', 'line_total']


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'bill', 'amount', 'method', 'reference', 'received_at']
        read_only_fields = ['received_at']

    def validate_amount(self, amount):
        if amount <= 0:
            raise serializers.ValidationError('Enter an amount above zero.')
        return amount

    def validate(self, attrs):
        balance = attrs['bill'].balance
        if attrs['amount'] > balance:
            raise serializers.ValidationError(
                {'amount': f'That is more than the {balance} outstanding on this bill.'})
        return attrs


class BillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    items = BillItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Bill
        fields = [
            'id', 'patient', 'patient_name', 'appointment', 'invoice_number', 'amount', 'tax', 'discount',
            'paid', 'due_date', 'created_at', 'items', 'payments',
            'total', 'amount_paid', 'balance',
        ]
        # paid follows the payments recorded against the bill, so it is never set by hand.
        read_only_fields = ['created_at', 'invoice_number', 'paid']

    def validate(self, attrs):
        def current(name):
            return attrs.get(name, getattr(self.instance, name, Decimal('0')))

        amount, tax, discount = current('amount'), current('tax'), current('discount')
        for name, value in (('amount', amount), ('tax', tax), ('discount', discount)):
            if value < 0:
                raise serializers.ValidationError({name: 'This cannot be negative.'})
        if discount > amount + tax:
            raise serializers.ValidationError({'discount': 'The discount is larger than the bill.'})
        return attrs

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'message', 'is_read', 'created_at']
        read_only_fields = ['message', 'created_at']


SIGNATURES = {
    b'%PDF': 'application/pdf',
    b'\xff\xd8\xff': 'image/jpeg',
    b'\x89PNG\r\n\x1a\n': 'image/png',
}


def sniff_type(uploaded):
    uploaded.seek(0)
    head = uploaded.read(8)
    uploaded.seek(0)
    for signature, content_type in SIGNATURES.items():
        if head.startswith(signature):
            return content_type
    return None


class MedicalDocumentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.__str__', read_only=True)
    file_url = serializers.FileField(source='file', read_only=True)

    class Meta:
        model = MedicalDocument
        fields = [
            'id', 'patient', 'patient_name', 'kind', 'title', 'file', 'file_url',
            'document_date', 'issued_by', 'notes', 'created_at',
        ]
        read_only_fields = ['created_at', 'patient']
        extra_kwargs = {'file': {'write_only': True}}

    def validate_file(self, uploaded):
        if uploaded.size > settings.MAX_UPLOAD_BYTES:
            limit = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
            raise serializers.ValidationError(f'Files must be {limit} MB or smaller.')

        content_type = sniff_type(uploaded)
        if content_type not in settings.ALLOWED_UPLOAD_TYPES:
            raise serializers.ValidationError('Upload a PDF, JPG or PNG file.')

        suffix = Path(uploaded.name).suffix.lower()
        if suffix not in settings.ALLOWED_UPLOAD_TYPES[content_type]:
            raise serializers.ValidationError('The file extension does not match its contents.')

        return uploaded

    def validate_document_date(self, when):
        if when > date.today():
            raise serializers.ValidationError('A document cannot be dated in the future.')
        return when


class DocumentShareSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source='document.title', read_only=True)
    shared_with_name = serializers.CharField(source='shared_with.get_full_name', read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = DocumentShare
        fields = [
            'id', 'document', 'document_title', 'shared_with', 'shared_with_name',
            'expires_at', 'revoked_at', 'is_active', 'created_at',
        ]
        read_only_fields = ['created_at', 'revoked_at']

    def validate_shared_with(self, user):
        if user.role != User.Role.DOCTOR:
            raise serializers.ValidationError('Records can only be shared with a doctor.')
        return user

    def validate_expires_at(self, when):
        if when <= timezone.now():
            raise serializers.ValidationError('The expiry must be in the future.')
        return when


class DocumentAccessLogSerializer(serializers.ModelSerializer):
    viewed_by_name = serializers.CharField(source='viewed_by.get_full_name', read_only=True)

    class Meta:
        model = DocumentAccessLog
        fields = ['id', 'document', 'viewed_by', 'viewed_by_name', 'viewed_at']


class DonorSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.get_full_name', read_only=True)
    can_donate = serializers.BooleanField(read_only=True)
    available_from = serializers.DateField(read_only=True)

    class Meta:
        model = Donor
        fields = [
            'id', 'blood_group', 'district', 'area', 'phone', 'is_available',
            'last_donation_date', 'can_donate', 'available_from', 'name', 'created_at',
        ]
        read_only_fields = ['created_at', 'last_donation_date']


class PublicDonorSerializer(serializers.ModelSerializer):
    """Deliberately omits phone and full name. Contact details are revealed only
    after a donor accepts a specific request."""

    first_name = serializers.CharField(source='user.first_name', read_only=True)

    class Meta:
        model = Donor
        fields = ['id', 'first_name', 'blood_group', 'district', 'area']


class BloodRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    accepted_count = serializers.IntegerField(read_only=True)
    is_mine = serializers.SerializerMethodField()
    my_reply = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = [
            'id', 'blood_group', 'units', 'hospital', 'district', 'needed_by',
            'urgency', 'note', 'status', 'created_at',
            'requested_by', 'requested_by_name', 'accepted_count', 'is_mine', 'my_reply',
        ]
        read_only_fields = ['created_at', 'requested_by', 'status']

    def get_is_mine(self, obj) -> bool:
        request = self.context.get('request')
        return bool(request and obj.requested_by_id == request.user.id)

    def get_my_reply(self, obj) -> str | None:
        request = self.context.get('request')
        donor = getattr(getattr(request, 'user', None), 'donor', None)
        if not donor:
            return None
        response = obj.responses.filter(donor=donor).first()
        return response.reply if response else None

    def validate_needed_by(self, when):
        if when < timezone.now():
            raise serializers.ValidationError('The needed-by time is already past.')
        return when

    def validate_units(self, units):
        if units > 10:
            raise serializers.ValidationError('Request 10 units or fewer.')
        return units


class DonorResponseSerializer(serializers.ModelSerializer):
    donor_name = serializers.CharField(source='donor.user.get_full_name', read_only=True)
    donor_phone = serializers.SerializerMethodField()
    blood_group = serializers.CharField(source='donor.blood_group', read_only=True)

    class Meta:
        model = DonorResponse
        fields = ['id', 'request', 'donor', 'donor_name', 'donor_phone',
                  'blood_group', 'reply', 'responded_at']
        read_only_fields = ['responded_at', 'donor']

    def get_donor_phone(self, obj) -> str | None:
        if obj.reply != DonorResponse.Reply.YES:
            return None
        request = self.context.get('request')
        viewer = getattr(request, 'user', None)
        if not viewer:
            return None
        if viewer == obj.request.requested_by or viewer == obj.donor.user:
            return obj.donor.phone
        return None


class DonationRecordSerializer(serializers.ModelSerializer):
    donor_name = serializers.CharField(source='donor.user.get_full_name', read_only=True)

    class Meta:
        model = DonationRecord
        fields = ['id', 'donor', 'donor_name', 'request', 'donated_on', 'hospital', 'units']


class MedicationDoseSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source='schedule.medicine_name', read_only=True)
    dosage = serializers.CharField(source='schedule.dosage', read_only=True)
    instructions = serializers.CharField(source='schedule.instructions', read_only=True)

    class Meta:
        model = MedicationDose
        fields = ['id', 'schedule', 'medicine_name', 'dosage', 'instructions',
                  'due_at', 'state', 'confirmed_at']
        read_only_fields = ['confirmed_at', 'schedule']


# Every day of a schedule becomes one row per dose time, built in a single request.
# Without a cap, a ten-year schedule at six doses a day was 21,918 rows per POST.
MAX_SCHEDULE_DAYS = 366


class MedicationScheduleSerializer(serializers.ModelSerializer):
    adherence = serializers.IntegerField(read_only=True)
    dose_count = serializers.SerializerMethodField()

    class Meta:
        model = MedicationSchedule
        fields = ['id', 'medicine', 'medicine_name', 'dosage', 'instructions', 'times',
                  'start_date', 'end_date', 'is_active', 'prescription',
                  'adherence', 'dose_count', 'created_at']
        read_only_fields = ['created_at', 'prescription']

    def get_dose_count(self, obj) -> int:
        return obj.doses.count()

    def validate_times(self, times):
        if not times:
            raise serializers.ValidationError('Add at least one time of day.')
        if len(times) > 6:
            raise serializers.ValidationError('Six times a day is the maximum.')
        for clock in times:
            try:
                hour, minute = (int(part) for part in str(clock).split(':'))
            except ValueError:
                raise serializers.ValidationError('Use HH:MM for each time.') from None
            if not (0 <= hour < 24 and 0 <= minute < 60):
                raise serializers.ValidationError(f'{clock} is not a valid time.')
        return times

    def validate(self, attrs):
        times = attrs.get('times', getattr(self.instance, 'times', None))
        if not times:
            raise serializers.ValidationError({'times': 'Add at least one time of day.'})

        start = attrs.get('start_date') or getattr(self.instance, 'start_date', None)
        end = attrs.get('end_date') or getattr(self.instance, 'end_date', None)
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'The end date is before the start date.'})
        if start and end and (end - start).days >= MAX_SCHEDULE_DAYS:
            raise serializers.ValidationError(
                {'end_date': f'A schedule can cover at most {MAX_SCHEDULE_DAYS} days.'})
        return attrs


class CareContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CareContact
        fields = ['id', 'name', 'phone', 'relationship', 'user',
                  'alert_after_misses', 'consent_given']
        # Linking the contact's own account sends them alerts about this patient.
        # Left writable, a patient could aim those alerts at any user, so an admin
        # links the account after confirming who the contact is.
        read_only_fields = ['user']


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True, allow_null=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'created_at', 'actor', 'actor_username', 'actor_role', 'action',
            'target_model', 'target_id', 'changes', 'ip_address',
        ]
        read_only_fields = fields
