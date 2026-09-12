from datetime import date, timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import generics, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    COMPATIBLE_DONORS,
    Appointment,
    Bill,
    BloodRequest,
    CareContact,
    Department,
    Doctor,
    DocumentAccessLog,
    DocumentShare,
    Donor,
    DonorResponse,
    MedicalDocument,
    MedicationDose,
    MedicationSchedule,
    Medicine,
    Notification,
    Patient,
    Prescription,
)
from .permissions import (
    AppointmentAccess,
    BillAccess,
    CanDispense,
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
    BloodRequestSerializer,
    CareContactSerializer,
    DepartmentSerializer,
    DoctorSerializer,
    DocumentAccessLogSerializer,
    DocumentShareSerializer,
    DonorResponseSerializer,
    DonorSerializer,
    MedicalDocumentSerializer,
    MedicationDoseSerializer,
    MedicationScheduleSerializer,
    MedicineSerializer,
    NotificationSerializer,
    PatientSerializer,
    PaymentSerializer,
    PrescriptionSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .services import (
    DispenseError,
    available_slots,
    build_doses,
    dashboard_for,
    dispense_prescription,
    mark_overdue_doses,
    notify_matching_donors,
    queue_for_doctor,
    queue_state,
    refresh_average_consult_time,
    schedule_from_prescription,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'register'


@extend_schema(responses=UserSerializer)
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

    @extend_schema(request=None, responses=DoctorSerializer)
    @action(detail=True, methods=['patch'])
    def availability(self, request, pk=None):
        doctor = self.get_object()
        status_value = request.data.get('clinic_status')

        if status_value not in Doctor.ClinicStatus.values:
            return Response({'detail': 'Unknown clinic status.'}, status=400)

        doctor.clinic_status = status_value
        doctor.status_note = request.data.get('status_note', '')
        doctor.save(update_fields=['clinic_status', 'status_note'])
        return Response(DoctorSerializer(doctor).data)

    @extend_schema(responses=dict)
    @action(detail=True, methods=['get'], url_path='available-slots')
    def available_slots(self, request, pk=None):
        raw_date = request.query_params.get('date')
        if not raw_date:
            return Response({'detail': 'A date query parameter is required.'}, status=400)
        try:
            day = date.fromisoformat(raw_date)
        except ValueError:
            return Response({'detail': 'Use YYYY-MM-DD for the date.'}, status=400)

        slots = available_slots(self.get_object(), day)
        return Response({'date': raw_date, 'slots': slots})


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

    @extend_schema(request=None, responses=AppointmentSerializer)
    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        appointment = self.get_object()

        if appointment.status not in ['pending', 'approved']:
            return Response({'detail': 'This appointment cannot be checked in.'}, status=400)
        if appointment.appointment_date.date() != timezone.localdate():
            return Response({'detail': 'You can only check in on the day of your appointment.'},
                            status=400)

        appointment.checked_in_at = timezone.now()
        appointment.status = 'checked_in'
        appointment.save(update_fields=['checked_in_at', 'status'])
        return Response(AppointmentSerializer(appointment).data)

    @extend_schema(request=None, responses=AppointmentSerializer)
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        appointment = self.get_object()

        if appointment.status != 'checked_in':
            return Response({'detail': 'Only a checked-in patient can be seen.'}, status=400)

        appointment.started_at = timezone.now()
        appointment.status = 'in_consultation'
        appointment.save(update_fields=['started_at', 'status'])
        return Response(AppointmentSerializer(appointment).data)

    @extend_schema(request=None, responses=AppointmentSerializer)
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        appointment = self.get_object()

        if appointment.status not in ['checked_in', 'in_consultation']:
            return Response({'detail': 'This appointment is not in progress.'}, status=400)

        appointment.completed_at = timezone.now()
        appointment.status = 'completed'
        appointment.save(update_fields=['completed_at', 'status'])
        refresh_average_consult_time(appointment.doctor)
        return Response(AppointmentSerializer(appointment).data)


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

    @extend_schema(request=None, responses=dict)
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, CanDispense])
    def dispense(self, request, pk=None):
        try:
            taken = dispense_prescription(self.get_object(), actor=request.user)
        except DispenseError as problem:
            return Response({'detail': str(problem)}, status=400)

        return Response({
            'status': 'dispensed',
            'batches': [
                {'medicine': batch.medicine.name, 'batch': batch.batch_number, 'quantity': used}
                for batch, used in taken
            ],
        })


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

    @extend_schema(request=PaymentSerializer, responses=BillSerializer)
    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        bill = self.get_object()
        serializer = PaymentSerializer(data={**request.data, 'bill': bill.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save(received_by=request.user)

        bill.refresh_from_db()
        if bill.balance <= 0:
            bill.paid = True
            bill.save(update_fields=['paid'])

        return Response(BillSerializer(bill).data)

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    @action(detail=True, methods=['get'])
    def invoice(self, request, pk=None):
        bill = self.get_object()
        html = render_to_string('billing/invoice.html', {'bill': bill})
        response = HttpResponse(html, content_type='text/html')
        response['Content-Disposition'] = f'inline; filename="{bill.invoice_number}.html"'
        return response


class NotificationViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin,
                          viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    queryset = Notification.objects.none()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Notification.objects.none()
        return Notification.objects.filter(recipient=self.request.user)

    @extend_schema(request=None, responses=dict)
    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'marked_read': updated})


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=dict)
    def get(self, request):
        role = role_of(request.user)
        return Response({'role': role, **dashboard_for(request.user, role)})


