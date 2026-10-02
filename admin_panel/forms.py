import pandas as pd
from django import forms
from django.db import transaction
from django.core.exceptions import ValidationError

from users.models import User
from users.utils import send_verification_email
from student.models import StudentProfile
from college.models import College, Course, Section
from trainer.models import TrainerProfile, TrainerSkill
from material.models import Domain, SubDomain
from tpo.models import TpoProfile

from django.forms import TextInput, Select, ClearableFileInput

class BootstrapFormMixin:
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            widget = field.widget
            if isinstance(widget, (TextInput, forms.EmailInput, forms.NumberInput)):
                widget.attrs.update({'class': 'form-control'})
            elif isinstance(widget, (forms.Select, forms.SelectMultiple)):
                widget.attrs.update({'class': 'form-select'})
            elif isinstance(widget, ClearableFileInput):
                widget.attrs.update({'class': 'form-control'})



# ──────────────────────────────────────────────────────────────────────────────
# Single Student registration with atomic rollback & duplicate-profile check
# ──────────────────────────────────────────────────────────────────────────────
class StudentRegistrationForm(BootstrapFormMixin,forms.ModelForm):
    usn            = forms.CharField(max_length=20)
    college        = forms.ModelChoiceField(queryset=College.objects.all())
    course         = forms.ModelChoiceField(queryset=Course.objects.all())
    section        = forms.ModelChoiceField(queryset=Section.objects.all())
    semester       = forms.ChoiceField(choices=[(i,i) for i in range(1,13)])
    year           = forms.ChoiceField(choices=[(i,i) for i in range(1,6)])

    class Meta:
        model  = User
        fields = ['first_name','email','mobile_number','gender']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.visible_fields():
            css = 'form-select' if field.field.widget.__class__.__name__ == 'Select' else 'form-control'
            field.field.widget.attrs.update({'class': css})

    def clean(self):
        data = super().clean()
        email    = data.get('email')
        college  = data.get('college')
        course   = data.get('course')
        semester = data.get('semester')
        year     = data.get('year')
        usn      = data.get('usn', '').strip().upper()

        # normalize USN
        data['usn'] = usn

        # duplicate student-profile check
        if email and college and course and semester and year:
            existing = StudentProfile.objects.filter(
                user__email=email,
                college=college,
                course=course,
                semester=semester,
                year=year
            )
            if existing.exists():
                raise ValidationError(
                    "A student with these same details already exists."
                )
        return data

    def save(self, request, commit=True):
        with transaction.atomic():
            user = User.objects.create_user(
                email=self.cleaned_data['email'],
                password=None,
                first_name=self.cleaned_data['first_name'],
                mobile_number=self.cleaned_data['mobile_number'],
                gender=self.cleaned_data['gender'],
                role='student',
                is_active=False
            )
            StudentProfile.objects.create(
                user=user,
                usn=self.cleaned_data['usn'],
                college=self.cleaned_data['college'],
                course=self.cleaned_data['course'],
                section=self.cleaned_data['section'],
                semester=self.cleaned_data['semester'],
                year=self.cleaned_data['year']
            )
            send_verification_email(request, user)
        return user


