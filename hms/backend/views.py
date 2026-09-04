from django.shortcuts import render
from rest_framework import viewsets, generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import get_user_model
from .models import User, Department, Doctor, Patient, Appointment, Prescription, Medicine, PrescriptionMedicine,Bill
from .serializers import BillSerializer, MedicineSerializer, PrescriptionSerializer, RegisterSerializer, UserSerializer, DepartmentSerializer, DoctorSerializer, PatientSerializer, AppointmentSerializer
from .permissions import AdminOrReceptionistWrites, DoctorWrites, AppointmentWrites
from django_filters.rest_framework import DjangoFilterBackend



User = get_user_model()

class RegisterView(generics.CreateAPIView):
    """Public self-registration. Always creates a patient — see RegisterSerializer."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'register'

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, AdminOrReceptionistWrites]

class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    serializer_class = DoctorSerializer
    permission_classes = [IsAuthenticated, AdminOrReceptionistWrites]

class PatientViewSet(viewsets.ModelViewSet):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, AdminOrReceptionistWrites]

class AppointmentViewSet(viewsets.ModelViewSet):
    queryset = Appointment.objects.all()
    serializer_class = AppointmentSerializer
    permission_classes = [IsAuthenticated, AppointmentWrites]

class PrescriptionViewSet(viewsets.ModelViewSet):
    queryset = Prescription.objects.all()
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated, DoctorWrites]

class MedicineViewSet(viewsets.ModelViewSet):
    queryset = Medicine.objects.all()
    serializer_class = MedicineSerializer
    permission_classes = [IsAuthenticated, AdminOrReceptionistWrites]

class BillViewSet(viewsets.ModelViewSet):
    queryset = Bill.objects.all()
    serializer_class = BillSerializer
    permission_classes = [IsAuthenticated, AdminOrReceptionistWrites]

