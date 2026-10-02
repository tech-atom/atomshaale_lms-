# practicetest/forms.py
from django import forms
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import PracticeTest, ScheduledPracticeTest


class PracticeTestChoiceField(forms.ModelChoiceField):
    """
    Show the PracticeTest.title as the <option> label while keeping the value as the UUID.
    """

    def label_from_instance(self, obj):
        # Return human-readable title. You can add more info here if needed.
        return f"{obj.title}"


class PracticeTestForm(forms.ModelForm):
    class Meta:
        model = PracticeTest
        fields = ["title", "domain", "passing_marks", "max_marks", "duration_minutes"]

    def clean_duration_minutes(self):
        v = self.cleaned_data.get("duration_minutes")
        if v in (None, ""):
            raise ValidationError("Duration (minutes) is required.")
        try:
            v = int(v)
        except (TypeError, ValueError):
            raise ValidationError("Duration (minutes) must be an integer.")
        if v <= 0:
            raise ValidationError("Duration must be > 0.")
        return v


class SchedulePracticeTestForm(forms.ModelForm):
    # override the practice_test field to show human-readable titles in the select box
    practice_test = PracticeTestChoiceField(queryset=PracticeTest.objects.all())

    start_datetime = forms.DateTimeField(
        widget=forms.DateTimeInput(attrs={"type": "datetime-local"}),
        input_formats=["%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"],
    )
    end_datetime = forms.DateTimeField(
        widget=forms.DateTimeInput(attrs={"type": "datetime-local"}),
        input_formats=["%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"],
    )

    class Meta:
        model = ScheduledPracticeTest
        fields = [
            "practice_test",
            "college",
            "course",
            "semester",
            "year",
            "start_datetime",
            "end_datetime",
        ]

    def clean(self):
        cleaned = super().clean()
        practice_test = cleaned.get("practice_test")
        start = cleaned.get("start_datetime")
        end = cleaned.get("end_datetime")

        # Make naive datetimes timezone-aware if necessary (optional)
        # Only run this if you use USE_TZ=True and want server timezone-awareness:
        try:
            from django.utils import timezone as dj_tz
            if start and dj_tz.is_naive(start):
                cleaned["start_datetime"] = dj_tz.make_aware(start, dj_tz.get_current_timezone())
                start = cleaned["start_datetime"]
            if end and dj_tz.is_naive(end):
                cleaned["end_datetime"] = dj_tz.make_aware(end, dj_tz.get_current_timezone())
                end = cleaned["end_datetime"]
        except Exception:
            # keep original values if timezone conversion fails for any reason
            pass

        if start and end and end <= start:
            self.add_error("end_datetime", "End must be after start.")

        # Prevent assigning tests that students cannot attempt.
        if practice_test and not practice_test.practicequestion_set.exists():
            self.add_error("practice_test", "Selected test has no questions. Add at least one question before scheduling.")
        return cleaned
