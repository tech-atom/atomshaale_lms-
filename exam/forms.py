# exam/forms.py

import json
from datetime import timedelta
from django import forms
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import Exam, ExamQuestion, ScheduledExam


class ExamForm(forms.ModelForm):

    class Meta:
        model = Exam
        fields = [
            "title",
            "passing_marks",
            "max_marks",
            "domain",
            "duration_minutes",
            "questions_to_display",
        ]


# -------------------------------------------------------------------
# Exam Question Form
# -------------------------------------------------------------------

class ExamQuestionForm(forms.ModelForm):

    class Meta:
        model = ExamQuestion
        exclude = ["exam"]

    def clean(self):
        cleaned = super().clean()

        qtype = cleaned.get("type")
        marks = cleaned.get("marks")
        neg = cleaned.get("negative_mark", 0)

        # -------------------------------
        # Marks validation
        # -------------------------------
        if marks is not None and marks <= 0:
            raise ValidationError("Marks must be a positive number.")

        if neg is not None and neg < 0:
            raise ValidationError("Negative marks cannot be negative.")

        # -------------------------------
        # MCQ validation
        # -------------------------------
        if qtype == "MCQ":
            opts = cleaned.get("options") or []

            if len(opts) < 2:
                raise ValidationError("MCQ must have at least 2 options.")

            ca = cleaned.get("correct_answer")

            if ca not in opts:
                raise ValidationError("Correct answer must be one of the options.")

        # -------------------------------
        # True / False validation
        # -------------------------------
        elif qtype == "TF":

            ca = cleaned.get("correct_answer")

            if ca not in ["True", "False"]:
                raise ValidationError(
                    "Correct answer for True/False must be True or False."
                )

        # -------------------------------
        # Coding validation
        # -------------------------------
        elif qtype == "Code":

            tc = cleaned.get("test_cases") or []

            if len(tc) < 1:
                raise ValidationError("Add at least 1 test case for Coding question.")

            # Auto-calculate and set the total question marks as the sum of test case marks
            total_tc_marks = sum(float(x.get("marks", 0)) for x in tc)
            cleaned["marks"] = total_tc_marks

        # -------------------------------
        # Descriptive validation
        # -------------------------------
        elif qtype == "DESC":

            kws = cleaned.get("expected_keywords") or []

            if len(kws) < 1:
                raise ValidationError("Add at least 1 keyword for Descriptive question.")

            min_chars = cleaned.get("min_characters")

            if min_chars is None or min_chars < 1:
                raise ValidationError(
                    "Minimum characters must be a positive integer."
                )

        return cleaned


    # ------------------------------------------------------------
    # Clean options JSON
    # ------------------------------------------------------------
    def clean_options(self):

        opts = self.cleaned_data.get("options")

        if isinstance(opts, str):
            try:
                opts = json.loads(opts)
            except Exception:
                raise ValidationError("Options must be a valid JSON list.")

        if not isinstance(opts, list):
            raise ValidationError("Options must be a list.")

        return opts

    # ------------------------------------------------------------
    # Clean coding test cases
    # ------------------------------------------------------------
    def clean_test_cases(self):

        qtype = self.cleaned_data.get("type")

        if qtype != "Code":
            return []

        tcs = self.cleaned_data.get("test_cases")

        if isinstance(tcs, str):
            try:
                tcs = json.loads(tcs)
            except Exception:
                raise ValidationError("Test cases must be a valid JSON list.")

        if not isinstance(tcs, list):
            raise ValidationError("Test cases must be a list.")

        # Compute original max ID to avoid reuse of deleted IDs
        original_tcs = []
        if self.instance and self.instance.pk:
            original_tcs = self.instance.test_cases or []
            if not isinstance(original_tcs, list):
                original_tcs = []

        max_id = 0
        for tc in original_tcs:
            if isinstance(tc, dict) and tc.get("id"):
                try:
                    max_id = max(max_id, int(tc["id"]))
                except (ValueError, TypeError):
                    pass

        # Assign stable IDs to test cases
        cleaned_tcs = []
        for tc in tcs:
            if not isinstance(tc, dict):
                continue
            tc_id = tc.get("id")
            if tc_id is not None and str(tc_id).strip() != "":
                try:
                    tc_id = int(tc_id)
                except (ValueError, TypeError):
                    max_id += 1
                    tc_id = max_id
            else:
                max_id += 1
                tc_id = max_id

            cleaned_tcs.append({
                "id": tc_id,
                "input": str(tc.get("input", "")),
                "output": str(tc.get("output", tc.get("expected_output", ""))),
                "marks": float(tc.get("marks") if tc.get("marks") is not None else 2.0),
                "is_sample": bool(tc.get("is_sample", False))
            })

        return cleaned_tcs

    # ------------------------------------------------------------
    # Clean descriptive keywords
    # ------------------------------------------------------------
    def clean_expected_keywords(self):

        qtype = self.cleaned_data.get("type")

        if qtype != "DESC":
            return []

        kws = self.cleaned_data.get("expected_keywords")

        if isinstance(kws, str):
            try:
                kws = json.loads(kws)
            except Exception:
                kws = [k.strip() for k in kws.split(",") if k.strip()]

        if not isinstance(kws, list):
            raise ValidationError("Expected keywords must be a list.")

        return kws


# -------------------------------------------------------------------
# Schedule Exam Form
# -------------------------------------------------------------------

class ScheduleExamForm(forms.ModelForm):

    class Meta:
        model = ScheduledExam
        fields = [
            "college",
            "course",
            "section",   # now treated as text
            "semester",
            "year",
            "start_datetime",
            "end_datetime",
            "status",
            "allowed_tab_switches",
            "random_question_count",
            "live_exam_monitor",
            "monitor_trainers",
            "monitor_tpos",
        ]

    def __init__(self, *args, **kwargs):

        super().__init__(*args, **kwargs)

        # Section is optional (NULL means all sections)
        self.fields["section"].required = False

        # Random question count is optional
        self.fields["random_question_count"].required = False

        # Monitor trainers and TPOs are optional
        self.fields["monitor_trainers"].required = False
        self.fields["monitor_tpos"].required = False

        # Default status
        if "status" not in self.initial and not self.instance.pk:
            self.initial["status"] = "pending"

        self.fields["allowed_tab_switches"].required = True
        self.fields["allowed_tab_switches"].min_value = 1

    def clean(self):

        cleaned = super().clean()

        start = cleaned.get("start_datetime")
        end = cleaned.get("end_datetime")

        # ------------------------------------------------
        # Validate start and end time
        # ------------------------------------------------
        if start and end:

            if start >= end:
                raise ValidationError("End time must be after start time.")

        # ------------------------------------------------
        # Prevent scheduling in the past
        # ------------------------------------------------
        # datetime-local inputs are minute-granular; allow a tiny buffer
        # so users are not blocked by second-level drift.
        if start and start < (timezone.now() - timedelta(minutes=1)):

            raise ValidationError(
                "Exam cannot be scheduled in the past."
            )

        return cleaned