class MyQueueView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=dict)
    def get(self, request):
        patient = getattr(request.user, 'patient', None)
        if not patient:
            return Response({'detail': 'Only patients have a queue position.'}, status=400)

        appointment = (
            Appointment.objects
            .filter(patient=patient, appointment_date__date=timezone.localdate())
            .filter(status__in=Appointment.WAITING_STATUSES + ['pending'])
            .select_related('doctor__user')
            .order_by('appointment_date')
            .first()
        )

        if not appointment:
            return Response({'appointment': None})

        return Response({
            'appointment': AppointmentSerializer(appointment).data,
            'doctor_name': str(appointment.doctor),
            **queue_state(appointment),
        })


class DoctorQueueView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=dict)
    def get(self, request, doctor_id):
        role = role_of(request.user)
        doctor = Doctor.objects.filter(pk=doctor_id).select_related('user').first()

        if not doctor:
            return Response({'detail': 'Not found.'}, status=404)
        if role == User.Role.DOCTOR and doctor.user_id != request.user.id:
            return Response({'detail': 'Not found.'}, status=404)
        if role == User.Role.PATIENT:
            return Response({'detail': 'Not found.'}, status=404)

        waiting = queue_for_doctor(doctor)
        return Response({
            'doctor': str(doctor),
            'clinic_status': doctor.clinic_status,
            'status_note': doctor.status_note,
            'average_consult_minutes': doctor.average_consult_minutes,
            'waiting': [
                {
                    'position': index + 1,
                    'appointment_id': appointment.id,
                    'patient_name': str(appointment.patient),
                    'patient_id': appointment.patient_id,
                    'reason': appointment.reason,
                    'status': appointment.status,
                    'checked_in_at': appointment.checked_in_at,
                }
                for index, appointment in enumerate(waiting)
            ],
        })


