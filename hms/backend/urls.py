from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenRefreshView,
)

from .admin_api import AdminOverviewView, AdminUserViewSet, AuditLogViewSet
from .views import (
    AppointmentViewSet,
    BillViewSet,
    BloodRequestViewSet,
    CareContactViewSet,
    DashboardView,
    DepartmentViewSet,
    DoctorQueueView,
    DoctorScheduleViewSet,
    DoctorViewSet,
    DocumentShareViewSet,
    DonorViewSet,
    LoginView,
    MedicalDocumentViewSet,
    MedicationDoseViewSet,
    MedicationScheduleViewSet,
    MedicineStockViewSet,
    MedicineViewSet,
    MeView,
    MyQueueView,
    NotificationViewSet,
    PatientViewSet,
    PrescriptionViewSet,
    RegisterView,
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet)
router.register(r'doctors', DoctorViewSet)
router.register(r'doctor-schedules', DoctorScheduleViewSet)
router.register(r'patients', PatientViewSet)
router.register(r'appointments', AppointmentViewSet)
router.register(r'prescriptions', PrescriptionViewSet)
router.register(r'medicines', MedicineViewSet)
router.register(r'medicine-stock', MedicineStockViewSet)
router.register(r'bills', BillViewSet)
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'documents', MedicalDocumentViewSet)
router.register(r'donors', DonorViewSet, basename='donor')
router.register(r'blood-requests', BloodRequestViewSet)
router.register(r'medication-schedules', MedicationScheduleViewSet, basename='medication-schedule')
router.register(r'doses', MedicationDoseViewSet, basename='dose')
router.register(r'care-contacts', CareContactViewSet, basename='care-contact')
router.register(r'document-shares', DocumentShareViewSet, basename='document-share')
router.register(r'admin/users', AdminUserViewSet, basename='admin-user')
router.register(r'admin/audit-logs', AuditLogViewSet, basename='audit-log')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('admin/overview/', AdminOverviewView.as_view(), name='admin-overview'),
    path('queue/me/', MyQueueView.as_view(), name='my-queue'),
    path('queue/doctor/<int:doctor_id>/', DoctorQueueView.as_view(), name='doctor-queue'),

    path('', include(router.urls)),
]
