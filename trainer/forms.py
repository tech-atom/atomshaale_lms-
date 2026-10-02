from django import forms
from .models import TrainerProfile

class TrainerProfileForm(forms.ModelForm):
    class Meta:
        model = TrainerProfile
        fields = ['skill_summary', 'profile_pdf']
        widgets = {
            'skill_summary': forms.TextInput(attrs={'class': 'form-control'}),
        }
