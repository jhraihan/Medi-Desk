from rest_framework.permissions import SAFE_METHODS, BasePermission

def role_of(user):
    if not user or not user.is_authenticated:
        return None


    if user.is_superuser:
        return 'admin'

    return getattr(user, 'role', 'patient')


class IsAdmin(BasePermission):

    message = "Only an admin can perform this action."

    def has_permission(self, request, view):
        return role_of(request.user) == 'admin'


class RoleWritePermission(BasePermission):

    roles_that_may_write = ()
    message = "Your role does not allow this change."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return True

        return role_of(request.user) in self.roles_that_may_write


class AdminOrReceptionistWrites(RoleWritePermission):

    roles_that_may_write = ('admin', 'receptionist')
    message = "Only an admin or receptionist can modify these records."


class DoctorWrites(RoleWritePermission):

    roles_that_may_write = ('admin', 'doctor')
    message = "Only a doctor can issue or modify prescriptions."


class AppointmentWrites(RoleWritePermission):

    roles_that_may_write = ('admin', 'receptionist', 'patient', 'doctor')
    message = "You do not have permission to modify appointments."