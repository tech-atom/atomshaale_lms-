#users/forms.py
import datetime
from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.forms import SetPasswordForm
from django.core.exceptions import ValidationError
from users.utils import send_password_reset_email
import re

#from users.utils import send_password_reset_email  # assuming your function is here

class CustomPasswordResetForm(PasswordResetForm):
    def send_mail(self, subject_template_name, email_template_name, context,
                  from_email, to_email, html_email_template_name=None):
        user = context['user']
        uid = context['uid']
        token = context['token']
        domain = context['domain']
        protocol = context['protocol']

        send_password_reset_email(user, uid, token, domain, protocol)


User = get_user_model()

class UserLoginForm(forms.Form):
    email = forms.EmailField(required=True)
    password = forms.CharField(widget=forms.PasswordInput, required=True)

    def clean(self):
        cleaned_data = super().clean()
        email = cleaned_data.get("email")
        password = cleaned_data.get("password")

        if email and password:
            if User.objects.filter(email=email).exists():
                user = authenticate(email=email, password=password)
                if user is None:
                    self.add_error('password', 'Invalid email or password.')
        return cleaned_data

    def clean_email(self):
        email = self.cleaned_data.get('email')
        if not User.objects.filter(email=email).exists():
            raise forms.ValidationError("This email is not registered.")
        return email


