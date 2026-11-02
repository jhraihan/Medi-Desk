"""
Admin-only endpoints behind the React admin section: accounts, the audit trail and
a hospital-wide overview. Everything here requires the admin role.

Accounts are deactivated rather than deleted. Deleting a user cascades into their
patient or doctor profile and from there into appointments, prescriptions and bills.
"""

from datetime import timedelta
from decimal import Decimal

import django_filters
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, F, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import (
    Appointment,
    AuditLog,
    Bill,
    BloodRequest,
    Department,
    Doctor,
    Donor,
    Medicine,
    MedicineStock,
    Patient,
    Payment,
    User,
)
from .permissions import IsAdmin
from .security import clear_failures, is_locked_out
from .serializers import AuditLogSerializer


class DoctorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = ['department', 'specialization', 'phone', 'experience', 'consultation_fee', 'qualification']


class PatientProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ['date_of_birth', 'gender', 'blood_group', 'phone', 'address']


class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    doctor_profile = DoctorProfileSerializer(write_only=True, required=False)
    patient_profile = PatientProfileSerializer(write_only=True, required=False)
    is_locked = serializers.SerializerMethodField()
    has_doctor_profile = serializers.SerializerMethodField()
    has_patient_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active',
            'is_superuser', 'is_locked', 'has_doctor_profile', 'has_patient_profile',
            'last_login', 'date_joined', 'password', 'doctor_profile', 'patient_profile',
        ]
        read_only_fields = ['is_superuser', 'last_login', 'date_joined']

    def get_is_locked(self, user) -> bool:
        return is_locked_out(user.username)

    def get_has_doctor_profile(self, user) -> bool:
        return hasattr(user, 'doctor')

    def get_has_patient_profile(self, user) -> bool:
        return hasattr(user, 'patient')

    def validate(self, attrs):
        if self.instance is not None and 'password' in attrs:
            raise ValidationError({'password': 'Use the set-password action to change a password.'})

        if self.instance is None:
            if not attrs.get('password'):
                raise ValidationError({'password': 'Set a starting password for the account.'})
            try:
                validate_password(attrs['password'], User(**{
                    key: attrs.get(key, '') for key in ('username', 'email', 'first_name', 'last_name')}))
            except DjangoValidationError as problem:
                raise ValidationError({'password': list(problem.messages)}) from None

        # A doctor account without a doctor row cannot see a queue or write a
        # prescription, so becoming a doctor needs the profile at the same time.
        becoming_doctor = attrs.get('role') == User.Role.DOCTOR and (
            self.instance is None or not hasattr(self.instance, 'doctor'))
        if becoming_doctor and not attrs.get('doctor_profile'):
            raise ValidationError(
                {'doctor_profile': "Add the doctor's specialization, phone and experience."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        doctor_profile = validated_data.pop('doctor_profile', None)
        patient_profile = validated_data.pop('patient_profile', None)
        password = validated_data.pop('password')

        user = User(**validated_data)
        user.set_password(password)
        user.save()
        self._attach_profiles(user, doctor_profile, patient_profile)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        doctor_profile = validated_data.pop('doctor_profile', None)
        patient_profile = validated_data.pop('patient_profile', None)
        user = super().update(instance, validated_data)
        self._attach_profiles(user, doctor_profile, patient_profile)
        return user

    def _attach_profiles(self, user, doctor_profile, patient_profile):
        if doctor_profile and user.role == User.Role.DOCTOR and not hasattr(user, 'doctor'):
            Doctor.objects.create(user=user, **doctor_profile)
        if patient_profile and user.role == User.Role.PATIENT and not hasattr(user, 'patient'):
            Patient.objects.create(user=user, **patient_profile)


def revoke_sessions(user):
    """Blacklist every refresh token the user holds, signing them out everywhere.

    Access tokens are short-lived and JWTAuthentication already refuses inactive
    users, so the refresh tokens are what keeps an old session alive.
    """
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class AdminUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                       mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = User.objects.select_related('doctor', 'patient').order_by('username')
    serializer_class = AdminUserSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filterset_fields = ['role', 'is_active', 'is_superuser']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['username', 'date_joined', 'last_login', 'role']

    def _guard(self, target):
        actor = self.request.user
        if target.is_superuser and not actor.is_superuser:
            raise PermissionDenied('Only a superuser can change a superuser account.')

    def perform_update(self, serializer):
        target = serializer.instance
        self._guard(target)

        data = serializer.validated_data
        if target.pk == self.request.user.pk:
            if data.get('role', target.role) != target.role or data.get('is_active') is False:
                raise ValidationError('You cannot change your own role or deactivate your own account.')

        was_active = target.is_active
        user = serializer.save()
        if was_active and not user.is_active:
            revoke_sessions(user)

    @extend_schema(request=None, responses=AdminUserSerializer)
    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        user = self.get_object()
        self._guard(user)

        password = request.data.get('password') or ''
        try:
            validate_password(password, user)
        except DjangoValidationError as problem:
            raise ValidationError({'password': list(problem.messages)}) from None

        user.set_password(password)
        user.save(update_fields=['password'])
        clear_failures(user.username)
        revoke_sessions(user)
        return Response(self.get_serializer(user).data)

    @extend_schema(request=None, responses=AdminUserSerializer)
    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        user = self.get_object()
        clear_failures(user.username)
        return Response(self.get_serializer(user).data)


class AuditLogFilter(django_filters.FilterSet):
    since = django_filters.DateFilter(field_name='created_at', lookup_expr='date__gte')
    until = django_filters.DateFilter(field_name='created_at', lookup_expr='date__lte')

    class Meta:
        model = AuditLog
        fields = ['action', 'target_model', 'target_id', 'actor', 'actor_role']


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('actor')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    filterset_class = AuditLogFilter
    search_fields = ['actor__username', 'target_id']
    ordering_fields = ['created_at']

    @extend_schema(responses=dict)
    @action(detail=False, methods=['get'])
    def models(self, request):
        names = AuditLog.objects.order_by().values_list('target_model', flat=True).distinct()
        return Response(sorted(names))


class AdminOverviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(responses=dict)
    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)

        roles = dict(User.objects.order_by().values_list('role').annotate(count=Count('id')))
        unpaid = Bill.objects.filter(paid=False).prefetch_related('payments')
        revenue = Payment.objects.filter(
            received_at__date__gte=month_start).aggregate(total=Sum('amount'))['total']

        return Response({
            'users': {
                'total': User.objects.count(),
                'inactive': User.objects.filter(is_active=False).count(),
                'by_role': {role: roles.get(role, 0) for role in User.Role.values},
            },
            'clinic': {
                'departments': Department.objects.count(),
                'doctors': Doctor.objects.count(),
                'doctors_available': Doctor.objects.filter(is_available=True).count(),
                'patients': Patient.objects.count(),
            },
            'appointments': {
                'today': Appointment.objects.filter(appointment_date__date=today).count(),
                'pending': Appointment.objects.filter(status='pending').count(),
                'by_status': list(
                    Appointment.objects.order_by().values('status').annotate(count=Count('id'))),
            },
            'billing': {
                'collected_this_month': revenue or Decimal('0'),
                'unpaid_bills': len(unpaid),
                'outstanding': sum((bill.balance for bill in unpaid), Decimal('0')),
            },
            'pharmacy': {
                'active_medicines': Medicine.objects.filter(is_active=True).count(),
                'low_stock_batches': MedicineStock.objects.filter(quantity__lte=F('reorder_level')).count(),
                'expired_batches': MedicineStock.objects.filter(expiry_date__lt=today, quantity__gt=0).count(),
                'expiring_in_30_days': MedicineStock.objects.filter(
                    expiry_date__gte=today, expiry_date__lte=today + timedelta(days=30)).count(),
            },
            'blood': {
                'donors': Donor.objects.count(),
                'open_requests': BloodRequest.objects.filter(status=BloodRequest.Status.OPEN).count(),
            },
            'recent_activity': AuditLogSerializer(
                AuditLog.objects.select_related('actor')[:8], many=True).data,
            'django_admin_url': request.build_absolute_uri(f'/{settings.ADMIN_URL}'),
        })
