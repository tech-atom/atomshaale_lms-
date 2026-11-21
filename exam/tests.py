import csv
import io
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from college.models import College, Course
from material.models import Domain
from .models import Exam, ExamQuestion, ScheduledExam


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


class BulkUploadQuestionTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            email='admin@example.com',
            password='secret123',
            first_name='Test',
            last_name='Admin',
            role='admin',
            mobile_number='+919999999998',
            gender='Male',
        )
        self.exam = Exam.objects.create(
            title='Bulk Upload Exam',
            passing_marks=1,
            max_marks=2,
            domain=Domain.objects.create(domain_name='Bulk Upload'),
            duration_minutes=30,
            created_by=self.admin,
        )

    def upload_csv_rows(self, rows):
        csv_file = io.StringIO(newline='')
        writer = csv.writer(csv_file)
        writer.writerow(['question_text', 'type', 'marks', 'negative_mark', 'options', 'correct_answer'])
        writer.writerows(rows)
        uploaded_file = SimpleUploadedFile(
            'questions.csv',
            csv_file.getvalue().encode('utf-8'),
            content_type='text/csv',
        )
        self.client.force_login(self.admin)

        return self.client.post(
            reverse('admin_bulk_upload_questions', kwargs={'exam_id': self.exam.id}),
            {'file': uploaded_file},
        )

    def test_bulk_upload_accepts_csv_fields_larger_than_default_parser_limit(self):
        correct_answer = 'x' * 140_000
        response = self.upload_csv_rows([[
            'Choose the complete correct statement.',
            'MCQ',
            '2',
            '0',
            json.dumps([correct_answer, 'Other option']),
            correct_answer,
        ]])

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['status'], 'success')
        question = ExamQuestion.objects.get(exam=self.exam)
        self.assertEqual(question.correct_answer, correct_answer)

    def test_bulk_upload_processes_more_than_one_insert_batch(self):
        rows = [
            [f'Question {index}', 'MCQ', '1', '0', '["A","B"]', 'A']
            for index in range(501)
        ]

        response = self.upload_csv_rows(rows)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(ExamQuestion.objects.filter(exam=self.exam).count(), 501)

    def test_bulk_upload_rolls_back_prior_batches_when_later_row_is_invalid(self):
        rows = [
            [f'Question {index}', 'MCQ', '1', '0', '["A","B"]', 'A']
            for index in range(500)
        ]
        rows.append(['Invalid question', 'MCQ', 'not-a-number', '0', '["A","B"]', 'A'])

        response = self.upload_csv_rows(rows)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error_count'], 1)
        self.assertEqual(ExamQuestion.objects.filter(exam=self.exam).count(), 0)

    def test_admin_can_add_code_question_with_empty_test_case_input(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            reverse('admin_add_question', kwargs={'exam_id': self.exam.id}),
            {
                'question_text': 'Print the number three.',
                'type': 'Code',
                'section_tag': '',
                'marks': '1',
                'negative_mark': '0',
                'options': '[]',
                'correct_answer': '',
                'test_cases': json.dumps([{'input': '', 'output': '3'}]),
                'input_example': '',
                'expected_output': '',
                'expected_keywords': '[]',
                'min_characters': '0',
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['status'], 'success')
        question = ExamQuestion.objects.get(exam=self.exam)
        self.assertEqual(question.test_cases[0]['input'], '')
        self.assertEqual(question.test_cases[0]['output'], '3')
