from rest_framework.permissions import BasePermission

from .models import User


def role_of(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return User.Role.ADMIN
    return getattr(user, 'role', None) or User.Role.PATIENT


class RolePermission(BasePermission):
    """
    Base for the role rules. Unlike the usual DRF pattern, reads are checked too —
    letting every authenticated user read meant any patient could pull the whole
    medical registry.
    """

    read_roles = ()
    write_roles = ()
    message = 'Your role does not allow this action.'

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return role in self.read_roles
        return role in self.write_roles


class IsAdmin(RolePermission):
    read_roles = (User.Role.ADMIN,)
    write_roles = (User.Role.ADMIN,)
    message = 'Only an admin can perform this action.'


class DepartmentAccess(RolePermission):
    read_roles = tuple(User.Role.values)
    write_roles = (User.Role.ADMIN,)


class DoctorAccess(RolePermission):
    read_roles = tuple(User.Role.values)
    write_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST)


class PatientAccess(RolePermission):
    read_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST, User.Role.DOCTOR, User.Role.PATIENT)
    write_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST, User.Role.PATIENT)


class AppointmentAccess(RolePermission):
    read_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST, User.Role.DOCTOR, User.Role.PATIENT)
    write_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST, User.Role.DOCTOR, User.Role.PATIENT)


class PrescriptionAccess(RolePermission):
    read_roles = (User.Role.ADMIN, User.Role.DOCTOR, User.Role.PATIENT, User.Role.PHARMACIST)
    write_roles = (User.Role.ADMIN, User.Role.DOCTOR)


class MedicineAccess(RolePermission):
    read_roles = (User.Role.ADMIN, User.Role.DOCTOR, User.Role.RECEPTIONIST, User.Role.PHARMACIST)
    write_roles = (User.Role.ADMIN, User.Role.PHARMACIST)


class BillAccess(RolePermission):
    read_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST, User.Role.PATIENT)
    write_roles = (User.Role.ADMIN, User.Role.RECEPTIONIST)


class CanDispense(RolePermission):
    read_roles = (User.Role.ADMIN, User.Role.PHARMACIST)
    write_roles = (User.Role.ADMIN, User.Role.PHARMACIST)
    message = 'Only a pharmacist can dispense a prescription.'
