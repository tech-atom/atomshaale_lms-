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
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.exam.title} ({self.code})"
