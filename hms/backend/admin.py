from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, Department, Doctor, Patient, Appointment, Prescription, Medicine, PrescriptionMedicine, Bill


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Subclasses the auth UserAdmin so passwords stay hashed. This is where staff accounts get made."""

    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active')
    list_filter = ('role', 'is_staff', 'is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name')

    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Hospital role', {'fields': ('role',)}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ('Hospital role', {'fields': ('role',)}),
    )

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')

@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('user', 'department', 'specialization', 'phone', 'experience', 'is_available')
    list_filter = ('department', 'is_available')
    search_fields = ('user__username', 'user__email', 'specialization')

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('user', 'age', 'gender', 'blood_group', 'phone')
    search_fields = ('user__username', 'user__email')

@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('patient', 'doctor', 'appointment_date', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('patient__user__username', 'doctor__user__username')

@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ('appointment', 'diagnosis', 'created_at')

@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'unit')

@admin.register(PrescriptionMedicine)
class PrescriptionMedicineAdmin(admin.ModelAdmin):
    list_display = ('prescription', 'medicine', 'dosage', 'duration')

@admin.register(Bill)
class BillAdmin(admin.ModelAdmin):
    list_display = ('id', 'patient', 'amount', 'paid', 'created_at')
    list_filter = ('paid', 'created_at')
    search_fields = ('patient__user__username',)