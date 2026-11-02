import re
import smtplib
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import urlsplit

import pandas as pd
from django.test import TestCase
from django.urls import reverse
from django.core import mail
from django.core.cache import cache
from django.db import transaction
from django.test import RequestFactory, TransactionTestCase, override_settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from users.forms import StudentRegistrationForm, UserLoginForm
from users.utils import (
    send_password_reset_email,
    send_verification_email,
    send_verification_email_on_commit,
)
from college.models import (
    College,
    CollegeCourse,
    CollegeCourseSection,
    Course,
    Section,
)
from users.models import User
from student.models import StudentProfile
from admin_panel.forms import BulkStudentUploadForm


class UserLoginTest(TestCase):
    def test_login_form_normalizes_email(self):
        form = UserLoginForm(data={
            'email': '  Student@Example.COM ',
            'password': 'correct-password',
        })

        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data['email'], 'student@example.com')

    def test_login_accepts_email_case_different_from_stored_value(self):
        user = User.objects.create_user(
            email='Student@Example.com',
            password='correct-password',
            first_name='Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
        )

        response = self.client.post(reverse('login'), {
            'email': 'student@example.COM',
            'password': 'correct-password',
        })

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], reverse('student_home_page'))
        self.assertEqual(str(self.client.session['_auth_user_id']), str(user.pk))

    def test_login_rejects_incorrect_password(self):
        User.objects.create_user(
            email='student@example.com',
            password='correct-password',
            first_name='Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
        )

        response = self.client.post(reverse('login'), {
            'email': 'student@example.com',
            'password': 'incorrect-password',
        })

        self.assertEqual(response.status_code, 200)
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_login_rejects_case_ambiguous_duplicate_emails(self):
        User.objects.create_user(
            email='Student@Example.com',
            password='correct-password',
            first_name='Student One',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
        )
        User.objects.create_user(
            email='student@example.com',
            password='correct-password',
            first_name='Student Two',
            role='student',
            mobile_number='+919876543211',
            gender='NA',
        )

        response = self.client.post(reverse('login'), {
            'email': 'STUDENT@example.com',
            'password': 'correct-password',
        })

        self.assertEqual(response.status_code, 200)
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_saving_current_profile_retires_previous_profile(self):
        college = College.objects.create(name='Profile Test College')
        course = Course.objects.create(name='Profile Test Course')
        section = Section.objects.create(name='P')
        user = User.objects.create_user(
            email='profile@example.com',
            password='correct-password',
            first_name='Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
        )

        first = StudentProfile.objects.create(
            user=user,
            usn='TEST001',
            college=college,
            course=course,
            section=section,
            semester=1,
            year=1,
            batch_year=2026,
        )
        second = StudentProfile.objects.create(
            user=user,
            usn='TEST002',
            college=college,
            course=course,
            section=section,
            semester=1,
            year=1,
            batch_year=2026,
        )

        first.refresh_from_db()
        self.assertFalse(first.is_current)
        self.assertTrue(second.is_current)
        self.assertEqual(
            StudentProfile.objects.filter(user=user, is_current=True).count(),
            1,
        )

class StudentRegistrationFormTest(TestCase):
    def setUp(self):
        self.college = College.objects.create(name="Test College")
        self.course = Course.objects.create(name="Test Course")
        self.section = Section.objects.create(name="A")
        college_course = CollegeCourse.objects.create(
            college=self.college,
            course=self.course,
        )
        CollegeCourseSection.objects.create(
            college_course=college_course,
            section=self.section,
        )

    def test_valid_first_name(self):
        form_data = {
            'email': 'student@gmail.com',
            'first_name': 'John Doe',
            'mobile_number': '+919876543210',
            'gender': 'Male',
            'usn': '1BM18CS001',
            'college': self.college.id,
            'course': self.course.id,
            'section': self.section.name,
            'semester': 4,
            'year': 2,
            'batch_year': 2024
        }
        form = StudentRegistrationForm(data=form_data)
        form.is_valid()
        self.assertNotIn('first_name', form.errors)

    def test_invalid_first_name_with_numbers(self):
        form_data = {
            'email': 'student@gmail.com',
            'first_name': 'John123 Doe',
            'mobile_number': '+919876543210',
            'gender': 'Male',
            'usn': '1BM18CS001',
            'college': self.college.id,
            'course': self.course.id,
            'section': self.section.name,
            'semester': 4,
            'year': 2,
            'batch_year': 2024
        }
        form = StudentRegistrationForm(data=form_data)
        form.is_valid()
        self.assertIn('first_name', form.errors)
        self.assertEqual(form.errors['first_name'][0], "Name must contain only alphabetic characters and spaces.")

    def test_failed_profile_creation_rolls_back_new_user(self):
        form_data = {
            'email': 'rollback@gmail.com',
            'first_name': 'Rollback Student',
            'mobile_number': '+919876543210',
            'gender': 'Male',
            'usn': 'ROLLBACK001',
            'college': self.college.id,
            'course': self.course.id,
            'section': self.section.name,
            'semester': 4,
            'year': 2,
            'batch_year': 2024,
        }
        form = StudentRegistrationForm(data=form_data)
        self.assertTrue(form.is_valid(), form.errors)

        with patch(
            'student.models.StudentProfile.objects.create',
            side_effect=RuntimeError('profile write failed'),
        ):
            with self.assertRaises(RuntimeError):
                form.save()

        self.assertFalse(User.objects.filter(email='rollback@gmail.com').exists())

    def test_invalid_first_name_with_symbols(self):
        form_data = {
            'email': 'student@gmail.com',
            'first_name': 'John@Doe',
            'mobile_number': '+919876543210',
            'gender': 'Male',
            'usn': '1BM18CS001',
            'college': self.college.id,
            'course': self.course.id,
            'section': self.section.name,
            'semester': 4,
            'year': 2,
            'batch_year': 2024
        }
        form = StudentRegistrationForm(data=form_data)
        form.is_valid()
        self.assertIn('first_name', form.errors)
        self.assertEqual(form.errors['first_name'][0], "Name must contain only alphabetic characters and spaces.")

