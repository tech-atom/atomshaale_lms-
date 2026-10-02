from django.db import models
from student.models import StudentProfile
import uuid

class Company(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    logo = models.ImageField(upload_to='company_logos/', blank=True, null=True, help_text="Upload Company Logo")
    year = models.IntegerField(default=2024, blank=True, null=True)
    package = models.CharField(max_length=50, blank=True, null=True, default="N/A") # e.g. "12 LPA", "4.5 LPA"
    job_role = models.CharField(max_length=150, blank=True, null=True, default="General") # e.g. "Associate Software Engineer"
    place = models.CharField(max_length=150, blank=True, null=True, default="N/A") # e.g. "Bengaluru", "Pune"
    selection_process = models.TextField(blank=True, null=True, default="Round 1: Aptitude -> Round 2: Technical & Coding") # e.g. "Round 1: Aptitude, Round 2: Technical"
    expected_interview_date = models.DateField(blank=True, null=True)
    skills_required = models.JSONField(default=list, blank=True) # e.g. ["Java", "Python", "SQL"]
    hr_interview_required = models.BooleanField(default=False, help_text="Specify if Round 3 (AI Video Interview) is required for this company")
    previous_papers = models.FileField(upload_to='company_papers/', blank=True, null=True, help_text="Upload previous year question papers for students to download")
    technical_round_format = models.CharField(max_length=20, default='MCQ', choices=[('MCQ', 'MCQ Only'), ('Compiler', 'Compiler Sandbox Only')], help_text="Select format for Round 2 Technical Assessment")
    test_duration_minutes = models.IntegerField(default=15, help_text="Test duration in minutes for company exams")
    college = models.ForeignKey('college.College', on_delete=models.SET_NULL, null=True, blank=True, related_name='company_preps')
    start_datetime = models.DateTimeField(null=True, blank=True)
    end_datetime = models.DateTimeField(null=True, blank=True)

    # Round 1 - Aptitude config fields
    round1_active = models.BooleanField(default=True)
    round1_name = models.CharField(max_length=150, default="Quantitative, Logical & Verbal Aptitude")
    round1_duration = models.IntegerField(default=30)
    round1_questions = models.IntegerField(default=30)
    round1_passing_pct = models.IntegerField(default=60)

    # Round 2 - Technical config fields
    round2_active = models.BooleanField(default=True)
    round2_name = models.CharField(max_length=150, default="Technical Assessment")
    round2_technical_format = models.CharField(max_length=20, default='MCQ', choices=[('MCQ', 'MCQ Only'), ('Coding', 'Coding Only'), ('MCQ_Coding', 'MCQ + Coding')])
    round2_duration = models.IntegerField(default=60)
    round2_questions = models.IntegerField(default=40)
    round2_passing_pct = models.IntegerField(default=60)

    # Target Audience & Schedule settings
    course = models.ForeignKey('college.Course', on_delete=models.SET_NULL, null=True, blank=True, related_name='company_preps_course')
    semester = models.IntegerField(null=True, blank=True)
    section = models.ForeignKey('college.Section', on_delete=models.SET_NULL, null=True, blank=True, related_name='company_preps_section')
    max_attempts = models.IntegerField(default=1)
    shuffle_questions = models.BooleanField(default=False)
    shuffle_options = models.BooleanField(default=False)
    negative_marking = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name

class CompanyQuestionPaper(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='question_papers')
    year = models.IntegerField(default=2024)
    selection_process = models.TextField(blank=True, null=True, default="Round 1: Aptitude -> Round 2: Technical & Coding")
    technical_round_format = models.CharField(max_length=20, default='MCQ', choices=[('MCQ', 'MCQ Only'), ('Compiler', 'Compiler Sandbox Only')])
    paper_file = models.FileField(upload_to='company_papers/', blank=True, null=True, help_text="Upload question paper file")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-year']

    def __str__(self):
        return f"{self.company.name} ({self.year}) Paper"

class CompanyAptitudeQuestion(models.Model):
    TOPICS = [
        ('Quantitative Aptitude', 'Quantitative Aptitude'),
        ('Logical Reasoning', 'Logical Reasoning'),
        ('Verbal Ability', 'Verbal Ability'),
        ('Data Interpretation', 'Data Interpretation'),
    ]
    DIFFICULTY_CHOICES = [
        ('Easy', 'Easy'),
        ('Medium', 'Medium'),
        ('Hard', 'Hard'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='aptitude_questions')
    topic = models.CharField(max_length=100, choices=TOPICS)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES)
    question_text = models.TextField()
    options = models.JSONField() # List of strings e.g. ["A", "B", "C", "D"]
    correct_answer = models.CharField(max_length=255) # Value matching one of the options
    explanation = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to='company_questions/', blank=True, null=True)
    type = models.CharField(max_length=10, default='MCQ', choices=[('MCQ', 'MCQ'), ('TF', 'TrueFalse')])

    def __str__(self):
        return f"{self.topic} ({self.difficulty}) - {self.question_text[:50]}"

