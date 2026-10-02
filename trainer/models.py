import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from users.models import User
from material.models import Domain, SubDomain
from college.models import College, Course , Section
from student.models import Section, StudentProfile



# OK DO NOT import SessionSchedule directly (use lazy string)
# from admin_panel.models import SessionSchedule

class TrainerProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'trainer'},
        primary_key=True
    )
    skill_summary = models.CharField(max_length=100)
    profile_pdf = models.FileField(upload_to='trainer_profiles/pdfs/', blank=True, null=True)

    def __str__(self):
        return self.user.first_name

    @property
    def domains(self):
        return Domain.objects.filter(trainer_skills__trainer=self).distinct()

    def subdomains_for(self, domain):
        return SubDomain.objects.filter(
            trainer_skills__trainer=self,
            trainer_skills__domain=domain
        )


class TrainerSkill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trainer = models.ForeignKey(TrainerProfile, on_delete=models.CASCADE, related_name='trainer_skills')
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    subdomain = models.ForeignKey(SubDomain, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        unique_together = (('trainer', 'domain', 'subdomain'),)
        verbose_name = 'Trainer Skill'
        verbose_name_plural = 'Trainer Skills'

    def clean(self):
        if self.subdomain and self.subdomain.domain != self.domain:
            raise ValidationError("Subdomain must belong to the selected Domain.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        if self.subdomain:
            return f"{self.trainer.user.first_name}: {self.domain} / {self.subdomain}"
        return f"{self.trainer.user.first_name}: {self.domain}"


# Attendance Record

class AttendanceRecord(models.Model):
    session = models.ForeignKey(
        'admin_panel.SessionSchedule',  # OK Lazy reference
        on_delete=models.CASCADE,
        related_name='records',
        db_index=True
    )
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, db_index=True)
    status = models.CharField(max_length=10, choices=[('Present', 'Present'), ('Absent', 'Absent')])

    class Meta:
        unique_together = ('session', 'student')
        indexes = [models.Index(fields=['session', 'student'])]


# Trainer_Daily_Report


class TrainerSessionReport(models.Model):
    trainer = models.ForeignKey(TrainerProfile, on_delete=models.CASCADE)
    date = models.DateField()
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    semester = models.IntegerField()
    year = models.IntegerField()
    section = models.ForeignKey(Section, on_delete=models.CASCADE, null=True, blank=True)
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    subdomain = models.ForeignKey(SubDomain, on_delete=models.CASCADE, null=True, blank=True)
    module = models.CharField(max_length=200)
    total_students = models.PositiveIntegerField()
    present_students = models.PositiveIntegerField()
    absent_students = models.PositiveIntegerField()
    exercises_solved = models.CharField(max_length=10, choices=[('Yes', 'Yes'), ('No', 'No')])
    materials_shared = models.CharField(max_length=10, choices=[('Yes', 'Yes'), ('No', 'No')])
    assignments_given = models.CharField(max_length=10, choices=[('Yes', 'Yes'), ('No', 'No')])
    best_performer = models.CharField(max_length=100, blank=True, null=True)
    summary = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.trainer.user.full_name} | {self.date} | {self.module}"