class MedicalDocumentViewSet(ScopedViewSet):
    queryset = MedicalDocument.objects.select_related('patient__user')
    serializer_class = MedicalDocumentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['kind', 'patient']
    search_fields = ['title', 'issued_by']
    ordering_fields = ['document_date', 'created_at']

    def scope_queryset(self, queryset, user, role):
        if role == User.Role.PATIENT:
            return queryset.filter(patient__user=user)
        if role == User.Role.DOCTOR:
            return queryset.filter(
                shares__shared_with=user,
                shares__revoked_at__isnull=True,
                shares__expires_at__gt=timezone.now(),
            ).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        patient = getattr(self.request.user, 'patient', None)
        if not patient:
            raise ValidationError('Only a patient can upload to their own records.')
        serializer.save(patient=patient, uploaded_by=self.request.user)

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        document = self.get_object()
        DocumentAccessLog.objects.create(document=document, viewed_by=request.user)
        return FileResponse(document.file.open('rb'), as_attachment=True,
                            filename=Path(document.file.name).name)

    @extend_schema(request=DocumentShareSerializer, responses=DocumentShareSerializer)
    @action(detail=True, methods=['post'])
    def share(self, request, pk=None):
        document = self.get_object()

        if getattr(request.user, 'patient', None) != document.patient:
            return Response({'detail': 'Only the owner can share this record.'}, status=403)

        serializer = DocumentShareSerializer(data={**request.data, 'document': document.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save(shared_by=request.user)
        return Response(serializer.data, status=201)

    @extend_schema(responses=DocumentAccessLogSerializer(many=True))
    @action(detail=True, methods=['get'], url_path='access-log')
    def access_log(self, request, pk=None):
        document = self.get_object()

        if getattr(request.user, 'patient', None) != document.patient:
            return Response({'detail': 'Only the owner can see this.'}, status=403)

        entries = document.access_log.select_related('viewed_by')[:50]
        return Response(DocumentAccessLogSerializer(entries, many=True).data)


class DocumentShareViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin,
                           viewsets.GenericViewSet):
    serializer_class = DocumentShareSerializer
    permission_classes = [IsAuthenticated]
    queryset = DocumentShare.objects.none()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return DocumentShare.objects.none()
        return (
            DocumentShare.objects
            .filter(document__patient__user=self.request.user)
            .select_related('document', 'shared_with')
        )

    def perform_destroy(self, instance):
        instance.revoked_at = timezone.now()
        instance.save(update_fields=['revoked_at'])

    @extend_schema(responses=MedicalDocumentSerializer(many=True))
    @action(detail=False, methods=['get'], url_path='shared-with-me')
    def shared_with_me(self, request):
        documents = (
            MedicalDocument.objects
            .filter(
                shares__shared_with=request.user,
                shares__revoked_at__isnull=True,
                shares__expires_at__gt=timezone.now(),
            )
            .select_related('patient__user')
            .distinct()
        )
        return Response(MedicalDocumentSerializer(documents, many=True).data)


class DonorViewSet(viewsets.ModelViewSet):
    serializer_class = DonorSerializer
    permission_classes = [IsAuthenticated]
    queryset = Donor.objects.none()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Donor.objects.none()
        if role_of(self.request.user) == User.Role.ADMIN:
            return Donor.objects.select_related('user')
        return Donor.objects.filter(user=self.request.user).select_related('user')

    def perform_create(self, serializer):
        if Donor.objects.filter(user=self.request.user).exists():
            raise ValidationError('You already have a donor profile.')
        serializer.save(user=self.request.user)

    @extend_schema(responses=DonorSerializer)
    @action(detail=False, methods=['get'])
    def me(self, request):
        donor = getattr(request.user, 'donor', None)
        if not donor:
            return Response({'donor': None})
        return Response(DonorSerializer(donor).data)


class BloodRequestViewSet(viewsets.ModelViewSet):
    serializer_class = BloodRequestSerializer
    permission_classes = [IsAuthenticated]
    queryset = BloodRequest.objects.select_related('requested_by')
    filterset_fields = ['blood_group', 'district', 'urgency', 'status']
    ordering_fields = ['created_at', 'needed_by']
    throttle_scope = 'blood_request'

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return BloodRequest.objects.none()

        queryset = super().get_queryset()
        donor = getattr(self.request.user, 'donor', None)

        if role_of(self.request.user) == User.Role.ADMIN:
            return queryset

        mine = Q(requested_by=self.request.user)
        if donor:
            compatible = [
                group for group, sources in COMPATIBLE_DONORS.items()
                if donor.blood_group in sources
            ]
            return queryset.filter(mine | Q(status='open', blood_group__in=compatible))
        return queryset.filter(mine)

    def get_throttles(self):
        if self.action == 'create':
            return super().get_throttles()
        return []

    def perform_create(self, serializer):
        blood_request = serializer.save(requested_by=self.request.user)
        notify_matching_donors(blood_request)

    @extend_schema(request=None, responses=BloodRequestSerializer)
    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        blood_request = self.get_object()
        donor = getattr(request.user, 'donor', None)

        if not donor:
            return Response({'detail': 'Register as a donor first.'}, status=400)
        if blood_request.requested_by_id == request.user.id:
            return Response({'detail': 'You cannot respond to your own request.'}, status=400)
        if blood_request.status != BloodRequest.Status.OPEN:
            return Response({'detail': 'This request is closed.'}, status=400)

        reply = request.data.get('reply')
        if reply not in DonorResponse.Reply.values:
            return Response({'detail': 'Reply must be yes or no.'}, status=400)

        if reply == DonorResponse.Reply.YES:
            if donor.blood_group not in COMPATIBLE_DONORS[blood_request.blood_group]:
                return Response(
                    {'detail': 'Your blood group is not compatible with this request.'}, status=400)
            if not donor.can_donate:
                return Response(
                    {'detail': f'You can donate again from {donor.available_from}.'}, status=400)

        DonorResponse.objects.update_or_create(
            request=blood_request, donor=donor, defaults={'reply': reply})
        return Response(
            BloodRequestSerializer(blood_request, context={'request': request}).data)

    @extend_schema(responses=DonorResponseSerializer(many=True))
    @action(detail=True, methods=['get'])
    def responders(self, request, pk=None):
        blood_request = self.get_object()

        if blood_request.requested_by_id != request.user.id and role_of(request.user) != User.Role.ADMIN:
            return Response({'detail': 'Only the requester can see this.'}, status=403)

        responses = (
            blood_request.responses
            .filter(reply=DonorResponse.Reply.YES)
            .select_related('donor__user')
        )
        return Response(
            DonorResponseSerializer(responses, many=True, context={'request': request}).data)

    @extend_schema(request=None, responses=BloodRequestSerializer)
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        blood_request = self.get_object()

        if blood_request.requested_by_id != request.user.id and role_of(request.user) != User.Role.ADMIN:
            return Response({'detail': 'Only the requester can close this.'}, status=403)

        blood_request.status = request.data.get('status', BloodRequest.Status.FULFILLED)
        if blood_request.status not in BloodRequest.Status.values:
            return Response({'detail': 'Unknown status.'}, status=400)
        blood_request.save(update_fields=['status'])
        return Response(
            BloodRequestSerializer(blood_request, context={'request': request}).data)


class MedicationScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationScheduleSerializer
    permission_classes = [IsAuthenticated]
    queryset = MedicationSchedule.objects.none()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MedicationSchedule.objects.none()
        return (
            MedicationSchedule.objects
            .filter(patient__user=self.request.user)
            .prefetch_related('doses')
        )

    def perform_create(self, serializer):
        patient = getattr(self.request.user, 'patient', None)
        if not patient:
            raise ValidationError('Only a patient can keep a medicine schedule.')
        schedule = serializer.save(patient=patient)
        build_doses(schedule)

    def perform_update(self, serializer):
        schedule = serializer.save()
        build_doses(schedule)

    @extend_schema(request=None, responses=MedicationScheduleSerializer(many=True))
    @action(detail=False, methods=['post'], url_path='from-prescription')
    def from_prescription(self, request):
        patient = getattr(request.user, 'patient', None)
        if not patient:
            return Response({'detail': 'Only a patient can do this.'}, status=400)

        prescription = Prescription.objects.filter(
            pk=request.data.get('prescription'), appointment__patient=patient).first()
        if not prescription:
            return Response({'detail': 'Prescription not found.'}, status=404)
        if prescription.schedules.exists():
            return Response({'detail': 'Reminders already exist for this prescription.'}, status=400)

        created = schedule_from_prescription(
            prescription, int(request.data.get('times_per_day', 2)))
        return Response(MedicationScheduleSerializer(created, many=True).data, status=201)


class MedicationDoseViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = MedicationDoseSerializer
    permission_classes = [IsAuthenticated]
    queryset = MedicationDose.objects.none()
    filterset_fields = ['state', 'schedule']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MedicationDose.objects.none()
        return (
            MedicationDose.objects
            .filter(schedule__patient__user=self.request.user)
            .select_related('schedule')
        )

    def list(self, request, *args, **kwargs):
        patient = getattr(request.user, 'patient', None)
        if patient:
            mark_overdue_doses(patient)
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=dict)
    @action(detail=False, methods=['get'])
    def today(self, request):
        patient = getattr(request.user, 'patient', None)
        if not patient:
            return Response({'doses': [], 'adherence': None})

        mark_overdue_doses(patient)
        today = timezone.localdate()
        doses = self.get_queryset().filter(due_at__date=today)

        overall = self.get_queryset().exclude(state=MedicationDose.State.PENDING)
        total = overall.count()
        taken = overall.filter(state=MedicationDose.State.TAKEN).count()

        return Response({
            'doses': MedicationDoseSerializer(doses, many=True).data,
            'adherence': round(taken / total * 100) if total else None,
            'taken': taken,
            'total': total,
        })

    @extend_schema(request=None, responses=MedicationDoseSerializer)
    @action(detail=True, methods=['post'])
    def taken(self, request, pk=None):
        return self._set_state(request, pk, MedicationDose.State.TAKEN)

    @extend_schema(request=None, responses=MedicationDoseSerializer)
    @action(detail=True, methods=['post'])
    def skipped(self, request, pk=None):
        return self._set_state(request, pk, MedicationDose.State.SKIPPED)

    def _set_state(self, request, pk, state):
        dose = self.get_object()
        if dose.due_at > timezone.now() + timedelta(hours=1):
            return Response({'detail': 'That dose is not due yet.'}, status=400)

        dose.state = state
        dose.confirmed_at = timezone.now()
        dose.save(update_fields=['state', 'confirmed_at'])
        return Response(MedicationDoseSerializer(dose).data)


class CareContactViewSet(viewsets.ModelViewSet):
    serializer_class = CareContactSerializer
    permission_classes = [IsAuthenticated]
    queryset = CareContact.objects.none()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return CareContact.objects.none()
        return CareContact.objects.filter(patient__user=self.request.user)

    def perform_create(self, serializer):
        patient = getattr(self.request.user, 'patient', None)
        if not patient:
            raise ValidationError('Only a patient can add a care contact.')
        if hasattr(patient, 'care_contact'):
            raise ValidationError('You already have a care contact.')
        serializer.save(patient=patient)
