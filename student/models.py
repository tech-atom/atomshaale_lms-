from django.db import models
from users.models import User
from college.models import College, Course, Section
import uuid
import datetime
from django.db import transaction
from django.conf import settings


# OK students/models.py
class StudentProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'student'})
    usn = models.CharField(max_length=20)
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.SET_NULL, null=True, blank=True)
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True, blank=True)
    semester   = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year       = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    batch_year = models.IntegerField(
        default=datetime.date.today().year,
        db_index=True,
        help_text="Academic intake year (e.g. 2024, 2025). Used to separate batches for pause/resume."
    )
    resume = models.FileField(upload_to='resumes/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_current = models.BooleanField(default=True)
    
    def save(self, *args, **kwargs):
        self.full_clean()
        with transaction.atomic():
            if self.is_current:
                StudentProfile.objects.filter(user=self.user, is_current=True).exclude(pk=self.pk).update(is_current=False)
            super().save(*args, **kwargs)

    def clean(self):
        self.usn = self.usn.strip().upper()

    class Meta:
        unique_together = ('usn', 'college', 'course', 'year', 'semester')

    def __str__(self):
        return f"{self.user.first_name} - {self.usn} - {self.college} - Y{self.year}S{self.semester}"


RATING_CHOICES = [(i, str(i)) for i in range(1, 6)]
FREQUENCY_CHOICES = [
    ('Always', 'Always'),
    ('Sometimes', 'Sometimes'),
    ('Never', 'Never'),
]
ENGAGEMENT_CHOICES = [
    ('Very engaging and interactive', 'Very engaging and interactive'),
    ('Somewhat engaging', 'Somewhat engaging'),
    ('Neutral', 'Neutral'),
    ('Boring and unengaging', 'Boring and unengaging'),
]
FUTURE_INTEREST_CHOICES = [
    ('Yes, definitely', 'Yes, definitely'),
    ('Yes, possibly', 'Yes, possibly'),
    ('Maybe', 'Maybe'),
    ('No', 'No'),
]
PARTICIPATION_CHOICES = [
    ("Always", "Always"),
    ("Often", "Often"),
    ("Rarely", "Rarely"),
    ("Never", "Never"),
]
EXAMPLES_CHOICES = [
    ("Very Clear and Practical", "Very Clear and Practical"),
    ("Somewhat Clear", "Somewhat Clear"),
    ("Confusing at times", "Confusing at times"),
    ("Not clear", "Not clear"),
]

#------ Feedback Models -------#

class StudentFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, db_index=True)
    date = models.DateField(db_index=True)
    content_rating = models.PositiveSmallIntegerField(choices=RATING_CHOICES)
    session_engagement = models.CharField(max_length=40, choices=ENGAGEMENT_CHOICES)
    future_interest = models.CharField(max_length=20, choices=FUTURE_INTEREST_CHOICES)
    objectives_clarity = models.PositiveSmallIntegerField(choices=RATING_CHOICES)
    structure_logic = models.PositiveSmallIntegerField(choices=RATING_CHOICES)
    satisfaction = models.PositiveSmallIntegerField(choices=RATING_CHOICES)
    takeaways = models.TextField(max_length=1000)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'date')
        ordering = ['-date']

    def __str__(self):
        return f"{self.student.user.first_name} - {self.date}"

class SessionTrainerFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    feedback = models.ForeignKey(StudentFeedback, related_name="trainer_feedbacks", on_delete=models.CASCADE)
    session = models.ForeignKey("admin_panel.SessionSchedule", on_delete=models.CASCADE)
    trainer = models.ForeignKey("trainer.TrainerProfile", on_delete=models.CASCADE)

    pace_rating = models.PositiveSmallIntegerField(choices=RATING_CHOICES)       # Q3 (1-5)
    knowledge_rating = models.PositiveSmallIntegerField(choices=RATING_CHOICES)  # Q7 (1-5)
    participation = models.CharField(max_length=10, choices=PARTICIPATION_CHOICES)   # Q8
    examples = models.CharField(max_length=30, choices=EXAMPLES_CHOICES)             # Q9
    queries_rating = models.PositiveSmallIntegerField(choices=RATING_CHOICES)    # Q10 (1-5)

    class Meta:
        unique_together = ('feedback', 'session', 'trainer')

    def __str__(self):
        return f"{self.trainer.user.first_name} - {self.session.date} (Slot {self.session.slot_no})" 


from django.db.models.signals import post_delete
from django.dispatch import receiver

@receiver(post_delete, sender=StudentProfile)
def delete_student_user(sender, instance, **kwargs):
    if instance.user_id:
        User.objects.filter(id=instance.user_id).delete()
 