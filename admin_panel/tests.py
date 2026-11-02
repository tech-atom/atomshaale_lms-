from django.test import RequestFactory, TransactionTestCase, override_settings
from django.core import mail

from admin_panel.forms import (
    StudentRegistrationForm,
    TpoRegistrationForm,
    TrainerRegistrationForm,
)
from college.models import College, Course, Section
from material.models import Domain
from users.models import User


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
