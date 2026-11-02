import csv

from django.conf import settings
from django.contrib import admin, messages
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.core.exceptions import ValidationError
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone

from .admin_api import revoke_sessions
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
from .security import clear_failures, is_locked_out, lockout_message
from .services import build_doses

admin.site.site_header = 'MediDesk administration'
admin.site.site_title = 'MediDesk'
admin.site.index_title = 'Hospital operations'
admin.site.site_url = settings.FRONTEND_URL


class LockoutAdminAuthenticationForm(AdminAuthenticationForm):
    """Tells a locked-out admin why, instead of repeating 'wrong password'."""

    def clean(self):
        if is_locked_out(self.cleaned_data.get('username')):
            raise ValidationError(lockout_message(), code='locked_out')
        return super().clean()


admin.site.login_form = LockoutAdminAuthenticationForm


# Spreadsheet apps run a cell that starts with one of these as a formula.
FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _csv_cell(value):
    text = '' if value is None else str(value)
    return f"'{text}" if text.startswith(FORMULA_PREFIXES) else text


class HospitalPermissions:
    """Gives users with the admin role full rights without per-model permission rows.

    is_staff follows the role (see User.save), so every hospital admin reaches the
    admin site and sees every hospital model. Superusers keep Django's own checks.
    """

    def _is_hospital_admin(self, request):
        return request.user.is_active and role_of(request.user) == User.Role.ADMIN

    def has_module_permission(self, request):
        return self._is_hospital_admin(request) or super().has_module_permission(request)

    def has_view_permission(self, request, obj=None):
        return self._is_hospital_admin(request) or super().has_view_permission(request, obj)

    def has_add_permission(self, request, *args):
        return self._is_hospital_admin(request) or super().has_add_permission(request, *args)

    def has_change_permission(self, request, obj=None):
        return self._is_hospital_admin(request) or super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return self._is_hospital_admin(request) or super().has_delete_permission(request, obj)


class HospitalAdmin(HospitalPermissions, admin.ModelAdmin):
    list_per_page = 50
    actions = ['export_csv']

    @admin.action(description='Export selected rows to CSV')
    def export_csv(self, request, queryset):
        fields = [field for field in self.model._meta.concrete_fields]
        response = HttpResponse(content_type='text/csv')
        stamp = timezone.now().strftime('%Y%m%d-%H%M')
        response['Content-Disposition'] = f'attachment; filename="{self.model._meta.model_name}-{stamp}.csv"'

        writer = csv.writer(response)
        writer.writerow([field.verbose_name for field in fields])
        rows = list(queryset)
        for row in rows:
            writer.writerow([_csv_cell(getattr(row, field.attname)) for field in fields])

        # An export copies records out of the system, so it is logged like a read.
        AuditLog.objects.bulk_create([
            AuditLog(actor=request.user, actor_role=role_of(request.user), action=AuditLog.Action.READ,
                     target_model=self.model.__name__, target_id=str(row.pk), changes={'export': 'csv'})
            for row in rows
        ])
        return response


class ReadOnlyAdmin(HospitalAdmin):
    """For append-only logs: browsable and exportable, never edited."""

    show_full_result_count = False

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request, *args):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class HospitalTabularInline(HospitalPermissions, admin.TabularInline):
    extra = 0


class HospitalStackedInline(HospitalPermissions, admin.StackedInline):
    extra = 0


# ---------------------------------------------------------------- accounts

# Autocomplete boxes for profile links offer only accounts with the matching role.
AUTOCOMPLETE_ROLES = {
    ('doctor', 'user'): User.Role.DOCTOR,
    ('patient', 'user'): User.Role.PATIENT,
}


