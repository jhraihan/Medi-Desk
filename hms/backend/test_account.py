"""Self-service password change and reset, and the readiness probe."""

import re

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import User
from .security import is_locked_out, record_failure
from .tests import make_user

PASSWORD = 'Str0ngPassw0rd!x'
NEW_PASSWORD = 'Brand!New-Passw0rd'


class PasswordChangeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user('changer', User.Role.RECEPTIONIST, email='changer@example.com')
        self.tokens = self.client.post('/api/v1/login/', {'username': 'changer', 'password': PASSWORD},
                                       format='json').data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}')

    def _change(self, current, new):
        return self.client.post('/api/v1/auth/password/', {'current_password': current, 'new_password': new},
                                format='json')

    def test_change_needs_the_current_password(self):
        response = self._change('wrong', NEW_PASSWORD)
        self.assertEqual(response.status_code, 400)
        self.assertIn('current_password', response.data)

    def test_weak_new_passwords_are_refused(self):
        response = self._change(PASSWORD, '12345678')
        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.data)

    def test_change_signs_out_other_sessions_but_keeps_this_one(self):
        response = self._change(PASSWORD, NEW_PASSWORD)
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))

        self.client.credentials()
        old = self.client.post('/api/v1/token/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(old.status_code, 401)
        fresh = self.client.post('/api/v1/token/refresh/', {'refresh': response.data['refresh']}, format='json')
        self.assertEqual(fresh.status_code, 200)

    def test_anonymous_cannot_change_a_password(self):
        self.client.credentials()
        self.assertEqual(self._change(PASSWORD, NEW_PASSWORD).status_code, 401)


@override_settings(FRONTEND_URL='https://app.example.com')
class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user('forgetful', User.Role.PATIENT, email='forgetful@example.com')

    def _request(self, email):
        return self.client.post('/api/v1/auth/password-reset/', {'email': email}, format='json')

    def _link_parts(self):
        link = re.search(r'https://app\.example\.com/reset-password\?uid=(\S+)&token=(\S+)', mail.outbox[-1].body)
        return link.group(1), link.group(2)

    def _confirm(self, uid, token, password=NEW_PASSWORD):
        return self.client.post('/api/v1/auth/password-reset/confirm/',
                                {'uid': uid, 'token': token, 'new_password': password}, format='json')

    def test_reply_is_the_same_for_unknown_addresses(self):
        known = self._request('FORGETFUL@example.com')
        unknown = self._request('nobody@example.com')
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['forgetful@example.com'])

    def test_deactivated_accounts_get_no_email(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self._request('forgetful@example.com')
        self.assertEqual(mail.outbox, [])

    def test_link_resets_the_password_once_and_clears_the_lockout(self):
        for _ in range(5):
            record_failure('forgetful')
        self._request('forgetful@example.com')
        uid, token = self._link_parts()

        self.assertEqual(self._confirm(uid, token).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertFalse(is_locked_out('forgetful'))

        self.assertEqual(self._confirm(uid, token, 'Another!Passw0rd9').status_code, 400)

    def test_a_tampered_token_is_refused(self):
        self._request('forgetful@example.com')
        uid, _ = self._link_parts()
        self.assertEqual(self._confirm(uid, 'not-a-real-token').status_code, 400)
        self.assertEqual(self._confirm('bm9wZQ', 'whatever').status_code, 400)

    def test_front_desk_patients_can_set_their_first_password(self):
        walk_in = User.objects.create_user('walkin', email='walkin@example.com', password=None,
                                           role=User.Role.PATIENT)
        self._request('walkin@example.com')
        uid, token = self._link_parts()
        self.assertEqual(self._confirm(uid, token).status_code, 200)
        walk_in.refresh_from_db()
        self.assertTrue(walk_in.check_password(NEW_PASSWORD))


class ReadinessTests(APITestCase):
    def test_ready_when_the_database_answers(self):
        response = self.client.get('/readyz/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['database'], 'up')
