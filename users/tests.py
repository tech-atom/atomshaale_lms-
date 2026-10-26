from django.test import TestCase
from django.urls import reverse
from users.forms import StudentRegistrationForm, UserLoginForm
from college.models import College, Course, Section
from users.models import User
from student.models import StudentProfile


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