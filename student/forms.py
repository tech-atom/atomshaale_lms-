# student/forms.py
from django import forms
from student.models import StudentFeedback, SessionTrainerFeedback, StudentProfile
from django.forms import modelformset_factory

# OK Custom star rating widget
class StarRadioSelect(forms.RadioSelect):
    template_name = 'star_radio.html'

class StudentFeedbackForm(forms.ModelForm):
    class Meta:
        model = StudentFeedback
        fields = [
            "content_rating",
            "session_engagement",
            "future_interest",
            "objectives_clarity",
            "structure_logic",
            "satisfaction",
            "takeaways",
        ]
        widgets = {
            "content_rating": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
            "objectives_clarity": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
            "structure_logic": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
            "satisfaction": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
            "takeaways": forms.Textarea(attrs={"maxlength": 1000, "rows": 3}),
        }

class SessionTrainerFeedbackForm(forms.ModelForm):
    trainer_name = forms.CharField(
        label="Trainer Name",
        required=False,
        disabled=True,
        widget=forms.TextInput(attrs={"readonly": True, "class": "trainer-readonly"}),
    )

    class Meta:
        model = SessionTrainerFeedback
        fields = [
            "trainer_name",
            "pace_rating",
            "knowledge_rating",
            "participation",
            "examples",
            "queries_rating",
        ]
        widgets = {
            "pace_rating": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
            "knowledge_rating": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
            "queries_rating": StarRadioSelect(choices=[(i, str(i)) for i in range(1, 6)]),
        }

# OK Create formset factory for multiple trainers
SessionTrainerFeedbackFormSet = modelformset_factory(
    SessionTrainerFeedback,
    form=SessionTrainerFeedbackForm,
    extra=0,
    can_delete=False,
)

# ============================================
# Student Profile Update Form
# ============================================



class StudentProfileUpdateForm(forms.ModelForm):

    class Meta:
        model = StudentProfile
        fields = [
            "usn",
            "college",
            "course",
            "section",
            "year",
            "semester",
            "resume",
        ]

    def clean_usn(self):
        return self.cleaned_data["usn"].strip().upper()