@admin.register(User)
class UserAdmin(HospitalPermissions, DjangoUserAdmin):
    """Subclasses the auth UserAdmin so passwords stay hashed."""

    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_active',
                    'is_superuser', 'last_login')
    list_filter = ('role', 'is_active', 'is_superuser')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('username',)
    actions = ['activate', 'deactivate', 'unlock', 'export_csv']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'email')}),
        ('Hospital role', {
            'fields': ('role', 'is_active'),
            'description': 'Admins can sign in here. Every other role uses the MediDesk app.',
        }),
        ('Superuser', {'fields': ('is_superuser', 'is_staff', 'groups', 'user_permissions'),
                       'classes': ('collapse',)}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    # Keeps Django's own password fields (they differ between versions) after ours.
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'first_name', 'last_name', 'role', *(
                name for name in DjangoUserAdmin.add_fieldsets[0][1]['fields'] if name != 'username')),
        }),
    )

    def get_readonly_fields(self, request, obj=None):
        # is_staff is derived from the role, so editing it here would be overwritten on save.
        fields = ['is_staff', 'last_login', 'date_joined']
        if not request.user.is_superuser:
            # Otherwise anyone who can edit users can make themselves a superuser.
            fields += ['is_superuser', 'groups', 'user_permissions']
        return fields

    def has_change_permission(self, request, obj=None):
        if obj is not None and obj.is_superuser and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        # Deleting an account cascades into its medical and billing history, so only a
        # superuser may, and never their own. Everyone else deactivates instead.
        if not request.user.is_superuser or (obj is not None and obj.pk == request.user.pk):
            return False
        return super().has_delete_permission(request, obj)

    def get_search_results(self, request, queryset, search_term):
        queryset, distinct = super().get_search_results(request, queryset, search_term)
        role = AUTOCOMPLETE_ROLES.get((request.GET.get('model_name'), request.GET.get('field_name')))
        if role:
            queryset = queryset.filter(role=role)
        return queryset, distinct

    def _editable(self, request, queryset):
        if not request.user.is_superuser:
            queryset = queryset.filter(is_superuser=False)
        return queryset.exclude(pk=request.user.pk)

    @admin.action(description='Activate selected accounts')
    def activate(self, request, queryset):
        count = self._editable(request, queryset).update(is_active=True)
        self.message_user(request, f'Activated {count} account(s).', messages.SUCCESS)

    @admin.action(description='Deactivate selected accounts and sign them out')
    def deactivate(self, request, queryset):
        targets = list(self._editable(request, queryset).filter(is_active=True))
        for user in targets:
            user.is_active = False
            user.save(update_fields=['is_active'])
            revoke_sessions(user)
        self.message_user(request, f'Deactivated {len(targets)} account(s).', messages.SUCCESS)

    @admin.action(description='Clear failed sign-in lockout')
    def unlock(self, request, queryset):
        for user in queryset:
            clear_failures(user.username)
        self.message_user(request, f'Cleared lockouts for {queryset.count()} account(s).', messages.SUCCESS)

    export_csv = HospitalAdmin.export_csv


# ---------------------------------------------------------------- clinic

class DoctorScheduleInline(HospitalTabularInline):
    model = DoctorSchedule


@admin.register(Department)
class DepartmentAdmin(HospitalAdmin):
    list_display = ('name', 'description', 'doctor_count')
    search_fields = ('name',)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(doctor_total=Count('doctors'))

    @admin.display(description='Doctors', ordering='doctor_total')
    def doctor_count(self, obj):
        return obj.doctor_total


@admin.register(Doctor)
class DoctorAdmin(HospitalAdmin):
    list_display = ('__str__', 'department', 'specialization', 'phone', 'experience',
                    'consultation_fee', 'clinic_status', 'is_available')
    list_filter = ('department', 'is_available', 'clinic_status')
    list_editable = ('is_available',)
    list_select_related = ('user', 'department')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email',
                     'specialization', 'license_number')
    autocomplete_fields = ('user', 'department')
    readonly_fields = ('average_consult_minutes',)
    inlines = [DoctorScheduleInline]


class CareContactInline(HospitalStackedInline):
    model = CareContact
    autocomplete_fields = ('user',)