# ──────────────────────────────────────────────────────────────────────────────
# Bulk student upload WITH gender & mobile_number + error reporting
# ──────────────────────────────────────────────────────────────────────────────
class BulkStudentUploadForm(BootstrapFormMixin,forms.Form):
    excel_file = forms.FileField(
        help_text=(
            "Upload an .xlsx or .xls with columns: "
            "first_name,email,usn,college,course,section,semester,year,gender,mobile_number"
        )
    )
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.visible_fields():
            css = 'form-select' if field.field.widget.__class__.__name__ == 'Select' else 'form-control'
            field.field.widget.attrs.update({'class': css})
    def clean_excel_file(self):
        f = self.cleaned_data['excel_file']
        if not f.name.lower().endswith(('.xlsx', '.xls')):
            raise ValidationError("Please upload a valid Excel file (.xlsx or .xls).")
        return f

    def process(self, request):
        # 1) Read & normalize headers
        df = pd.read_excel(self.cleaned_data['excel_file'])
        df.columns = [c.strip().lower().replace(' ', '_') for c in df.columns]

        # 2) Coerce phone numbers & genders to strings
        df['mobile_number'] = df.get('mobile_number', '').fillna('').apply(lambda x: str(x).strip().rstrip('.0'))
        df['gender']        = df.get('gender', '').fillna('').apply(lambda x: str(x).strip())

        created, failed = [], []

        for idx, row in enumerate(df.to_dict(orient='records'), start=2):
            first_name    = row.get('first_name', '').strip()
            email         = row.get('email', '').strip()
            mobile_number = row.get('mobile_number', '').strip()
            gender        = row.get('gender', '').strip()
            usn           = row.get('usn', '').strip().upper()

            # Quick row‐level sanity checks
            if not (first_name and email):
                failed.append({'row': idx, 'email': email, 'error': 'Missing first_name or email'})
                continue
            if not mobile_number:
                failed.append({'row': idx, 'email': email, 'error': 'Missing mobile_number'})
                continue

            # 3) Lookup college/course/section case‐insensitively
            try:
                college = College.objects.get(name__iexact=row.get('college','').strip())
                course  = Course.objects.get(name__iexact=row.get('course','').strip())
                section = Section.objects.get(name__iexact=row.get('section','').strip())
            except College.DoesNotExist:
                failed.append({'row': idx, 'email': email, 'error': 'Unknown college'})
                continue
            except Course.DoesNotExist:
                failed.append({'row': idx, 'email': email, 'error': 'Unknown course'})
                continue
            except Section.DoesNotExist:
                failed.append({'row': idx, 'email': email, 'error': 'Unknown section'})
                continue

            # 4) Try to create (with atomic rollback)
            try:
                with transaction.atomic():
                    if User.objects.filter(email=email).exists():
                        user = User.objects.get(email=email)
                    else:
                        user = User.objects.create_user(
                            email=email,
                            password=None,
                            first_name=first_name,
                            mobile_number=mobile_number,
                            gender=gender,
                            role='student',
                            is_active=False
                        )
                        send_verification_email(request, user)

                    # demote existing student profile
                    StudentProfile.objects.filter(user=user, is_current=True).update(is_current=False)

                    # duplicate‐profile check
                    dup = StudentProfile.objects.filter(
                        user=user, college=college,
                        course=course, semester=row.get('semester'),
                        year=row.get('year')
                    )
                    if dup.exists():
                        raise ValidationError("Duplicate profile for same semester & course")

                    StudentProfile.objects.create(
                        user=user, usn=usn,
                        college=college, course=course,
                        section=section,
                        semester=row.get('semester'),
                        year=row.get('year')
                    )

                created.append(email)

            except ValidationError as ve:
                failed.append({'row': idx, 'email': email, 'error': ve.message})
            except Exception as e:
                failed.append({'row': idx, 'email': email, 'error': str(e)})

        return created, failed



# ──────────────────────────────────────────────────────────────────────────────
# Single Trainer registration with atomic rollback
# ──────────────────────────────────────────────────────────────────────────────
class TrainerRegistrationForm(BootstrapFormMixin,forms.ModelForm):
    skill_summary = forms.CharField(
        max_length=100,
        label="Skill Summary",
        help_text="Brief summary of your main skills or specialties"
    )
    profile_pdf = forms.FileField(
        required=False,
        label="Upload Profile PDF",
        help_text="Optional detailed CV in PDF"
    )
    domains = forms.ModelMultipleChoiceField(
        queryset=Domain.objects.all(),
        label="Domains",
        help_text="Select one or more Domains"
    )
    subdomains = forms.ModelMultipleChoiceField(
        queryset=SubDomain.objects.all(),
        required=False,
        label="SubDomains",
        help_text="Select any SubDomains (auto-matched to Domains below)"
    )

    class Meta:
        model = User
        fields = ['first_name', 'email', 'mobile_number', 'gender']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.visible_fields():
            css = 'form-select' if field.field.widget.__class__.__name__ == 'Select' else 'form-control'
            field.field.widget.attrs.update({'class': css})
    def save(self, request, commit=True):
        with transaction.atomic():
            user = User.objects.create_user(
                email=self.cleaned_data['email'],
                password=None,
                first_name=self.cleaned_data['first_name'],
                mobile_number=self.cleaned_data['mobile_number'],
                gender=self.cleaned_data['gender'],
                role='trainer',
                is_active=False
            )
            profile = TrainerProfile.objects.create(
                user=user,
                skill_summary=self.cleaned_data['skill_summary'],
                profile_pdf=self.cleaned_data.get('profile_pdf')
            )
            domains = self.cleaned_data['domains']
            subdomains = self.cleaned_data['subdomains']
            for domain in domains:
                matched = [sd for sd in subdomains if sd.domain_id == domain.id]
                if matched:
                    for sd in matched:
                        TrainerSkill.objects.create(
                            trainer=profile,
                            domain=domain,
                            subdomain=sd
                        )
                else:
                    TrainerSkill.objects.create(
                        trainer=profile,
                        domain=domain,
                        subdomain=None
                    )
            send_verification_email(request, user)
        return user