@override_settings(SECURE_SSL_REDIRECT=False)
class ResendVerificationEmailTests(TestCase):
    def setUp(self):
        cache.clear()

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_sends_verification_email_for_pending_account(self):
        user = User.objects.create_user(
            email='pending@example.com',
            password='Test-password-123!',
            first_name='Pending Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=False,
            is_verified=False,
        )

        response = self.client.post(
            reverse('resend_verification_email'),
            {'email': user.email},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [user.email])
        self.assertIn('/verify/', mail.outbox[0].body)

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_does_not_send_verification_email_for_active_account(self):
        User.objects.create_user(
            email='active@example.com',
            password='Test-password-123!',
            first_name='Active Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=True,
            is_verified=True,
        )

        response = self.client.post(
            reverse('resend_verification_email'),
            {'email': 'active@example.com'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_known_and_unknown_email_receive_same_response(self):
        User.objects.create_user(
            email='known@example.com',
            password=None,
            first_name='Pending Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=False,
            is_verified=False,
        )
        known_response = self.client.post(
            reverse('resend_verification_email'),
            {'email': 'known@example.com'},
        )
        cache.clear()
        unknown_response = self.client.post(
            reverse('resend_verification_email'),
            {'email': 'unknown@example.com'},
        )

        self.assertEqual(known_response.status_code, unknown_response.status_code)
        self.assertContains(
            known_response,
            "If an unverified account matches that email",
        )
        self.assertContains(
            unknown_response,
            "If an unverified account matches that email",
        )

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_resend_is_limited_per_normalized_email(self):
        for submitted_email in (
            'unknown@example.com',
            'UNKNOWN@example.com',
            'Unknown@Example.com',
        ):
            response = self.client.post(
                reverse('resend_verification_email'),
                {'email': submitted_email},
            )
            self.assertEqual(response.status_code, 200)

        response = self.client.post(
            reverse('resend_verification_email'),
            {'email': 'unknown@example.com'},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_expired_verification_token_is_rejected(self):
        user = User.objects.create_user(
            email='expired@example.com',
            password=None,
            first_name='Expired Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=False,
            is_verified=False,
        )
        token = default_token_generator.make_token(user)
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        verification_path = reverse(
            'email_verify',
            kwargs={'uidb64': uidb64, 'token': token},
        )

        with patch.object(
            default_token_generator,
            '_now',
            return_value=datetime.now() + timedelta(days=2),
        ):
            response = self.client.get(verification_path)

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Invalid or Expired Link')

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_registration_verification_login_dashboard_flow(self):
        college = College.objects.create(name='Lifecycle College')
        course = Course.objects.create(name='Lifecycle Course')
        section = Section.objects.create(name='L')
        college_course = CollegeCourse.objects.create(college=college, course=course)
        CollegeCourseSection.objects.create(
            college_course=college_course,
            section=section,
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse('student_register'), {
                'email': 'lifecycle@gmail.com',
                'first_name': 'Lifecycle Student',
                'mobile_number': '+919876543210',
                'gender': 'NA',
                'usn': 'LIFE001',
                'college': college.pk,
                'course': course.pk,
                'section': section.pk,
                'semester': 1,
                'year': 1,
                'batch_year': datetime.now().year,
            })
        self.assertRedirects(response, reverse('login'))

        user = User.objects.get(email='lifecycle@gmail.com')
        self.assertFalse(user.is_active)
        self.assertEqual(len(mail.outbox), 1)
        verification_url = re.search(
            r'https?://\S+/verify/\S+',
            mail.outbox[0].body,
        ).group(0)
        verification_path = urlsplit(verification_url).path

        response = self.client.post(verification_path, {
            'new_password1': 'StrongPass123!',
            'new_password2': 'StrongPass123!',
        })
        self.assertRedirects(response, reverse('login'))
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_verified)

        response = self.client.post(reverse('login'), {
            'email': user.email,
            'password': 'StrongPass123!',
        })
        self.assertRedirects(response, reverse('student_home_page'))
        self.assertEqual(self.client.get(reverse('student_home_page')).status_code, 200)

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_zero_backend_send_count_is_a_delivery_failure(self):
        user = User.objects.create_user(
            email='delivery-failed@example.com',
            password=None,
            first_name='Delivery Failed',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=False,
            is_verified=False,
        )
        request = RequestFactory().get('/register/', HTTP_HOST='testserver')

        with patch('users.utils.send_mail', return_value=0):
            self.assertFalse(send_verification_email(request, user))

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_smtp_authentication_failure_is_logged_as_delivery_failure(self):
        user = User.objects.create_user(
            email='smtp-auth-failed@example.com',
            password=None,
            first_name='SMTP Failure',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=False,
            is_verified=False,
        )
        request = RequestFactory().get('/register/', HTTP_HOST='testserver')

        with patch(
            'users.utils.send_mail',
            side_effect=smtplib.SMTPAuthenticationError(535, b'Authentication failed'),
        ):
            self.assertFalse(send_verification_email(request, user))

        self.assertTrue(User.objects.filter(pk=user.pk, is_active=False).exists())


class PasswordResetEmailTests(TestCase):
    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_password_reset_view_sends_email_for_active_user(self):
        user = User.objects.create_user(
            email='password-reset@example.com',
            password='ExistingPassword123!',
            first_name='Password Reset',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=True,
            is_verified=True,
        )

        response = self.client.post(
            reverse('password_reset'),
            {'email': user.email},
        )

        self.assertRedirects(response, reverse('password_reset_done'))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [user.email])
        self.assertIn('/reset/', mail.outbox[0].body)

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_password_reset_send_count_zero_is_reported_as_failure(self):
        user = User.objects.create_user(
            email='password-reset-no-send@example.com',
            password='ExistingPassword123!',
            first_name='Password Reset',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=True,
            is_verified=True,
        )

        with patch('users.utils.send_mail', return_value=0) as send_mail_mock:
            sent = send_password_reset_email(
                user,
                'encoded-user-id',
                'reset-token',
                'testserver',
                'http',
            )

        self.assertFalse(sent)
        send_mail_mock.assert_called_once()


class BulkRegistrationEmailTests(TransactionTestCase):
    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_invalid_email_and_email_delivery_failure_do_not_stop_bulk_upload(self):
        college = College.objects.create(name='Bulk Test College')
        course = Course.objects.create(name='Bulk Test Course')
        section = Section.objects.create(name='B')
        bulk_form = BulkStudentUploadForm()
        bulk_form.cleaned_data = {'excel_file': object()}
        rows = pd.DataFrame([
            {
                'first_name': 'First Student',
                'email': 'first@example.com',
                'mobile_number': '+919876543210',
                'gender': 'NA',
                'usn': 'BULK001',
                'college': college.name,
                'course': course.name,
                'section': section.name,
                'semester': 1,
                'year': 1,
            },
            {
                'first_name': 'Invalid Student',
                'email': 'not-an-email',
                'mobile_number': '+919876543211',
                'gender': 'NA',
                'usn': 'BULK002',
                'college': college.name,
                'course': course.name,
                'section': section.name,
                'semester': 1,
                'year': 1,
            },
            {
                'first_name': 'Last Student',
                'email': 'last@example.com',
                'mobile_number': '+919876543212',
                'gender': 'NA',
                'usn': 'BULK003',
                'college': college.name,
                'course': course.name,
                'section': section.name,
                'semester': 1,
                'year': 1,
            },
        ])

        with (
            patch('admin_panel.forms.pd.read_excel', return_value=rows),
            patch(
                'admin_panel.forms.send_verification_email_on_commit',
                side_effect=[False, True],
            ),
        ):
            created, failed, email_failed = bulk_form.process(
                RequestFactory().post('/admin-panel/register/', HTTP_HOST='testserver')
            )

        self.assertEqual(created, ['first@example.com', 'last@example.com'])
        self.assertEqual(failed[0]['email'], 'not-an-email')
        self.assertEqual(failed[0]['error'], 'Invalid email address')
        self.assertEqual(email_failed, ['first@example.com'])
        self.assertEqual(User.objects.filter(role='student').count(), 2)

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='noreply@example.com',
    )
    def test_verification_email_runs_only_after_transaction_commit(self):
        user = User.objects.create_user(
            email='commit@example.com',
            password=None,
            first_name='Commit Student',
            role='student',
            mobile_number='+919876543210',
            gender='NA',
            is_active=False,
            is_verified=False,
        )
        request = RequestFactory().get('/register/', HTTP_HOST='testserver')

        with transaction.atomic():
            result = send_verification_email_on_commit(request, user)
            self.assertIsNone(result)
            self.assertEqual(len(mail.outbox), 0)

        self.assertEqual(len(mail.outbox), 1)