@admin.register(Patient)
class PatientAdmin(HospitalAdmin):
    list_display = ('medical_record_number', '__str__', 'age', 'gender', 'blood_group', 'phone')
    list_filter = ('gender', 'blood_group')
    list_select_related = ('user',)
    search_fields = ('medical_record_number', 'user__username', 'user__first_name',
                     'user__last_name', 'user__email', 'phone')
    autocomplete_fields = ('user',)
    readonly_fields = ('medical_record_number',)
    fieldsets = (
        (None, {'fields': ('user', 'medical_record_number')}),
        ('Demographics', {'fields': ('date_of_birth', 'gender', 'blood_group', 'phone', 'address')}),
        ('Emergency contact', {'fields': ('emergency_contact_name', 'emergency_contact_phone')}),
        ('Clinical', {'fields': ('allergies', 'chronic_conditions')}),
    )
    inlines = [CareContactInline]


@admin.register(Appointment)
class AppointmentAdmin(HospitalAdmin):
    list_display = ('patient', 'doctor', 'appointment_date', 'status', 'consultation_type', 'created_at')
    list_filter = ('status', 'consultation_type', 'doctor')
    list_select_related = ('patient__user', 'doctor__user')
    date_hierarchy = 'appointment_date'
    search_fields = ('patient__user__username', 'patient__user__first_name', 'patient__user__last_name',
                     'patient__medical_record_number', 'doctor__user__username', 'doctor__user__last_name')
    autocomplete_fields = ('patient', 'doctor')
    readonly_fields = ('created_at', 'checked_in_at', 'started_at', 'completed_at')
    actions = ['approve', 'cancel', 'export_csv']

    @admin.action(description='Approve selected pending appointments')
    def approve(self, request, queryset):
        count = 0
        for appointment in queryset.filter(status='pending'):
            appointment.status = 'approved'
            appointment.save(update_fields=['status'])
            count += 1
        self.message_user(request, f'Approved {count} appointment(s).', messages.SUCCESS)

    @admin.action(description='Cancel selected appointments')
    def cancel(self, request, queryset):
        count = 0
        for appointment in queryset.filter(status__in=['pending', 'approved', 'checked_in']):
            appointment.status = 'cancelled'
            appointment.save(update_fields=['status'])
            count += 1
        self.message_user(request, f'Cancelled {count} appointment(s).', messages.SUCCESS)


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(HospitalAdmin):
    list_display = ('doctor', 'weekday', 'start_time', 'end_time')
    list_filter = ('weekday', 'doctor')
    list_select_related = ('doctor__user',)
    autocomplete_fields = ('doctor',)


# ---------------------------------------------------------------- prescriptions & pharmacy

class PrescriptionMedicineInline(HospitalTabularInline):
    model = PrescriptionMedicine
    autocomplete_fields = ('medicine',)


@admin.register(Prescription)
class PrescriptionAdmin(HospitalAdmin):
    list_display = ('__str__', 'prescribed_by', 'status', 'follow_up_date', 'created_at')
    list_filter = ('status',)
    list_select_related = ('appointment__patient__user', 'prescribed_by__user')
    date_hierarchy = 'created_at'
    search_fields = ('diagnosis', 'appointment__patient__user__first_name',
                     'appointment__patient__user__last_name', 'appointment__patient__medical_record_number')
    autocomplete_fields = ('appointment', 'prescribed_by')
    readonly_fields = ('created_at',)
    inlines = [PrescriptionMedicineInline]


@admin.register(PrescriptionMedicine)
class PrescriptionMedicineAdmin(HospitalAdmin):
    list_display = ('prescription', 'medicine', 'dosage', 'frequency', 'duration', 'quantity')
    list_select_related = ('prescription__appointment__patient__user', 'medicine')
    search_fields = ('medicine__name',)
    autocomplete_fields = ('prescription', 'medicine')


class MedicineStockInline(HospitalTabularInline):
    model = MedicineStock