class CustomSetPasswordForm(SetPasswordForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["new_password1"].widget.attrs.update({
            "class": "verify-input",
            "placeholder": "Enter new password",
            "autocomplete": "new-password",
        })
        self.fields["new_password2"].widget.attrs.update({
            "class": "verify-input",
            "placeholder": "Confirm new password",
            "autocomplete": "new-password",
        })

    def clean_new_password1(self):
        password = self.cleaned_data.get("new_password1")
        if not password:
            return password

        if len(password) < 8:
            raise ValidationError("Password must be at least 8 characters long.")
        if not re.search(r"[A-Z]", password):
            raise ValidationError("Password must include at least one uppercase letter.")
        if not re.search(r"[a-z]", password):
            raise ValidationError("Password must include at least one lowercase letter.")
        if not re.search(r"\d", password):
            raise ValidationError("Password must include at least one number.")
        if not re.search(r"[^A-Za-z0-9]", password):
            raise ValidationError("Password must include at least one special character.")

        return password


class StudentRegistrationForm(forms.Form):
    # User Fields
    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={
            'placeholder': 'Enter your email address',
            'class': 'form-control'
        })
    )
    first_name = forms.CharField(
        required=True,
        max_length=150,
        widget=forms.TextInput(attrs={
            'placeholder': 'Enter your full name',
            'class': 'form-control',
            'pattern': '^[a-zA-Z\\s]+$',
            'title': 'Name must contain only alphabetic characters and spaces.'
        })
    )
    mobile_number = forms.CharField(
        required=True,
        widget=forms.TextInput(attrs={
            'placeholder': '+91 XXXXX XXXXX',
            'class': 'form-control'
        })
    )
    gender = forms.ChoiceField(
        required=True,
        choices=[('Male', 'Male'), ('Female', 'Female'), ('NA', 'Prefer Not to Say')],
        widget=forms.Select(attrs={
            'class': 'form-control'
        })
    )

    # Student Profile Fields
    usn = forms.CharField(
        required=True,
        max_length=20,
        label='USN (University Seat Number)',
        widget=forms.TextInput(attrs={
            'placeholder': 'e.g., 1BM18CS001',
            'class': 'form-control'
        })
    )
    college = forms.ModelChoiceField(
        required=True,
        queryset=None,
        widget=forms.Select(attrs={
            'class': 'form-control'
        })
    )
    course = forms.ModelChoiceField(
        required=True,
        queryset=None,
        widget=forms.Select(attrs={
            'class': 'form-control'
        })
    )
    section = forms.ModelChoiceField(
        required=True,
        queryset=None,
        widget=forms.Select(attrs={
            'class': 'form-control'
        })
    )
    semester = forms.IntegerField(
        required=True,
        min_value=1,
        max_value=8,
        widget=forms.Select(
            choices=[(i, str(i)) for i in range(1, 9)],
            attrs={'class': 'form-control'}
        )
    )
    year = forms.IntegerField(
        required=True,
        min_value=1,
        max_value=4,
        widget=forms.Select(
            choices=[(i, str(i)) for i in range(1, 5)],
            attrs={'class': 'form-control'}
        )
    )
    batch_year = forms.IntegerField(
        required=True,
        label='Batch Year',
        help_text='Academic intake year (e.g. 2024, 2025)',
        widget=forms.Select(
            choices=[(y, str(y)) for y in range(2021, datetime.date.today().year + 2)],
            attrs={'class': 'form-control'}
        ),
        initial=datetime.date.today().year
    )

    def __init__(self, *args, **kwargs):
        from college.models import College, Course, Section
        super().__init__(*args, **kwargs)

        # Set querysets for foreign key fields
        self.fields['college'].queryset = College.objects.all()
        self.fields['course'].queryset = Course.objects.all()
        self.fields['section'].queryset = Section.objects.all()

        # Make all fields required
        for field_name, field in self.fields.items():
            field.required = True

    def clean_email(self):
        email = self.cleaned_data.get('email')
        if not email:
            return email
        email = email.strip().lower()
        if not email.endswith('@gmail.com'):
            raise forms.ValidationError("Email address must end with @gmail.com")
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError("This email is already registered.")
        return email

    def clean_first_name(self):
        first_name = self.cleaned_data.get('first_name')
        if first_name:
            import re
            first_name = first_name.strip()
            if not re.match(r'^[a-zA-Z\s]+$', first_name):
                raise forms.ValidationError("Name must contain only alphabetic characters and spaces.")
        return first_name

    def clean_usn(self):
        usn = self.cleaned_data.get('usn')
        if usn:
            usn = usn.strip().upper()
        return usn

    def clean(self):
        cleaned_data = super().clean()
        email = cleaned_data.get('email')
        mobile_number = cleaned_data.get('mobile_number')

        # Validate mobile number format (basic validation)
        if mobile_number:
            # Remove spaces and hyphens
            mobile_clean = mobile_number.replace(' ', '').replace('-', '')
            if not mobile_clean.startswith('+'):
                mobile_clean = '+91' + mobile_clean if len(mobile_clean) == 10 else mobile_clean

            # Validate it's a proper phone number
            try:
                from phonenumbers import parse, is_valid_number
                parsed = parse(mobile_clean, 'IN')
                if not is_valid_number(parsed):
                    raise forms.ValidationError("Please enter a valid phone number.")
            except Exception:
                raise forms.ValidationError("Please enter a valid phone number in format +91 XXXXX XXXXX")

        # Validate college/course/section mapping
        college = cleaned_data.get('college')
        course = cleaned_data.get('course')
        section = cleaned_data.get('section')

        if college and course:
            from college.models import CollegeCourse
            if not CollegeCourse.objects.filter(college=college, course=course).exists():
                raise forms.ValidationError("The selected course is not offered by the selected college.")

        if college and course and section:
            from college.models import CollegeCourseSection
            if not CollegeCourseSection.objects.filter(
                college_course__college=college,
                college_course__course=course,
                section=section
            ).exists():
                raise forms.ValidationError("The selected section is not available for this course in the selected college.")

        return cleaned_data

    def save(self):
        from student.models import StudentProfile

        # Create User
        user = User.objects.create_user(
            email=self.cleaned_data['email'],
            first_name=self.cleaned_data['first_name'],
            mobile_number=self.cleaned_data['mobile_number'],
            gender=self.cleaned_data['gender'],
            role='student',
            is_active=False,
            is_verified=False
        )
        user.set_password(None)
        user.save()

        # Create StudentProfile
        student_profile = StudentProfile.objects.create(
            user=user,
            usn=self.cleaned_data['usn'],
            college=self.cleaned_data['college'],
            course=self.cleaned_data['course'],
            section=self.cleaned_data['section'],
            semester=self.cleaned_data['semester'],
            year=self.cleaned_data['year'],
            batch_year=self.cleaned_data['batch_year'],
            is_current=True
        )

        return user, student_profile

