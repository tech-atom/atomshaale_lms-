from django.test import TestCase
from users.forms import StudentRegistrationForm
from college.models import College, Course, Section

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
