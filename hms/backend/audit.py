"""
Who-touched-what trail for patient, billing and staff data.

Writes are captured with model signals, so the API, the Django admin, management
commands and the shell are all covered without each view remembering to log. Reads
are logged explicitly by the views that expose a single patient record.

Only field names are stored, never values: copying diagnoses or phone numbers into
the log would turn it into a second, unaudited copy of the medical record.
"""

import ipaddress
from contextvars import ContextVar

from django.db.models.signals import post_delete, post_save, pre_save
from rest_framework.throttling import BaseThrottle

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
    DocumentShare,
    MedicalDocument,
    MedicationSchedule,
    Medicine,
    MedicineStock,
    Patient,
    Payment,
    Prescription,
    User,
)

AUDITED_MODELS = [
    Appointment, Bill, BillItem, BloodRequest, CareContact, Department, Doctor,
    DoctorSchedule, DocumentShare, MedicalDocument, MedicationSchedule, Medicine,
    MedicineStock, Patient, Payment, Prescription, User,
]

# Saves that carry no information worth a row: Django stamps last_login on every sign-in.
IGNORED_FIELDS = {'last_login'}

_current_request = ContextVar('audit_request', default=None)


class AuditContextMiddleware:
    """Makes the request visible to the signal handlers below.

    DRF copies the authenticated user back onto the underlying HttpRequest, so by the
    time a view saves anything, request.user is the JWT user, not AnonymousUser.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _current_request.set(request)
        try:
            return self.get_response(request)
        finally:
            _current_request.reset(token)


def client_ip(request):
    if request is None:
        return None
    # Same parsing as the throttles, so NUM_PROXIES decides both consistently.
    candidate = BaseThrottle().get_ident(request)
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def record(action, instance, fields=(), request=None):
    from .permissions import role_of

    request = request or _current_request.get()
    user = getattr(request, 'user', None)
    actor = user if user is not None and user.is_authenticated else None

    AuditLog.objects.create(
        actor=actor,
        actor_role=role_of(actor) or '',
        action=action,
        target_model=type(instance).__name__,
        target_id=str(instance.pk),
        changes={'fields': sorted(fields)} if fields else {},
        ip_address=client_ip(request),
    )


def _tracked_fields(model):
    return [field for field in model._meta.concrete_fields if not field.primary_key]


def _remember_previous(sender, instance, update_fields=None, **kwargs):
    instance._audit_before = None
    if update_fields is not None or instance.pk is None:
        return
    names = [field.attname for field in _tracked_fields(sender)]
    instance._audit_before = sender._default_manager.filter(pk=instance.pk).values(*names).first()


def _log_save(sender, instance, created, update_fields=None, raw=False, **kwargs):
    if raw:
        return  # loaddata fixtures

    if created:
        record(AuditLog.Action.CREATE, instance)
        return

    if update_fields is not None:
        changed = set(update_fields)
    else:
        before = getattr(instance, '_audit_before', None) or {}
        changed = {
            field.name for field in _tracked_fields(sender)
            if before.get(field.attname) != getattr(instance, field.attname)
        }

    changed -= IGNORED_FIELDS
    if changed:
        record(AuditLog.Action.UPDATE, instance, changed)


def _log_delete(sender, instance, **kwargs):
    record(AuditLog.Action.DELETE, instance)


def connect():
    for model in AUDITED_MODELS:
        uid = f'audit-{model.__name__}'
        pre_save.connect(_remember_previous, sender=model, dispatch_uid=f'{uid}-pre')
        post_save.connect(_log_save, sender=model, dispatch_uid=f'{uid}-post')
        post_delete.connect(_log_delete, sender=model, dispatch_uid=f'{uid}-delete')