@admin.register(Medicine)
class MedicineAdmin(HospitalAdmin):
    list_display = ('name', 'generic_name', 'unit', 'unit_price', 'stock_on_hand',
                    'requires_prescription', 'is_active')
    list_filter = ('is_active', 'requires_prescription')
    list_editable = ('is_active',)
    search_fields = ('name', 'generic_name', 'manufacturer')
    inlines = [MedicineStockInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(stock_total=Sum('batches__quantity'))

    @admin.display(description='In stock', ordering='stock_total')
    def stock_on_hand(self, obj):
        return obj.stock_total or 0


@admin.register(MedicineStock)
class MedicineStockAdmin(HospitalAdmin):
    list_display = ('medicine', 'batch_number', 'quantity', 'reorder_level', 'expiry_date',
                    'expired', 'low')
    list_filter = ('expiry_date', 'medicine')
    list_editable = ('quantity',)
    list_select_related = ('medicine',)
    search_fields = ('medicine__name', 'batch_number')
    autocomplete_fields = ('medicine',)

    @admin.display(boolean=True, description='Expired')
    def expired(self, obj):
        return obj.is_expired

    @admin.display(boolean=True, description='Reorder')
    def low(self, obj):
        return obj.needs_reorder


# ---------------------------------------------------------------- billing

class BillItemInline(HospitalTabularInline):
    model = BillItem


class PaymentInline(HospitalTabularInline):
    model = Payment
    readonly_fields = ('received_by', 'received_at')


@admin.register(Bill)
class BillAdmin(HospitalAdmin):
    list_display = ('invoice_number', 'patient', 'amount', 'tax', 'discount', 'bill_total',
                    'bill_balance', 'paid', 'due_date', 'created_at')
    list_filter = ('paid', 'created_at')
    list_select_related = ('patient__user',)
    date_hierarchy = 'created_at'
    search_fields = ('invoice_number', 'patient__user__first_name', 'patient__user__last_name',
                     'patient__medical_record_number')
    autocomplete_fields = ('patient', 'appointment')
    readonly_fields = ('invoice_number', 'created_at')
    inlines = [BillItemInline, PaymentInline]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('payments')

    @admin.display(description='Total')
    def bill_total(self, obj):
        return obj.total

    @admin.display(description='Balance')
    def bill_balance(self, obj):
        return obj.balance

    def save_formset(self, request, form, formset, change):
        for item in formset.save(commit=False):
            if isinstance(item, Payment) and item.received_by_id is None:
                item.received_by = request.user
            item.save()
        for removed in formset.deleted_objects:
            removed.delete()
        formset.save_m2m()

        bill = form.instance
        if formset.model is Payment and bill.pk:
            bill.refresh_from_db()
            settled = bill.balance <= 0
            if bill.paid != settled:
                bill.paid = settled
                bill.save(update_fields=['paid'])


@admin.register(BillItem)
class BillItemAdmin(HospitalAdmin):
    list_display = ('bill', 'description', 'service_type', 'quantity', 'unit_price')
    list_filter = ('service_type',)
    list_select_related = ('bill__patient__user',)
    search_fields = ('description', 'bill__invoice_number')
    autocomplete_fields = ('bill',)


@admin.register(Payment)
class PaymentAdmin(HospitalAdmin):
    list_display = ('bill', 'amount', 'method', 'reference', 'received_by', 'received_at')
    list_filter = ('method', 'received_at')
    list_select_related = ('bill__patient__user', 'received_by')
    date_hierarchy = 'received_at'
    search_fields = ('bill__invoice_number', 'reference')
    autocomplete_fields = ('bill',)
    readonly_fields = ('received_by', 'received_at')

    def save_model(self, request, obj, form, change):
        if obj.received_by_id is None:
            obj.received_by = request.user
        super().save_model(request, obj, form, change)


# ---------------------------------------------------------------- records

class DocumentShareInline(HospitalTabularInline):
    model = DocumentShare
    fk_name = 'document'
    readonly_fields = ('shared_by', 'created_at')
    autocomplete_fields = ('shared_with',)


@admin.register(MedicalDocument)
class MedicalDocumentAdmin(HospitalAdmin):
    list_display = ('title', 'patient', 'kind', 'document_date', 'uploaded_by', 'created_at')
    list_filter = ('kind', 'document_date')
    list_select_related = ('patient__user', 'uploaded_by')
    search_fields = ('title', 'issued_by', 'patient__user__first_name', 'patient__user__last_name',
                     'patient__medical_record_number')
    autocomplete_fields = ('patient',)
    readonly_fields = ('uploaded_by', 'created_at')
    inlines = [DocumentShareInline]


@admin.register(DocumentShare)
class DocumentShareAdmin(HospitalAdmin):
    list_display = ('document', 'shared_with', 'shared_by', 'expires_at', 'revoked_at', 'active')
    list_filter = ('revoked_at', 'expires_at')
    list_select_related = ('document', 'shared_with', 'shared_by')
    search_fields = ('document__title', 'shared_with__username')
    autocomplete_fields = ('document', 'shared_with')
    readonly_fields = ('shared_by', 'created_at')
    actions = ['revoke', 'export_csv']

    @admin.display(boolean=True, description='Active')
    def active(self, obj):
        return obj.is_active

    @admin.action(description='Revoke selected shares')
    def revoke(self, request, queryset):
        count = 0
        for share in queryset.filter(revoked_at__isnull=True):
            share.revoked_at = timezone.now()
            share.save(update_fields=['revoked_at'])
            count += 1
        self.message_user(request, f'Revoked {count} share(s).', messages.SUCCESS)


@admin.register(DocumentAccessLog)
class DocumentAccessLogAdmin(ReadOnlyAdmin):
    list_display = ('viewed_at', 'viewed_by', 'document')
    list_select_related = ('viewed_by', 'document')
    date_hierarchy = 'viewed_at'
    search_fields = ('document__title', 'viewed_by__username')


# ---------------------------------------------------------------- medication reminders

@admin.register(MedicationSchedule)
class MedicationScheduleAdmin(HospitalAdmin):
    list_display = ('medicine_name', 'patient', 'dosage', 'start_date', 'end_date', 'is_active')
    list_filter = ('is_active', 'start_date')
    list_select_related = ('patient__user',)
    search_fields = ('medicine_name', 'patient__user__first_name', 'patient__user__last_name')
    autocomplete_fields = ('patient', 'medicine', 'prescription')
    readonly_fields = ('created_at',)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Keeps the dose rows in step with edited times or dates, as the API does.
        build_doses(obj)


@admin.register(MedicationDose)
class MedicationDoseAdmin(HospitalAdmin):
    list_display = ('schedule', 'due_at', 'state', 'confirmed_at')
    list_filter = ('state',)
    list_select_related = ('schedule__patient__user',)
    date_hierarchy = 'due_at'
    search_fields = ('schedule__medicine_name', 'schedule__patient__user__last_name')
    raw_id_fields = ('schedule',)
    show_full_result_count = False


@admin.register(CareContact)
class CareContactAdmin(HospitalAdmin):
    list_display = ('name', 'patient', 'relationship', 'phone', 'user', 'consent_given', 'alert_after_misses')
    list_filter = ('consent_given',)
    list_select_related = ('patient__user', 'user')
    search_fields = ('name', 'phone', 'patient__user__last_name')
    autocomplete_fields = ('patient', 'user')


# ---------------------------------------------------------------- blood donation

class DonationRecordInline(HospitalTabularInline):
    model = DonationRecord
    fk_name = 'donor'
    autocomplete_fields = ('request',)


@admin.register(Donor)
class DonorAdmin(HospitalAdmin):
    list_display = ('__str__', 'blood_group', 'district', 'area', 'phone', 'is_available',
                    'last_donation_date', 'eligible')
    list_filter = ('blood_group', 'district', 'is_available')
    list_select_related = ('user',)
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'phone', 'area')
    autocomplete_fields = ('user',)
    inlines = [DonationRecordInline]

    @admin.display(boolean=True, description='Can donate')
    def eligible(self, obj):
        return obj.can_donate


