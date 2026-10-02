from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta

from college.models import College, Course
from material.models import Domain
from .models import Exam, ScheduledExam


class ScheduleExamBulkSchedulingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email='trainer@example.com',
            password='secret123',
            first_name='Test',
            last_name='Trainer',
            role='trainer',
            mobile_number='+919999999999',
            gender='Male',
        )
        self.domain = Domain.objects.create(domain_name='Technical')
        self.exam = Exam.objects.create(
            title='Sample Exam',
            passing_marks=30,
            max_marks=100,
            domain=self.domain,
            duration_minutes=60,
            created_by=self.user,
        )
        self.college_1 = College.objects.create(name='College One')
        self.college_2 = College.objects.create(name='College Two')
        self.course_1 = Course.objects.create(name='CSE')
        self.course_2 = Course.objects.create(name='ECE')

    def test_bulk_schedule_exam_creates_one_schedule_per_combination(self):
        self.client.force_login(self.user)
        start_datetime = timezone.localtime(timezone.now() + timedelta(days=30)).replace(
            second=0,
            microsecond=0,
        )
        end_datetime = start_datetime + timedelta(hours=2)
        payload = {
            'college': [str(self.college_1.id), str(self.college_2.id)],
            'course': [str(self.course_1.id), str(self.course_2.id)],
            'semester': [1, 2],
            'year': [1, 2],
            'section': ['A', 'B'],
            'start_datetime': start_datetime.strftime('%Y-%m-%dT%H:%M'),
            'end_datetime': end_datetime.strftime('%Y-%m-%dT%H:%M'),
            'status': 'pending',
            'allowed_tab_switches': 3,
            'result_released': True,
            'require_attendance': True,
            'live_exam_monitor': False,
        }

        url = reverse('admin_schedule_exam', kwargs={'exam_id': self.exam.id})
        response = self.client.post(
            url,
            data=payload,
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(ScheduledExam.objects.count(), 16)

        schedule = ScheduledExam.objects.order_by('college__name', 'course__name', 'semester', 'year').first()
        self.assertEqual(schedule.section, 'A,B')
        self.assertTrue(schedule.result_released)
        self.assertTrue(schedule.require_attendance)
        self.assertFalse(schedule.live_exam_monitor)
