import uuid
from django.db import models
from college.models import College, Course  # OK Corrected
from users.models import  User  # OK Corrected
from material.models import Domain  # if your Domain model is here
from student.models import Section, StudentProfile  # OK Corrected
from trainer.models import TrainerProfile
from tpo.models import TpoProfile

# Create your models here.
# exam/models.py
#EXAM part
class Exam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    passing_marks=models.FloatField()
    max_marks=models.FloatField()
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    duration_minutes = models.IntegerField()
    questions_to_display = models.PositiveIntegerField(
        default=0,
        help_text="Number of questions to display to each student (0 = all questions in pool)"
    )
    coding_duration_minutes = models.IntegerField(default=0, help_text='Duration for Coding section in minutes')
    mcq_duration_minutes = models.IntegerField(default=0, help_text='Duration for MCQ section in minutes')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class ExamQuestion(models.Model):
    QUESTION_TYPES = [
        ('MCQ', 'MCQ'),
        ('TF', 'TrueFalse'),
        ('Code', 'Coding'),
        ('DESC', 'Descriptive')
    ]
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    question_text = models.TextField()
    type = models.CharField(max_length=10, choices=QUESTION_TYPES)
    section_tag = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Example: Python, C, Java, GK"
    )
    marks = models.FloatField()
    negative_mark = models.FloatField(default=0)

    # Optional image (not important)
    image = models.ImageField(upload_to='exam_questions/', blank=True, null=True)

    # For MCQ / TF
    options = models.JSONField(blank=True, null=True)
    correct_answer = models.CharField(max_length=100, blank=True, null=True)

    # For Coding
    input_example = models.TextField(blank=True, null=True)
    expected_output = models.TextField(blank=True, null=True)
    test_cases = models.JSONField(blank=True, null=True)

    # For Descriptive
    expected_keywords = models.JSONField(blank=True, null=True)
    min_characters = models.IntegerField(blank=True, null=True)



class ScheduledExam(models.Model):

    STATUS_TYPES = [
        ("started", "started"),
        ("completed", "completed"),
        ("pending", "pending")
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="schedules")

    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)

    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    section = models.CharField(max_length=255, blank=True, null=True)

    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()

    status = models.CharField(max_length=15, choices=STATUS_TYPES)

    # NEW FIELD
    require_attendance = models.BooleanField(
        default=False,
        help_text="Allow exam only for students marked Present in training attendance."
    )

    result_released = models.BooleanField(
        default=False,
        help_text="If true, students can view results immediately after submission."
    )

    allowed_tab_switches = models.PositiveIntegerField(
        default=3,
        help_text="Maximum tab switches allowed before auto-submit."
    )

    random_question_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of random questions to schedule for each student (leave blank to use exam setting)"
    )

    live_exam_monitor = models.BooleanField(
        default=False,
        help_text="Enable live exam monitoring for trainers and TPO."
    )

    monitor_trainers = models.ManyToManyField(
        TrainerProfile,
        blank=True,
        related_name='monitored_exams',
        help_text="Select trainers who can monitor this exam."
    )

    monitor_tpos = models.ManyToManyField(
        TpoProfile,
        blank=True,
        related_name='monitored_exams',
        help_text="Select TPO who can monitor this exam."
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_datetime']

    def __str__(self):
        return f"{self.exam.title} | {self.college.name} | {self.course.name} | Sem {self.semester}, Year {self.year}"

class ExamResult(models.Model):
    SUBMISSION_STATUS = [
        ('not_started', 'Not Started'),
        ('active', 'Active'),
        ('in_progress', 'In Progress'),
        ('suspicious', 'Suspicious'),
        ('submitted', 'Submitted'),
        ('accidental_submit', 'Accidental Submit'),
        ('retake_allowed', 'Retake Allowed'),
        ('retaken', 'Retaken'),
    ]

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, null=True, blank=True)
    exam = models.ForeignKey(Exam, on_delete=models.SET_NULL, null=True, db_index=True)
    scheduled_exam = models.ForeignKey(ScheduledExam, on_delete=models.SET_NULL, null=True, blank=True, db_index=True, help_text="The specific scheduled exam instance")
    pre_assessment = models.ForeignKey('pre_assessment.PreAssessmentExam', on_delete=models.SET_NULL, null=True, blank=True, related_name='results')
    candidate_name = models.CharField(max_length=255, null=True, blank=True)
    candidate_email = models.EmailField(null=True, blank=True)
    candidate_phone = models.CharField(max_length=20, null=True, blank=True)
    candidate_usn = models.CharField(max_length=50, null=True, blank=True)
    candidate_course = models.CharField(max_length=100, null=True, blank=True)
    candidate_year = models.IntegerField(null=True, blank=True)
    candidate_sem = models.IntegerField(null=True, blank=True)
    candidate_college = models.CharField(max_length=255, null=True, blank=True)
    exam_title = models.CharField(max_length=255)
    total_marks = models.FloatField()
    marks_obtained = models.FloatField()
    attempted_questions = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)
    wrong_answers = models.IntegerField(default=0)
    question_wise_breakdown = models.JSONField()  # [{question_id, student_answer, correct, marks_awarded}]
    time_taken = models.DurationField(null=True, blank=True, help_text="Total time taken by the student")
    submitted_at = models.DateTimeField(auto_now_add=True)

    # OK NEW FIELDS FOR MONITORING & RETAKE
    submission_status = models.CharField(
        max_length=20,
        choices=SUBMISSION_STATUS,
        default='submitted',
        help_text="Track submission status: accidental submit, retake allowed, etc."
    )
    is_monitored = models.BooleanField(
        default=False,
        help_text="True if admin is monitoring this student's exam"
    )
    allow_retake = models.BooleanField(
        default=False,
        help_text="If True, student can retake the exam"
    )
    retake_reason = models.TextField(
        blank=True,
        null=True,
        help_text="Reason why admin allowed retake (e.g., accidental submit)"
    )
    retake_allowed_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp when admin allowed retake"
    )
    retake_allowed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='retakes_allowed',
        help_text="Admin who allowed the retake"
    )
    is_retaken_result = models.BooleanField(
        default=False,
        help_text="True if this is a retake result"
    )
    current_question = models.IntegerField(
        default=1,
        help_text="Latest question number student is viewing during exam"
    )
    question_time_map = models.JSONField(
        default=dict,
        blank=True,
        help_text="Per-question time spent in seconds, keyed by question number"
    )
    tab_switch_count = models.IntegerField(
        default=0,
        help_text="Number of tab switches detected during this exam attempt"
    )
    live_status = models.CharField(
        max_length=30,
        default="not_started",
        help_text="Realtime monitoring state from student heartbeat"
    )
    last_active_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last heartbeat from student exam page"
    )
    original_result = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='retake_results',
        help_text="Link to original result if this is a retake"
    )
    coding_started_at = models.DateTimeField(blank=True, help_text='When the student started the Coding section', null=True)
    current_section = models.CharField(default='all', help_text="Active section: 'mcq', 'coding', or 'all'", max_length=20)
    mcq_started_at = models.DateTimeField(blank=True, help_text='When the student started the MCQ section', null=True)
    mcq_submitted = models.BooleanField(default=False, help_text='True if student has submitted MCQ section')
    device_session_token = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Unique token to identify the active device session to prevent multiple logins taking the exam concurrently."
    )
    selected_question_ids = models.JSONField(
        blank=True,
        null=True,
        help_text="List of question IDs assigned to this student for this attempt"
    )

    def save(self, *args, **kwargs):
        if self.exam and not self.exam_title:
            self.exam_title = self.exam.title
        super().save(*args, **kwargs)


