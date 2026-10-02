from django.db import models
import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone

# Import related models from other apps
from college.models import College, Course, Section
from material.models import Domain, SubDomain, Module
from trainer.models import TrainerProfile
from student.models import Section, Course

# Create your models here.
class SessionSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField()
    slot_no = models.IntegerField(choices=[(i, str(i)) for i in range(1, 4)])  # 1, 2, 3
    section=models.ForeignKey(Section,on_delete=models.CASCADE)
    course=models.ForeignKey(Course,on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)],db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    domain = models.ForeignKey(Domain,on_delete=models.CASCADE)
    subdomain=models.ForeignKey(SubDomain,on_delete=models.CASCADE,blank=True, null=True,)
    module = models.ForeignKey(Module, on_delete=models.SET_NULL, blank=True, null=True)
    trainer = models.ForeignKey(TrainerProfile,on_delete=models.SET_NULL,null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    done=models.BooleanField(default=False)

    class Meta:
       constraints = [
           models.UniqueConstraint(
               fields=['date', 'slot_no', 'section', 'course', 'semester', 'college'],
               name='unique_session_schedule'
           ),
           models.UniqueConstraint(
               fields=['date', 'slot_no', 'trainer'],
               name='unique_trainer_schedule'
           )
       ]

    def __str__(self):
        trainer_name = self.trainer.user.full_name if self.trainer else "No Trainer Assigned"
        return f"{self.date} | Slot {self.slot_no} | {self.domain.domain_name} | {self.section.name} | {self.course.name} | {self.college.college_name} | {trainer_name}"
    
    def clean(self):
        if self.date < timezone.now().date():
            raise ValidationError("Session date cannot be in the past.")
        

        