from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import (
    AppointmentViewSet,
    BillViewSet,
    DashboardView,
    DepartmentViewSet,
    DoctorQueueView,
    DoctorViewSet,
    DocumentShareViewSet,
    MedicalDocumentViewSet,
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
router.register(r'patients', PatientViewSet)
router.register(r'appointments', AppointmentViewSet)
router.register(r'prescriptions', PrescriptionViewSet)
router.register(r'medicines', MedicineViewSet)
router.register(r'bills', BillViewSet)
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'documents', MedicalDocumentViewSet)
router.register(r'document-shares', DocumentShareViewSet, basename='document-share')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='login'),
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('queue/me/', MyQueueView.as_view(), name='my-queue'),
    path('queue/doctor/<int:doctor_id>/', DoctorQueueView.as_view(), name='doctor-queue'),

    path('', include(router.urls)),
]