# ──────────────────────────────────────────────────────────────────────────────
# Single TPO registration with atomic rollback
# ──────────────────────────────────────────────────────────────────────────────
class TpoRegistrationForm(BootstrapFormMixin,forms.ModelForm):
    college = forms.ModelChoiceField(queryset=College.objects.all())

    class Meta:
        model  = User
        fields = ['first_name','email','mobile_number','gender']
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.visible_fields():
            css = 'form-select' if field.field.widget.__class__.__name__ == 'Select' else 'form-control'
            field.field.widget.attrs.update({'class': css})
    def save(self, request, commit=True):
        with transaction.atomic():
            user = User.objects.create_user(
                email=self.cleaned_data['email'],
                password=None,
                first_name=self.cleaned_data['first_name'],
                mobile_number=self.cleaned_data['mobile_number'],
                gender=self.cleaned_data['gender'],
                role='tpo',
                is_active=False
            )
            TpoProfile.objects.create(user=user, college=self.cleaned_data['college'])
            send_verification_email(request, user)
        return user


# ──────────────────────────────────────────────────────────────────────────────
# Student Editing Form
# ──────────────────────────────────────────────────────────────────────────────
class StudentEditForm(BootstrapFormMixin, forms.ModelForm):
    usn        = forms.CharField(max_length=20)
    college    = forms.ModelChoiceField(queryset=College.objects.all())
    course     = forms.ModelChoiceField(queryset=Course.objects.all())
    section    = forms.ModelChoiceField(queryset=Section.objects.all())
    semester   = forms.ChoiceField(choices=[(i, i) for i in range(1, 13)])
    year       = forms.ChoiceField(choices=[(i, i) for i in range(1, 6)])
    batch_year = forms.IntegerField()

    class Meta:
        model  = User
        fields = ['first_name', 'email', 'mobile_number', 'gender']

    def __init__(self, *args, student_profile=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.student_profile = student_profile
        if student_profile:
            self.fields['usn'].initial = student_profile.usn
            self.fields['college'].initial = student_profile.college
            self.fields['course'].initial = student_profile.course
            self.fields['section'].initial = student_profile.section
            self.fields['semester'].initial = student_profile.semester
            self.fields['year'].initial = student_profile.year
            self.fields['batch_year'].initial = student_profile.batch_year
        for field in self.visible_fields():
            css = 'form-select' if field.field.widget.__class__.__name__ == 'Select' else 'form-control'
            field.field.widget.attrs.update({'class': css})

    def clean_first_name(self):
        first_name = self.cleaned_data.get('first_name')
        if first_name:
            import re
            first_name = first_name.strip()
            if not re.match(r'^[a-zA-Z\s]+$', first_name):
                raise ValidationError("Name must contain only alphabetic characters and spaces.")
        return first_name

    def clean_email(self):
        email = self.cleaned_data.get('email')
        if email:
            email = email.strip().lower()
            user_query = User.objects.filter(email=email)
            if self.instance and self.instance.pk:
                user_query = user_query.exclude(pk=self.instance.pk)
            if user_query.exists():
                raise ValidationError("A user with this email already exists.")
        return email

    def clean(self):
        cleaned_data = super().clean()
        college = cleaned_data.get('college')
        course = cleaned_data.get('course')
        section = cleaned_data.get('section')

        if college and course:
            from college.models import CollegeCourse
            if not CollegeCourse.objects.filter(college=college, course=course).exists():
                raise ValidationError("The selected course is not offered by the selected college.")

        if college and course and section:
            from college.models import CollegeCourseSection
            if not CollegeCourseSection.objects.filter(
                college_course__college=college,
                college_course__course=course,
                section=section
            ).exists():
                raise ValidationError("The selected section is not available for this course in the selected college.")

        return cleaned_data

    def save(self, commit=True):
        user = super().save(commit=commit)
        if self.student_profile:
            self.student_profile.usn = self.cleaned_data['usn']
            self.student_profile.college = self.cleaned_data['college']
            self.student_profile.course = self.cleaned_data['course']
            self.student_profile.section = self.cleaned_data['section']
            self.student_profile.semester = self.cleaned_data['semester']
            self.student_profile.year = self.cleaned_data['year']
            self.student_profile.batch_year = self.cleaned_data['batch_year']
            if commit:
                self.student_profile.save()
        return user, self.student_profile

