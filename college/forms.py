# college/forms.py
from django import forms
from .models import College, Course, Section

class CollegeForm(forms.ModelForm):
    class Meta:
        model = College
        fields = ['name', 'contact_email', 'contact_number', 'address']
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': 'College Name'}),
            'contact_email': forms.EmailInput(attrs={'placeholder': 'Email'}),
            'contact_number': forms.TextInput(attrs={'placeholder': 'Phone'}),
            'address': forms.Textarea(attrs={'placeholder': 'Address', 'rows': 2}),
        }

class CourseForm(forms.ModelForm):
    class Meta:
        model = Course
        fields = ['name']
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': 'Course Name', 'maxlength': 50}),
        }

    def clean_name(self):
        # normalize: trim and uppercase (your model.save also does this; keeping here avoids duplicates with whitespace)
        name = self.cleaned_data.get('name', '') or ''
        return name.strip().upper()

class SectionForm(forms.ModelForm):
    class Meta:
        model = Section
        fields = ['name']
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': 'Section Name', 'maxlength': 10}),
        }

    def clean_name(self):
        # normalize: trim and uppercase (your model.save also does this; keeping here avoids duplicates with whitespace)
        name = self.cleaned_data.get('name', '') or ''
        return name.strip().upper()