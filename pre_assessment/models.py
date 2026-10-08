import uuid
from django.db import models
from django.contrib.auth import get_user_model
from exam.models import Exam

User = get_user_model()

class PreAssessmentExam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='pre_assessments')
    code = models.CharField(max_length=20, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    start_datetime = models.DateTimeField(null=True, blank=True, help_text="Assessment start date and time")
    end_datetime = models.DateTimeField(null=True, blank=True, help_text="Assessment end date and time")
    allowed_tab_switches = models.PositiveIntegerField(default=3, help_text="Maximum allowed tab switches before auto-submit")
    registration_fields = models.JSONField(default=dict, blank=True, help_text="Custom candidate registration form fields configuration")
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.exam.title} ({self.code})"
