import re

from django.test import Client, RequestFactory, TestCase, TransactionTestCase, override_settings
from django.core import mail
from django.urls import reverse

from admin_panel.forms import (
    StudentRegistrationForm,
    TpoRegistrationForm,
    TrainerRegistrationForm,
)
from college.models import College, Course, Section
from material.models import Domain
from users.models import User


class AdminAssessmentCsrfTokenTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='assessment-admin@example.com',
            password='secret123',
            first_name='Assessment',
            last_name='Admin',
            role='admin',
            mobile_number='+919999999997',
            gender='Male',
        )

    def test_assessment_page_renders_csrf_token_for_upload_requests(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.admin)

        response = client.get(reverse('admin_assessment_page'))

        self.assertEqual(response.status_code, 200)
        self.assertIn('csrftoken', response.cookies)
        token_match = re.search(
            rb'<meta name="csrf-token" content="([^"]+)">',
            response.content,
        )
        self.assertIsNotNone(token_match)
        self.assertNotEqual(token_match.group(1), b'NOTPROVIDED')


@override_settings(
    ALLOWED_HOSTS=['testserver'],
    DEFAULT_FROM_EMAIL='noreply@example.com',
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
)
class AdminRegistrationEmailTests(TransactionTestCase):
    def setUp(self):
        self.request = RequestFactory().post(
            '/admin-panel/register/',
            HTTP_HOST='testserver',
        )
        self.college = College.objects.create(name='Admin Test College')
        self.course = Course.objects.create(name='Admin Test Course')
        self.section = Section.objects.create(name='Z')

    def test_admin_created_student_trainer_and_tpo_send_after_commit(self):
        student_form = StudentRegistrationForm()
        student_form.cleaned_data = {
            'email': 'admin-student@example.com',
            'first_name': 'Admin Student',
            'mobile_number': '+919876543210',
            'gender': 'NA',
            'usn': 'ADMIN001',
            'college': self.college,
            'course': self.course,
            'section': self.section,
            'semester': 1,
            'year': 1,
        }
        student, student_email_sent = student_form.save(self.request)

        domain = Domain.objects.create(domain_name='Admin Test Domain')
        trainer_form = TrainerRegistrationForm()
        trainer_form.cleaned_data = {
            'email': 'admin-trainer@example.com',
            'first_name': 'Admin Trainer',
            'mobile_number': '+919876543211',
            'gender': 'NA',
            'skill_summary': 'Test skills',
            'profile_pdf': None,
            'domains': [domain],
            'subdomains': [],
        }
        trainer, trainer_email_sent = trainer_form.save(self.request)

        tpo_form = TpoRegistrationForm()
        tpo_form.cleaned_data = {
            'email': 'admin-tpo@example.com',
            'first_name': 'Admin TPO',
            'mobile_number': '+919876543212',
            'gender': 'NA',
            'college': self.college,
        }
        tpo, tpo_email_sent = tpo_form.save(self.request)

        self.assertEqual(
            [student.role, trainer.role, tpo.role],
            ['student', 'trainer', 'tpo'],
        )
        self.assertTrue(
            all((student_email_sent, trainer_email_sent, tpo_email_sent)),
            msg=(
                f"Delivery results: {student_email_sent}, {trainer_email_sent}, "
                f"{tpo_email_sent}; outbox recipients: "
                f"{[message.to for message in mail.outbox]}"
            ),
        )
        self.assertFalse(any((student.is_active, trainer.is_active, tpo.is_active)))
        self.assertEqual(len(mail.outbox), 3)
        self.assertEqual(
            {message.to[0] for message in mail.outbox},
            {
                'admin-student@example.com',
                'admin-trainer@example.com',
                'admin-tpo@example.com',
            },
        )
        self.assertEqual(User.objects.count(), 3)
