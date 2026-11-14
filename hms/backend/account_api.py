"""
Self-service account endpoints: change your own password, and reset a forgotten one
by email.

Every password change signs the account out everywhere else, because a changed
password is often the response to a suspected leak.
"""

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .admin_api import revoke_sessions
from .models import User
from .security import clear_failures

# The same reply whether or not the address belongs to anyone, so the form cannot be
# used to find out who has an account.
RESET_SENT = 'If that email belongs to an account, a reset link is on its way.'


def _check_new_password(password, user):
    try:
        validate_password(password, user)
    except DjangoValidationError as problem:
        raise ValidationError({'new_password': list(problem.messages)}) from None


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = 'password'

    @extend_schema(request=PasswordChangeSerializer, responses=dict)
    def post(self, request):
        data = PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = request.user

        if not user.check_password(data.validated_data['current_password']):
            raise ValidationError({'current_password': ['Your current password is not right.']})
        _check_new_password(data.validated_data['new_password'], user)

        user.set_password(data.validated_data['new_password'])
        user.save(update_fields=['password'])
        revoke_sessions(user)

        # A fresh pair keeps this browser signed in; every other session is gone.
        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'password_reset'

    @extend_schema(request=PasswordResetRequestSerializer, responses=dict)
    def post(self, request):
        data = PasswordResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        # Includes patients the front desk registered without a password: the link is
        # how they set their first one.
        for user in User.objects.filter(email__iexact=data.validated_data['email'], is_active=True):
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f'{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}'
            hours = settings.PASSWORD_RESET_TIMEOUT // 3600
            send_mail(
                subject='Reset your MediDesk password',
                message=(
                    f'Hello {user.get_full_name() or user.username},\n\n'
                    f'Use this link to choose a new MediDesk password. It works once and '
                    f'expires in {hours} hour{"" if hours == 1 else "s"}:\n\n{link}\n\n'
                    f'Your username is {user.username}.\n\n'
                    'If you did not ask for this, ignore this email; your password stays as it is.'
                ),
                from_email=None,
                recipient_list=[user.email],
            )

        return Response({'detail': RESET_SENT})


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = 'password_reset'

    @extend_schema(request=PasswordResetConfirmSerializer, responses=dict)
    def post(self, request):
        data = PasswordResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(data.validated_data['uid'])),
                                    is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(user, data.validated_data['token']):
            return Response({'detail': 'This reset link is invalid or has expired. Ask for a new one.'}, status=400)

        _check_new_password(data.validated_data['new_password'], user)
        user.set_password(data.validated_data['new_password'])
        user.save(update_fields=['password'])
        clear_failures(user.username)
        revoke_sessions(user)
        return Response({'detail': 'Password changed. You can sign in now.', 'username': user.username})
