# OK users/models.py
import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from django.core.exceptions import ValidationError
from phonenumber_field.modelfields import PhoneNumberField
from django.db import transaction
from .managers import CustomUserManager

class User(AbstractUser):
    username = None  # disable default username
    ROLE_CHOICES = [('admin', 'Admin'), ('student', 'Student'), ('trainer', 'Trainer'), ('tpo', 'TPO')]
    GENDER_CHOICES=[('Male','Male'),('Female','Female'),('NA','Perfer Not to Say')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    #full_name = models.CharField(max_length=100)    we are using first_name
    email = models.EmailField(unique=True)
    mobile_number = PhoneNumberField(region='IN')
    gender=models.CharField(max_length=10,choices=GENDER_CHOICES)
    updated_at = models.DateTimeField(auto_now=True)
    is_verified = models.BooleanField(default=False)

    #created_at = models.DateTimeField(auto_now_add=True) we are using date_joined

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name','role','mobile_number','gender']
    
    objects = CustomUserManager()

    def __str__(self):
        return f"{self.first_name} ({self.email})"

# Course Model
class Course(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def save(self, *args, **kwargs):
        # Clean and standardize the course name
        self.name = self.name.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

# Section Model
class Section(models.Model):    
    name = models.CharField(primary_key=True, max_length=4)   
    
    def save(self, *args, **kwargs):
        # Clean and standardize the section name
        self.name = self.name.strip().upper()
        super().save(*args, **kwargs)
        
    def __str__(self):
        return self.name

# College Model
class College(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    address = models.TextField(null=True, blank=True)
    contact_email = models.EmailField(null=True, blank=True)
    contact_number = PhoneNumberField(region='IN', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        if self.name:
            self.name = self.name.strip().title()  # or .upper() if preferred
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
class Domain(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    domain_name = models.CharField(max_length=50, unique=True)

    def save(self, *args, **kwargs):
        self.domain_name = self.domain_name.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.domain_name

class SubDomain(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="subdomains")
    subdomain_name = models.CharField(max_length=100,unique=True)

    class Meta:
        unique_together = ('domain', 'subdomain_name')

    def save(self, *args, **kwargs):
        self.subdomain_name = self.subdomain_name.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.subdomain_name} ({self.domain.domain_name})"

class Module(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module_name = models.CharField(max_length=150)
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    subdomain=models.ForeignKey(SubDomain,on_delete=models.SET_NULL,null=True,blank=True)

    class Meta:
        unique_together = ('module_name', 'domain','subdomain')

    def save(self, *args, **kwargs):
        self.module_name = self.module_name.strip().title()
        super().save(*args, **kwargs)
    
    def clean(self):
        if self.domain.domain_name == "Technical Skills" and not self.subdomain:
            raise ValidationError("Subdomain is required for Technical Domain.")


    def __str__(self):
        return f"{self.module_name} ({self.domain.domain_name})"

# OK materials/models.py
class Material(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField()
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    module = models.ForeignKey(Module, on_delete=models.CASCADE)
    subdomain=models.ForeignKey(SubDomain,on_delete=models.SET_NULL,null=True,blank=True)
    video_file = models.FileField(upload_to='materials/videos/', blank=True, null=True)
    video_url = models.URLField(blank=True, null=True) 
    material_pdf = models.FileField(upload_to='materials/docs/')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class ScheduledMaterial(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name="schedules")
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    section=models.ForeignKey(Section,on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('material', 'college', 'course', 'section','semester', 'year')
    
    def clean(self):
        if self.end_datetime <= self.start_datetime:
            raise ValidationError("End datetime must be after start datetime.")

    def __str__(self):
        return f"{self.material.title} | {self.college.college_name} | {self.course.course} | Sem {self.semester}, Year {self.year}"
    
# OK students/models.py
class StudentProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, limit_choices_to={'role': 'student'})
    usn = models.CharField(max_length=20)
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    section = models.ForeignKey(Section, on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    resume = models.FileField(upload_to='resumes/', blank=True, null=True)
    #resume_two_page = models.FileField(upload_to='resumes/two_page', blank=True, null=True)
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

# OK trainers/models.py
class TrainerProfile(models.Model):
    user = models.OneToOneField(User,on_delete=models.CASCADE,limit_choices_to={'role': 'trainer'},primary_key=True)
    # a free-text summary of skills or specialties
    skill_summary = models.CharField(max_length=100)
    profile_pdf = models.FileField(upload_to='trainer_profiles/pdfs/',blank=True,null=True)

    def __str__(self):
        return self.user.first_name

    @property
    def domains(self):
        """List of unique Domains this trainer has."""
        return Domain.objects.filter(trainer_skills__trainer=self).distinct()

    def subdomains_for(self, domain):
        """List of SubDomains under a given Domain for this trainer."""
        return SubDomain.objects.filter(
            trainer_skills__trainer=self,
            trainer_skills__domain=domain
        )


class TrainerSkill(models.Model):
    """
    Relational link: one or more entries per trainer,
    each linking a Domain and optionally a SubDomain.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trainer = models.ForeignKey(
        TrainerProfile,
        on_delete=models.CASCADE,
        related_name='trainer_skills'
    )
    domain = models.ForeignKey(
        Domain,
        on_delete=models.CASCADE
    )
    subdomain = models.ForeignKey(
        SubDomain,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Leave blank if this is a domain-only skill"
    )

    class Meta:
        unique_together = (
            ('trainer', 'domain', 'subdomain'),
        )
        verbose_name = 'Trainer Skill'
        verbose_name_plural = 'Trainer Skills'

    def clean(self):
        # ensure subdomain belongs to the chosen domain
        if self.subdomain and self.subdomain.domain_id != self.domain_id:
            raise ValidationError(
                "Subdomain must belong to the selected Domain."
            )

    def save(self, *args, **kwargs):
        # full_clean ensures `clean()` is run before saving
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        if self.subdomain:
            return f"{self.trainer.user.first_name}: {self.domain} / {self.subdomain}"
        return f"{self.trainer.user.first_name}: {self.domain}"


class TpoProfile(models.Model):
    user = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, limit_choices_to={'role': 'tpo'})
    college = models.ForeignKey(College, on_delete=models.CASCADE)

    def __str__(self):
        return self.user.first_name

# OK registrations/models.py
class PendingRegistration(models.Model):
    usn = models.CharField(max_length=20)
    email = models.EmailField(unique=True)
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)])
    course=models.ForeignKey(Course,on_delete=models.CASCADE)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    created_at = models.DateTimeField(auto_now_add=True)

class SessionSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField()
    slot_no = models.IntegerField(choices=[(i, str(i)) for i in range(1, 4)])  # 1, 2, 3
    Section=models.ForeignKey(Section,on_delete=models.CASCADE)
    course=models.ForeignKey(Course,on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)],db_index=True)
    college=models.ForeignKey(College,on_delete=models.CASCADE)
    domain = models.ForeignKey(Domain,on_delete=models.CASCADE)
    subdomain=models.ForeignKey(SubDomain,on_delete=models.CASCADE,blank=True)
    trainer = models.ForeignKey(TrainerProfile,on_delete=models.SET_NULL,null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    done=models.BooleanField(default=False)

    class Meta:
       constraints = [
           models.UniqueConstraint(
               fields=['date', 'slot_no', 'Section', 'course', 'semester', 'college'],
               name='unique_session_schedule'
           ),
           models.UniqueConstraint(
               fields=['date', 'slot_no', 'trainer'],
               name='unique_trainer_schedule'
           )
       ]

    def __str__(self):
        trainer_name = self.trainer.user.full_name if self.trainer else "No Trainer Assigned"
        return f"{self.date} | Slot {self.slot_no} | {self.domain.domain_name} | {self.Section.name} | {self.course.course} | {self.college.college_name} | {trainer_name}"
    
    def clean(self):
        if self.date < timezone.now().date():
            raise ValidationError("Session date cannot be in the past.")

class TrainerDailyReport(models.Model):
    session= models.OneToOneField(SessionSchedule,on_delete=models.CASCADE,primary_key=True)
    report = models.JSONField()

    

class AttendanceRecord(models.Model):
    session = models.ForeignKey(SessionSchedule, on_delete=models.CASCADE, related_name='records',db_index=True)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE,db_index='True')
    status = models.CharField(max_length=10, choices=[('Present', 'Present'), ('Absent', 'Absent')])

    class Meta:
        unique_together = ('session', 'student')
        index_together = [('session', 'student')] 

class StudentFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)    
    student = models.ForeignKey(StudentProfile, on_delete=models.SET_NULL,null=True)
    trainer = models.ForeignKey(TrainerProfile, on_delete=models.CASCADE)
    session = models.ForeignKey(SessionSchedule, on_delete=models.CASCADE)  # slot-specific
    module_flow=models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    organized=models.CharField(
        max_length=20,
        choices=[('Always','Always'),('Sometimes','Sometimes'),('Never','Never')]
    )
    content_satisfied=models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    # trainer Ratings
    communication = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    confidence_expertise = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])    
    learning_objectives = models.CharField(
        max_length=20,
        choices=[('Always', 'Always'), ('Sometimes', 'Sometimes'), ('Never', 'Never')],
        blank=True,null=True
    )
    methodology = models.CharField(
        max_length=20,
        choices=[('Always', 'Always'), ('Sometimes', 'Sometimes'), ('Never', 'Never')],
        blank=True,null=True
    )
    participation = models.CharField(
        max_length=20,
        choices=[('Always', 'Always'), ('Sometimes', 'Sometimes'), ('Never', 'Never')],
        blank=True,null=True
    )
    approachable = models.CharField(
        max_length=20,
        choices=[('Always', 'Always'), ('Sometimes', 'Sometimes'), ('Never', 'Never')],
        blank=True,null=True
        
    )
    session_satisfied=models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    job_relevant=models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    takeaways=models.TextField(max_length=1000)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'trainer', 'session')

    def __str__(self):
        return f"{self.student.usn} | {self.trainer.full_name}  "
#EXAM part
class Exam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    passing_marks=models.FloatField()
    max_marks=models.FloatField()
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    duration_minutes = models.IntegerField()
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
    marks = models.FloatField()
    negative_mark = models.FloatField(default=0)
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
    STATUS_TYPES=[
        ("started","started"),
        ("completed","completed"),
        ("pending","pending")
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="schedules")
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    section = models.ForeignKey(Section,on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    status=models.CharField(max_length=15,choices=STATUS_TYPES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('exam', 'college', 'course', 'semester', 'year')

    def __str__(self):
        return f"{self.exam.title} | {self.college.college_name} | {self.course.course} | Sem {self.semester}, Year {self.year}"

class ExamResult(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.SET_NULL, null=True, db_index=True)
    exam_title = models.CharField(max_length=255) 
    total_marks = models.FloatField()
    marks_obtained = models.FloatField()
    attempted_questions = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)
    wrong_answers = models.IntegerField(default=0)
    question_wise_breakdown = models.JSONField()  # [{question_id, student_answer, correct, marks_awarded}]
    submitted_at = models.DateTimeField(auto_now_add=True)
    def save(self, *args, **kwargs):
        if self.exam and not self.exam_title:
            self.exam_title = self.exam.title
        super().save(*args, **kwargs)

#practice test
class PracticeTest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    passing_marks=models.FloatField()
    max_marks=models.FloatField()
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    duration_minutes = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

class PracticeQuestion(models.Model):
    QUESTION_TYPES = [
        ('MCQ', 'MCQ'),
        ('TF', 'TrueFalse'),
        ('DESC', 'Descriptive') 
    ]
    practice_test = models.ForeignKey(PracticeTest, on_delete=models.CASCADE)
    question_text = models.TextField()
    type = models.CharField(max_length=10, choices=QUESTION_TYPES)
    marks = models.FloatField()
    negative_mark = models.FloatField(default=0)
    # For MCQ / TF
    options = models.JSONField(blank=True, null=True)
    correct_answer = models.CharField(max_length=100, blank=True, null=True)
    # For Descriptive
    expected_keywords = models.JSONField(blank=True, null=True) 
    min_characters = models.IntegerField(blank=True, null=True)

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
    submitted_at = models.DateTimeField(auto_now_add=True)
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
        return f"{self.practice_test.title} | {self.college.college_name} | {self.course.course} | Sem {self.semester}, Year {self.year}"