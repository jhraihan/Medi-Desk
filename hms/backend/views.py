from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Appointment, Bill, Department, Doctor, Medicine, Patient, Prescription
from .permissions import (
    AppointmentAccess,
    BillAccess,
    DepartmentAccess,
    DoctorAccess,
    MedicineAccess,
    PatientAccess,
    PrescriptionAccess,
    role_of,
)
from .serializers import (
    AppointmentSerializer,
    BillSerializer,
    DepartmentSerializer,
    DoctorSerializer,
    MedicineSerializer,
    PatientSerializer,
    PrescriptionSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'register'


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = UserSerializer(user).data
        data['role'] = role_of(user)
        data['doctor_id'] = getattr(getattr(user, 'doctor', None), 'id', None)
        data['patient_id'] = getattr(getattr(user, 'patient', None), 'id', None)
        return Response(data)


class ScopedViewSet(viewsets.ModelViewSet):
    """
    Rows are narrowed per role in scope_queryset, so a patient never sees anyone
    else's records. Anything outside the scope 404s rather than 403s, since a 403
    would confirm the row exists.
    """

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]

    def scope_queryset(self, queryset, user, role):
        return queryset

    def get_queryset(self):
        user = self.request.user
        role = role_of(user)
        queryset = super().get_queryset()
        if role == User.Role.ADMIN:
            return queryset
        return self.scope_queryset(queryset, user, role)


class DepartmentViewSet(ScopedViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, DepartmentAccess]
    search_fields = ['name']
    ordering_fields = ['name']


class DoctorViewSet(ScopedViewSet):
    queryset = Doctor.objects.select_related('user', 'department')
    serializer_class = DoctorSerializer
    permission_classes = [IsAuthenticated, DoctorAccess]
    filterset_fields = ['department', 'is_available', 'specialization']
    search_fields = ['user__first_name', 'user__last_name', 'specialization']
    ordering_fields = ['experience', 'user__first_name']


class PatientViewSet(ScopedViewSet):
    queryset = Patient.objects.select_related('user')
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, PatientAccess]
    filterset_fields = ['gender', 'blood_group']
    search_fields = ['user__first_name', 'user__last_name', 'phone']
    ordering_fields = ['user__first_name']

    def scope_queryset(self, queryset, user, role):
        if role == User.Role.PATIENT:
            return queryset.filter(user=user)
        if role == User.Role.DOCTOR:
            return queryset.filter(appointments__doctor__user=user).distinct()
        return queryset


class AppointmentViewSet(ScopedViewSet):
    queryset = Appointment.objects.select_related('patient__user', 'doctor__user')
    serializer_class = AppointmentSerializer
    permission_classes = [IsAuthenticated, AppointmentAccess]
    filterset_fields = ['doctor', 'patient', 'status']
    ordering_fields = ['appointment_date', 'created_at']

    def scope_queryset(self, queryset, user, role):
        if role == User.Role.PATIENT:
            return queryset.filter(patient__user=user)
        if role == User.Role.DOCTOR:
            return queryset.filter(doctor__user=user)
        return queryset


class PrescriptionViewSet(ScopedViewSet):
    queryset = Prescription.objects.select_related(
        'appointment__patient__user', 'appointment__doctor__user'
    ).prefetch_related('items__medicine')
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated, PrescriptionAccess]
    filterset_fields = ['appointment']
    ordering_fields = ['created_at']

    def scope_queryset(self, queryset, user, role):
        if role == User.Role.PATIENT:
            return queryset.filter(appointment__patient__user=user)
        if role == User.Role.DOCTOR:
            return queryset.filter(appointment__doctor__user=user)
        return queryset


class MedicineViewSet(ScopedViewSet):
    queryset = Medicine.objects.all()
    serializer_class = MedicineSerializer
    permission_classes = [IsAuthenticated, MedicineAccess]
    search_fields = ['name', 'description']
    ordering_fields = ['name']


class BillViewSet(ScopedViewSet):
    queryset = Bill.objects.select_related('patient__user')
    serializer_class = BillSerializer
    permission_classes = [IsAuthenticated, BillAccess]
    filterset_fields = ['patient', 'paid']
    ordering_fields = ['created_at', 'amount']

    def scope_queryset(self, queryset, user, role):
        if role == User.Role.PATIENT:
            return queryset.filter(patient__user=user)
        return queryset