class DonorResponseInline(HospitalTabularInline):
    model = DonorResponse
    readonly_fields = ('donor', 'reply', 'responded_at')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(BloodRequest)
class BloodRequestAdmin(HospitalAdmin):
    list_display = ('__str__', 'requested_by', 'district', 'urgency', 'needed_by', 'status', 'verified_by')
    list_filter = ('status', 'urgency', 'blood_group', 'district')
    list_select_related = ('requested_by', 'verified_by')
    date_hierarchy = 'created_at'
    search_fields = ('hospital', 'note', 'requested_by__username')
    autocomplete_fields = ('requested_by',)
    readonly_fields = ('verified_by', 'created_at')
    inlines = [DonorResponseInline]
    actions = ['verify', 'mark_fulfilled', 'mark_cancelled', 'export_csv']

    @admin.action(description='Mark selected requests as verified by me')
    def verify(self, request, queryset):
        count = 0
        for blood_request in queryset:
            blood_request.verified_by = request.user
            blood_request.save(update_fields=['verified_by'])
            count += 1
        self.message_user(request, f'Verified {count} request(s).', messages.SUCCESS)

    def _set_status(self, request, queryset, status):
        count = 0
        for blood_request in queryset.filter(status=BloodRequest.Status.OPEN):
            blood_request.status = status
            blood_request.save(update_fields=['status'])
            count += 1
        self.message_user(request, f'Updated {count} open request(s).', messages.SUCCESS)

    @admin.action(description='Close selected requests as fulfilled')
    def mark_fulfilled(self, request, queryset):
        self._set_status(request, queryset, BloodRequest.Status.FULFILLED)

    @admin.action(description='Close selected requests as cancelled')
    def mark_cancelled(self, request, queryset):
        self._set_status(request, queryset, BloodRequest.Status.CANCELLED)


