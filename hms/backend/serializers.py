from rest_framework import serializers
from .models import (
    Appointment, Bill, BillItem, Department, Doctor, Medicine, Patient,
    Payment, Prescription, PrescriptionMedicine, User,
)
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role']
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """Signup always creates a patient. Staff are added through the Django admin."""

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

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class DoctorSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)

    class Meta:
        model = Doctor
        fields = ['id', 'user', 'user_details', 'department', 'specialization', 'phone', 'experience', 'is_available']

class PatientSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    age = serializers.IntegerField(read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'user', 'user_details', 'medical_record_number', 'date_of_birth', 'age',
            'gender', 'blood_group', 'address', 'phone',
            'emergency_contact_name', 'emergency_contact_phone',
            'allergies', 'chronic_conditions',
        ]
        read_only_fields = ['medical_record_number']

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ['created_at']
        # The model constraint drives DRF to add a unique-together validator whose
        # message is generic and lands on non_field_errors. validate() below reports
        # the clash against the date field instead, which is what the UI needs.
        validators = []

    def validate_appointment_date(self, when):
        if when < timezone.now():
            raise serializers.ValidationError('Appointments cannot be booked in the past.')
        return when

    def validate(self, attrs):
        doctor = attrs.get('doctor') or getattr(self.instance, 'doctor', None)
        when = attrs.get('appointment_date') or getattr(self.instance, 'appointment_date', None)

        if doctor and not doctor.is_available:
            raise serializers.ValidationError({'doctor': 'This doctor is not accepting appointments.'})

        if doctor and when:
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

class MedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicine
        fields = '__all__'

class PrescriptionMedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionMedicine
        fields = ['medicine', 'dosage', 'duration']

class PrescriptionSerializer(serializers.ModelSerializer):
    medicines = PrescriptionMedicineSerializer(many=True, write_only=True)
    prescription_medicines = PrescriptionMedicineSerializer(source='items', many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = ['id', 'appointment', 'diagnosis', 'notes', 'created_at', 'medicines', 'prescription_medicines']
        read_only_fields = ['created_at']

    def validate_appointment(self, appointment):
        user = self.context['request'].user
        if user.role == User.Role.DOCTOR and appointment.doctor.user_id != user.id:
            raise serializers.ValidationError(
                'You can only write prescriptions for your own appointments.'
            )
        return appointment

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


class BillSerializer(serializers.ModelSerializer):
    items = BillItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Bill
        fields = [
            'id', 'patient', 'appointment', 'invoice_number', 'amount', 'tax', 'discount',
            'paid', 'due_date', 'created_at', 'items', 'payments',
            'total', 'amount_paid', 'balance',
        ]
        read_only_fields = ['created_at', 'invoice_number']