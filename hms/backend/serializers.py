from rest_framework import serializers
from .models import User, Department, Doctor, Patient, Appointment, Prescription, Medicine, PrescriptionMedicine, Bill
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

    class Meta:
        model = Patient
        fields = ['id', 'user', 'user_details', 'age', 'gender', 'blood_group', 'address', 'phone']

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ['created_at']

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
    
    prescription_medicines = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Prescription
        fields = ['id', 'appointment', 'diagnosis', 'notes', 'created_at', 'medicines', 'prescription_medicines']
        read_only_fields = ['created_at']

    def get_prescription_medicines(self, obj):
        medicines = PrescriptionMedicine.objects.filter(prescription=obj)
        return PrescriptionMedicineSerializer(medicines, many=True).data

    def create(self, validated_data):
        medicines_data = validated_data.pop('medicines')
        
        prescription = Prescription.objects.create(**validated_data)
        
        for medicine_data in medicines_data:
            PrescriptionMedicine.objects.create(prescription=prescription, **medicine_data)
            
        return prescription

class BillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bill
        fields = '__all__'
        read_only_fields = ['created_at']