@admin.register(DonorResponse)
class DonorResponseAdmin(HospitalAdmin):
    list_display = ('request', 'donor', 'reply', 'responded_at')
    list_filter = ('reply',)
    list_select_related = ('request', 'donor__user')
    autocomplete_fields = ('request', 'donor')


@admin.register(DonationRecord)
class DonationRecordAdmin(HospitalAdmin):
    list_display = ('donor', 'donated_on', 'hospital', 'units', 'request')
    list_filter = ('donated_on',)
    list_select_related = ('donor__user', 'request')
    search_fields = ('donor__user__first_name', 'donor__user__last_name', 'hospital')
    autocomplete_fields = ('donor', 'request')


# ---------------------------------------------------------------- notifications & audit

@admin.register(Notification)
class NotificationAdmin(HospitalAdmin):
    list_display = ('recipient', 'message', 'is_read', 'created_at')
    list_filter = ('is_read', 'created_at')
    list_select_related = ('recipient',)
    search_fields = ('message', 'recipient__username')
    autocomplete_fields = ('recipient',)
    show_full_result_count = False
    actions = ['mark_read', 'export_csv']

    @admin.action(description='Mark selected as read')
    def mark_read(self, request, queryset):
        count = queryset.filter(is_read=False).update(is_read=True)
        self.message_user(request, f'Marked {count} notification(s) read.', messages.SUCCESS)


@admin.register(AuditLog)
class AuditLogAdmin(ReadOnlyAdmin):
    list_display = ('created_at', 'actor', 'actor_role', 'action', 'target_model', 'target_id', 'ip_address')
    list_filter = ('action', 'target_model', 'actor_role')
    list_select_related = ('actor',)
    date_hierarchy = 'created_at'
    search_fields = ('target_id', 'actor__username', 'ip_address')
