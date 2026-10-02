from django.db import models
from material.models import Domain
from college.models import College, Course
from student.models import StudentProfile
import uuid

# Create your models here.
class PracticeTest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    passing_marks = models.FloatField()
    max_marks = models.FloatField()
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    duration_minutes = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

class PracticeQuestion(models.Model):
    QUESTION_TYPES = [
        ('MCQ', 'MCQ'),
        ('TF', 'TrueFalse'),
        ('DESC', 'Descriptive'),
        ('CODE', 'Coding')
    ]
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE)
    question_text = models.TextField()
    type = models.CharField(max_length=10, choices=QUESTION_TYPES)
    marks = models.FloatField()
    negative_mark = models.FloatField(default=0)
    # For MCQ / TF
    options = models.JSONField(blank=True, null=True)
    correct_answer = models.CharField(max_length=100, blank=True, null=True)
    
    # For Coding
    input_example = models.TextField(blank=True, null=True)
    expected_output = models.TextField(blank=True, null=True)
    test_cases = models.JSONField(blank=True, null=True)
    
    # For Descriptive / Coding
    expected_keywords = models.JSONField(blank=True, null=True) 
    min_characters = models.IntegerField(blank=True, null=True)
    # Added image upload option for all question types
    image = models.ImageField(upload_to='practice_questions/', blank=True, null=True)


class PracticeResult(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.SET_NULL, null=True, db_index=True)
    practice_title = models.CharField(max_length=255) 
    total_marks = models.FloatField()
    marks_obtained = models.FloatField()
    attempted_questions = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)
    wrong_answers = models.IntegerField(default=0)
    question_wise_breakdown = models.JSONField()
    time_taken = models.DurationField(null=True, blank=True, help_text="Total time taken by the student")
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['student', 'submitted_at']),
        ]
    
    def save(self, *args, **kwargs):
        if self.practice_test and not self.practice_title:
            self.practice_title = self.practice_test.title
        super().save(*args, **kwargs)

class ScheduledPracticeTest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE, related_name="schedules")
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('practice_test', 'college', 'course', 'semester', 'year')

    def __str__(self):
        return f"{self.practice_test.title} | {self.college.name} | {self.course.name} | Sem {self.semester}, Year {self.year}"