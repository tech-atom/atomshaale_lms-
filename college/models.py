from django.db import models
import uuid
from phonenumber_field.modelfields import PhoneNumberField
from django.utils import timezone


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
    name = models.CharField(primary_key=True, max_length=10, unique=True)   
    
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
            self.name = self.name.strip().title()  
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# Student Group Access (Pause/Resume) Model
class StudentGroupAccess(models.Model):
    """
    Tracks whether a specific student batch
    (College + Year + Semester + Section + Course + BatchYear)
    is paused or active. When paused, students in that batch cannot log in.

    batch_year: the academic intake year (e.g. 2024, 2025).
    Each intake year is an independent batch, so pausing Batch 2024
    never affects Batch 2025 students in the same slot.
    """
    college    = models.ForeignKey(College, on_delete=models.CASCADE, related_name='group_access')
    year       = models.IntegerField()
    semester   = models.IntegerField()
    section    = models.ForeignKey(Section, on_delete=models.CASCADE)
    course     = models.ForeignKey(Course, on_delete=models.CASCADE)
    batch_year = models.IntegerField(default=2024)  # academic intake year
    is_paused  = models.BooleanField(default=False)
    paused_at  = models.DateTimeField(null=True, blank=True)
    paused_by  = models.CharField(max_length=150, null=True, blank=True)

    class Meta:
        unique_together = ('college', 'year', 'semester', 'section', 'course', 'batch_year')

    def __str__(self):
        state = 'PAUSED' if self.is_paused else 'ACTIVE'
        return (
            f"{self.college} Y{self.year}S{self.semester} "
            f"{self.section} {self.course} Batch-{self.batch_year} — {state}"
        )

    @classmethod
    def is_group_paused(cls, college_id, year, semester, section_name, course_name, batch_year):
        """
        Returns True if the specified batch is currently paused.

        batch_year: the student's academic intake year (StudentProfile.batch_year).
        Each batch is a separate record, so pausing one batch never blocks another.
        """
        if not section_name or not course_name:
            return False
        try:
            obj = cls.objects.get(
                college_id=college_id,
                year=year,
                semester=semester,
                section__name=section_name,
                course__name=course_name,
                batch_year=batch_year,
            )
            return obj.is_paused
        except cls.DoesNotExist:
            return False  # No record = active by default


class CollegeCourse(models.Model):
    college = models.ForeignKey(College, on_delete=models.CASCADE, related_name='college_courses')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='college_courses')

    class Meta:
        unique_together = ('college', 'course')

    def __str__(self):
        return f"{self.college} - {self.course}"


class CollegeCourseSection(models.Model):
    college_course = models.ForeignKey(CollegeCourse, on_delete=models.CASCADE, related_name='sections')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='college_course_sections')

    class Meta:
        unique_together = ('college_course', 'section')

    def __str__(self):
        return f"{self.college_course} - Section {self.section}"