class CompanyTechnicalQuestion(models.Model):
    BRANCH_CHOICES = [
        ('CSE', 'CSE'),
        ('ECE', 'ECE'),
        ('Mechanical', 'Mechanical'),
        ('Civil', 'Civil'),
        ('MBA', 'MBA'),
    ]
    QUESTION_TYPES = [
        ('MCQ', 'MCQ'),
        ('Code', 'Code'),
        ('TF', 'TrueFalse'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='technical_questions')
    branch = models.CharField(max_length=20, choices=BRANCH_CHOICES)
    topic = models.CharField(max_length=100) # e.g. "DSA", "Embedded Systems", "Kaizen"
    type = models.CharField(max_length=10, choices=QUESTION_TYPES, default='MCQ')
    question_text = models.TextField()
    options = models.JSONField(null=True, blank=True) # List of strings e.g. ["A", "B", "C", "D"]
    correct_answer = models.CharField(max_length=255, null=True, blank=True)
    explanation = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to='company_questions/', blank=True, null=True)

    # For Coding Sandbox
    input_example = models.TextField(blank=True, null=True)
    expected_output = models.TextField(blank=True, null=True)
    test_cases = models.JSONField(blank=True, null=True)

    def __str__(self):
        return f"{self.branch} ({self.topic}) - {self.question_text[:50]}"

class StudentCompanyProgress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='company_progress')
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    overall_progress = models.IntegerField(default=0) # 0-100%
    resume_match = models.IntegerField(default=0) # 0-100%
    placement_readiness = models.IntegerField(default=0) # 0-100%
    aptitude_score = models.IntegerField(default=0)
    technical_score = models.IntegerField(default=0)
    communication_score = models.IntegerField(default=0)
    mock_interview_score = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('student', 'company')

    def __str__(self):
        return f"{self.student.user.first_name} - {self.company.name} Progress"

class StudentPrepAttempt(models.Model):
    ROUND_TYPES = [
        ('Aptitude', 'Aptitude'),
        ('Technical', 'Technical'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    round_type = models.CharField(max_length=20, choices=ROUND_TYPES)
    score = models.IntegerField() # e.g. 87
    details = models.JSONField(default=dict) # e.g. {"weak_areas": ["Probability", "Time & Work"], "correct_count": 8, "total_count": 10}
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.user.first_name} - {self.company.name} {self.round_type} Attempt"

class AIInterviewAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    overall_score = models.IntegerField(default=0) # 0-100
    confidence = models.IntegerField(default=0) # 0-100
    communication = models.IntegerField(default=0) # 0-100
    eye_contact = models.IntegerField(default=0) # 0-100
    grammar = models.IntegerField(default=0) # 0-100
    recommendation = models.CharField(max_length=150) # e.g. "Likely to Clear HR Round"
    feedback_details = models.JSONField(default=dict) # List of Q&A + feedback suggestions
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.user.first_name} - {self.company.name} AI Interview"
