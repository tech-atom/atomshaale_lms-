import csv
import io
import json
from uuid import UUID
from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction
from django.db.models import Max, Avg
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.views.decorators.http import require_http_methods, require_POST
from urllib.parse import unquote
from django.utils import timezone
from practicetest.models import ScheduledPracticeTest
from student.models import StudentProfile
from .models import ( 
    PracticeQuestion,
    PracticeResult,
    PracticeTest,
    ScheduledPracticeTest,  # keep if your project has it
)
from .forms import PracticeTestForm, SchedulePracticeTestForm

# Import compile function from exam
from exam.views import compile_code_exam, evaluate_code_with_test_cases

# Optional libs for bulk upload
try:
    import openpyxl  # .xlsx
except Exception:
    openpyxl = None

try:
    from docx import Document  # .docx
except Exception:
    Document = None

def is_admin(user):
    return user.is_authenticated and user.role == 'admin'
def is_student(user):
    return user.is_authenticated and user.role == 'student'
# ------------------------ Helpers ------------------------

def _get_test_by_title_or_400(title):
    """Fetch a PracticeTest by exact title (case-sensitive). If not found, try case-insensitive.
    Return (object, None) or (None, JsonResponse)."""
    t = (title or "").strip()
    if not t:
        return None, JsonResponse({"error": "test_title is required."}, status=400)

    qs = PracticeTest.objects.filter(title=t)
    if not qs.exists():
        # fallback: case-insensitive
        qs = PracticeTest.objects.filter(title__iexact=t)

    if not qs.exists():
        return None, JsonResponse({"error": f"No PracticeTest found with title '{t}'."}, status=404)

    if qs.count() > 1:
        # If duplicates exist, pick the most recently created to keep UI flowing,
        # but make it explicit in the subtitle on the page if you want.
        test = qs.order_by("-created_at").first()
        return test, None

    return qs.first(), None


def _parse_json_or_csv(value):
    """Accept JSON array string or CSV string. Return list or None."""
    if value in (None, "", "null"):
        return None
    if isinstance(value, (list, tuple)):
        return list(value)
    s = str(value).strip()
    if not s:
        return None
    # Try JSON
    try:
        import json
        parsed = json.loads(s)
        if isinstance(parsed, (list, tuple)):
            return list(parsed)
        # if it's a single value, box it
        return [parsed]
    except Exception:
        pass
    # Fallback CSV
    return [part.strip() for part in s.split(",") if part.strip()]


def _parse_code_test_cases_from_post(data):
    """Parse dynamic test_input_N/test_output_N rows from admin CODE form."""
    cases = []
    idx = 0
    while True:
        in_key = f"test_input_{idx}"
        out_key = f"test_output_{idx}"
        if in_key not in data and out_key not in data:
            break
        test_in = (data.get(in_key) or "").strip()
        test_out = (data.get(out_key) or "").strip()
        if test_in or test_out:
            cases.append({"input": test_in, "output": test_out})
        idx += 1
    return cases


# ------------------------ Admin Page ------------------------

@login_required
@user_passes_test(is_admin)
def admin_practice_test_page(request):
    if request.method == "POST":

        # ---- CREATE ----
        if "create_test" in request.POST:
            form = PracticeTestForm(request.POST)
            if form.is_valid():
                try:
                    instance = form.save()
                    return JsonResponse({"message": "Practice test created successfully."})
                except IntegrityError as e:
                    return JsonResponse({"error": f"Could not save practice test (DB): {e}"}, status=400)
                except Exception as e:
                    return JsonResponse({"error": f"Unexpected error: {e}"}, status=400)

            # Return Django form errors as JSON string (your JS already parses this)
            return JsonResponse({"error": form.errors.as_json()}, status=400)

        # ---- SCHEDULE ----
        if "schedule_test" in request.POST:
            form = SchedulePracticeTestForm(request.POST)
            if hasattr(form, "is_valid") and form.is_valid():
                try:
                    cleaned = form.cleaned_data
                    schedule_obj, created = ScheduledPracticeTest.objects.get_or_create(
                        practice_test=cleaned["practice_test"],
                        college=cleaned["college"],
                        course=cleaned["course"],
                        semester=cleaned["semester"],
                        year=cleaned["year"],
                        defaults={
                            "start_datetime": cleaned["start_datetime"],
                            "end_datetime": cleaned["end_datetime"],
                        }
                    )

                    if not created:
                        schedule_obj.start_datetime = cleaned["start_datetime"]
                        schedule_obj.end_datetime = cleaned["end_datetime"]
                        schedule_obj.save(update_fields=["start_datetime", "end_datetime"])
                        return JsonResponse({"message": "Schedule already existed for this batch; timing updated successfully."})

                    return JsonResponse({"message": "Practice test scheduled successfully."})
                except ImproperlyConfigured as e:
                    return JsonResponse({"error": str(e)}, status=400)
                except IntegrityError as e:
                    # Handles unique_together collisions gracefully
                    return JsonResponse({"error": f"Schedule already exists for this selection: {e}"}, status=400)
                except Exception as e:
                    return JsonResponse({"error": f"Failed to schedule: {e}"}, status=400)

            try:
                return JsonResponse({"error": form.errors.as_json()}, status=400)
            except Exception:
                return JsonResponse({"error": "Scheduling is not configured in this project."}, status=400)

        return JsonResponse({"error": "Unknown action."}, status=400)

    # ---- GET ----
    tests = PracticeTest.objects.select_related("domain").order_by("-created_at")
    scheduled_tests = ScheduledPracticeTest.objects.select_related(
        "practice_test", "college", "course"
    ).order_by("-start_datetime")  # OK Fetch scheduled tests

    context = {
        "tests": tests,
        "scheduled_tests": scheduled_tests,  # OK Add this to context
        "create_form": PracticeTestForm(),
        "schedule_form": SchedulePracticeTestForm(),
    }

    return render(request, "admin_practice_test.html", context)


# ------------------------ Admin: Questions by NAME ------------------------

@login_required
@user_passes_test(is_admin)
@require_http_methods(["GET"])
def practice_api_list_questions_by_name(request, test_title):
    # Titles come URL-encoded from JS; decode to be safe
    test_title = unquote(test_title or "").strip()
    test, err = _get_test_by_title_or_400(test_title)
    if err:
        return err

    qs = PracticeQuestion.objects.filter(practice_test=test).order_by("id")
    data = {
        "test": {"id": str(test.id), "title": test.title},
        "questions": [
            {
                "id": str(q.id),
                "type": q.type,
                "question_text": q.question_text,
                "marks": q.marks,
                "negative_mark": q.negative_mark,
                "options": q.options,
                "correct_answer": q.correct_answer,
                "expected_keywords": q.expected_keywords,
                "min_characters": q.min_characters,
                "image_url": q.image.url if q.image else None,
            }
            for q in qs
        ],
    }
    return JsonResponse(data)


@login_required
@user_passes_test(is_admin)
@require_POST
def practice_api_add_question_by_name(request, test_title):
    test_title = unquote(test_title or "").strip()
    test, err = _get_test_by_title_or_400(test_title)
    if err:
        return err

    try:
        data = request.POST
        qtype = (data.get("type") or "").strip()
        question_text = (data.get("question_text") or "").strip()
        marks = float(data.get("marks") or 0)
        negative_mark = float(data.get("negative_mark") or 0)
        correct_answer = (data.get("correct_answer") or "").strip() or None

        options = _parse_json_or_csv(data.get("options"))
        expected_keywords = _parse_json_or_csv(data.get("expected_keywords"))
        min_characters = data.get("min_characters")
        min_characters = int(min_characters) if (min_characters not in (None, "", "null")) else None
        input_example = (data.get("input_example") or "").strip() or None
        expected_output = (data.get("expected_output") or "").strip() or None
        test_cases = _parse_code_test_cases_from_post(data)

        if qtype not in ("MCQ", "TF", "DESC", "CODE") or not question_text:
            return JsonResponse({"error": "Provide question_text and valid type (MCQ/TF/DESC/CODE)."}, status=400)
        if qtype in ("MCQ", "TF") and not correct_answer:
            return JsonResponse({"error": "correct_answer is required for MCQ/TF."}, status=400)
        if qtype == "DESC" and not (expected_keywords or min_characters):
            return JsonResponse({"error": "Provide expected_keywords or min_characters for DESC."}, status=400)
        if qtype == "CODE" and not (test_cases or expected_output):
            return JsonResponse({"error": "Provide at least one CODE test case or expected output."}, status=400)

        # accept image if uploadedimage = request.FILES.get("image")
        image = request.FILES.get("image")

        with transaction.atomic():
            PracticeQuestion.objects.create(
                practice_test=test,
                question_text=question_text,
                type=qtype,
                marks=marks,
                negative_mark=negative_mark,
                options=options,
                correct_answer=correct_answer,
                 input_example=input_example,
                 expected_output=expected_output,
                 test_cases=test_cases or None,
                expected_keywords=expected_keywords,
                min_characters=min_characters,
                 image=image, 
            )
        return JsonResponse({"message": "Question added successfully."})
    except Exception as e:
        return JsonResponse({"error": f"Failed to add question: {e}"}, status=400)


# ------------------------ Legacy add-by-ID (kept) ------------------------

@login_required
@user_passes_test(is_admin)
@require_POST
def practice_api_add_question(request, test_id):
    test = get_object_or_404(PracticeTest, id=test_id)
    try:
        data = request.POST
        qtype = (data.get("type") or "").strip()
        question_text = (data.get("question_text") or "").strip()
        marks = float(data.get("marks") or 0)
        negative_mark = float(data.get("negative_mark") or 0)
        correct_answer = (data.get("correct_answer") or "").strip() or None

        options = _parse_json_or_csv(data.get("options"))
        expected_keywords = _parse_json_or_csv(data.get("expected_keywords"))
        min_characters = data.get("min_characters")
        min_characters = int(min_characters) if (min_characters not in (None, "", "null")) else None
        input_example = (data.get("input_example") or "").strip() or None
        expected_output = (data.get("expected_output") or "").strip() or None
        test_cases = _parse_code_test_cases_from_post(data)

        if qtype not in ("MCQ", "TF", "DESC", "CODE") or not question_text:
            return JsonResponse({"error": "Provide question_text and valid type (MCQ/TF/DESC/CODE)."}, status=400)
        if qtype in ("MCQ", "TF") and not correct_answer:
            return JsonResponse({"error": "correct_answer is required for MCQ/TF."}, status=400)
        if qtype == "DESC" and not (expected_keywords or min_characters):
            return JsonResponse({"error": "Provide expected_keywords or min_characters for DESC."}, status=400)
        if qtype == "CODE" and not (test_cases or expected_output):
            return JsonResponse({"error": "Provide at least one CODE test case or expected output."}, status=400)

        with transaction.atomic():
            PracticeQuestion.objects.create(
                practice_test=test,
                question_text=question_text,
                type=qtype,
                marks=marks,
                negative_mark=negative_mark,
                options=options,
                correct_answer=correct_answer,
                input_example=input_example,
                expected_output=expected_output,
                test_cases=test_cases or None,
                expected_keywords=expected_keywords,
                min_characters=min_characters,
            )
        return JsonResponse({"message": "Question added successfully."})
    except Exception as e:
        return JsonResponse({"error": f"Failed to add question: {e}"}, status=400)


# ------------------------ Bulk Upload ------------------------

@login_required
@user_passes_test(is_admin)
@require_POST
def practice_bulk_upload(request):
    test_name = (request.POST.get("test_name") or "").strip()
    test_id = request.POST.get("test_id")  # legacy support

    test = None
    if test_name:
        test, err = _get_test_by_title_or_400(test_name)
        if err:
            return err
    elif test_id:
        try:
            test = get_object_or_404(PracticeTest, id=UUID(str(test_id)))
        except Exception:
            return JsonResponse({"error": "Invalid test_id."}, status=400)
    else:
        return JsonResponse({"error": "Provide test_name."}, status=400)

    file = request.FILES.get("file")
    if not file:
        return JsonResponse({"error": "file is required."}, status=400)

    filename = file.name.lower()
    created = 0
    skipped = 0
    errors = []
    rows = []

    def row_to_obj(row, _idx):
        qtype = (row.get("type") or "").strip()
        question_text = (row.get("question_text") or "").strip()
        marks = row.get("marks")
        negative_mark = row.get("negative_mark")
        options = row.get("options")
        correct_answer = row.get("correct_answer")
        input_example = row.get("input_example")
        expected_output = row.get("expected_output")
        test_cases = row.get("test_cases")
        expected_keywords = row.get("expected_keywords")
        min_characters = row.get("min_characters")

        if not qtype or qtype not in ("MCQ", "TF", "DESC", "CODE"):
            raise ValueError("Invalid type; must be MCQ/TF/DESC/CODE.")

        if not question_text:
            raise ValueError("question_text required.")

        try:
            marks = float(marks) if marks not in (None, "") else 1.0
        except Exception:
            raise ValueError("marks must be a number.")

        try:
            negative_mark = float(negative_mark) if negative_mark not in (None, "") else 0.0
        except Exception:
            raise ValueError("negative_mark must be a number.")

        options = _parse_json_or_csv(options)
        if isinstance(test_cases, str):
            try:
                test_cases = json.loads(test_cases)
            except Exception:
                test_cases = None
        expected_keywords = _parse_json_or_csv(expected_keywords)
        min_characters = int(min_characters) if (min_characters not in (None, "", "null")) else None
        correct_answer = (str(correct_answer).strip() or None) if correct_answer is not None else None
        input_example = (str(input_example).strip() or None) if input_example is not None else None
        expected_output = (str(expected_output).strip() or None) if expected_output is not None else None

        if qtype in ("MCQ", "TF") and not correct_answer:
            raise ValueError("correct_answer is required for MCQ/TF.")
        if qtype == "DESC" and not (expected_keywords or min_characters):
            raise ValueError("Provide expected_keywords or min_characters for DESC.")
        if qtype == "CODE" and not (test_cases or expected_output):
            raise ValueError("Provide test_cases (JSON) or expected_output for CODE.")

        return dict(
            practice_test=test,
            type=qtype,
            question_text=question_text,
            marks=marks,
            negative_mark=negative_mark,
            options=options,
            correct_answer=correct_answer,
            input_example=input_example,
            expected_output=expected_output,
            test_cases=test_cases,
            expected_keywords=expected_keywords,
            min_characters=min_characters,
        )

    try:
        # .xlsx
        if filename.endswith(".xlsx"):
            if openpyxl is None:
                return JsonResponse({"error": "openpyxl not installed on server."}, status=500)
            wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
            ws = wb.active
            headers = [
                (str(c.value).strip().lower() if c.value is not None else "")
                for c in next(ws.iter_rows(min_row=1, max_row=1))
            ]
            for idx, row in enumerate(ws.iter_rows(min_row=2), start=2):
                rdict = {}
                for i, cell in enumerate(row):
                    key = headers[i] if i < len(headers) else f"col_{i}"
                    rdict[key] = "" if cell.value is None else cell.value
                rows.append((idx, rdict))

        # .csv
        elif filename.endswith(".csv"):
            content = file.read().decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(content))
            for idx, rdict in enumerate(reader, start=2):
                rdict = {(k.strip().lower() if k else ""): v for k, v in rdict.items()}
                rows.append((idx, rdict))

        # .docx (first table with headers)
        elif filename.endswith(".docx"):
            if Document is None:
                return JsonResponse({"error": "python-docx not installed on server."}, status=500)
            doc = Document(file)
            if not doc.tables:
                return JsonResponse({"error": "No tables found in .docx. Add a table with headers."}, status=400)
            table = doc.tables[0]
            headers = [cell.text.strip().lower() for cell in table.rows[0].cells]
            for idx, row in enumerate(table.rows[1:], start=2):
                rdict = {}
                for i, cell in enumerate(row.cells):
                    key = headers[i] if i < len(headers) else f"col_{i}"
                    rdict[key] = cell.text.strip()
                rows.append((idx, rdict))

        else:
            return JsonResponse({"error": "Unsupported file type. Use .xlsx, .csv, or .docx."}, status=400)

        create_objs = []
        for idx, r in rows:
            nr = {(k.strip().lower() if k else ""): r[k] for k in r}
            try:
                obj_kwargs = row_to_obj(nr, idx)
                create_objs.append(PracticeQuestion(**obj_kwargs))
            except ValueError as ve:
                skipped += 1
                errors.append(f"Row {idx}: {ve}")
            except Exception as e:
                skipped += 1
                errors.append(f"Row {idx}: {e}")

        with transaction.atomic():
            PracticeQuestion.objects.bulk_create(create_objs)
            created = len(create_objs)

        return JsonResponse(
            {"message": "Bulk upload completed.", "created": created, "skipped": skipped, "errors": errors[:50]}
        )

    except Exception as e:
        return JsonResponse({"error": f"Failed to process file: {e}"}, status=400)

# ---------- Schedule detail (GET) ----------
@login_required
@user_passes_test(is_admin)
@require_http_methods(["GET"])
def admin_schedule_detail(request, schedule_id):
    """
    Returns JSON details for schedule with datetimes formatted for
    <input type="datetime-local"> (YYYY-MM-DDTHH:MM).
    """
    s = get_object_or_404(ScheduledPracticeTest.objects.select_related(
        "practice_test", "college", "course"
    ), id=schedule_id)

    def to_local_for_input(dt):
        if not dt:
            return ""
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_default_timezone())
        local = dt.astimezone(timezone.get_current_timezone())
        return local.strftime("%Y-%m-%dT%H:%M")

    data = {
        "schedule": {
            "id": str(s.id),
            "practice_test": str(s.practice_test.id) if s.practice_test else "",
            "practice_test_title": s.practice_test.title if s.practice_test else "",
            "college": str(s.college.id) if s.college else "",
            "college_name": s.college.name if s.college else "",
            "course": str(s.course.id) if s.course else "",
            "course_name": s.course.name if s.course else "",
            "semester": s.semester,
            "year": s.year,
            "start_datetime": to_local_for_input(s.start_datetime),
            "end_datetime": to_local_for_input(s.end_datetime),
        }
    }
    return JsonResponse(data)

@login_required
@user_passes_test(is_admin)
@require_http_methods(["POST"])
def admin_schedule_update(request, schedule_id):
    """
    Updates a ScheduledPracticeTest using SchedulePracticeTestForm bound to instance.
    Returns JSON with the fields the JS uses to update the row.
    """
    s = get_object_or_404(ScheduledPracticeTest, id=schedule_id)
    post_data = request.POST.copy()
    if ("college" not in post_data or not post_data["college"]) and s.college:
        post_data["college"] = str(s.college.id)
    if ("course" not in post_data or not post_data["course"]) and s.course:
        post_data["course"] = str(s.course.id)

    form = SchedulePracticeTestForm(post_data, instance=s)
    if not form.is_valid():
        logger.error(f"Schedule update form errors: {form.errors.as_json()}")
        return JsonResponse({"error": form.errors.as_json()}, status=400)

    inst = form.save()

    def pretty(dt):
        if not dt:
            return ""
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_default_timezone())
        local = dt.astimezone(timezone.get_current_timezone())
        return local.strftime("%d %b %Y, %I:%M %p")

    return JsonResponse({
        "message": "Schedule updated.",
        "schedule": {
            "id": str(inst.id),
            "practice_test_title": inst.practice_test.title if inst.practice_test else "",
            "college_name": inst.college.name if inst.college else "",
            "course_name": inst.course.name if inst.course else "",
            "semester": inst.semester,
            "year": inst.year,
            "start_datetime": pretty(inst.start_datetime),
            "end_datetime": pretty(inst.end_datetime),
        }
    })

# ---------- Schedule delete (POST) ----------
@login_required
@user_passes_test(is_admin)
@require_http_methods(["POST"])
def admin_schedule_delete(request, schedule_id):
    """
    Deletes schedule and returns JSON success. JS will remove the row.
    """
    s = get_object_or_404(ScheduledPracticeTest, id=schedule_id)
    s.delete()
    return JsonResponse({"message": "Schedule deleted."})


############################## Student Views #############################


# 1. API to Get Practice Tests for Student
@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def api_practice_tests(request):
    domain_id = request.GET.get('domain')  # <-- This is passed from JS
    try:
        student = StudentProfile.objects.get(user=request.user, is_current=True)
    except StudentProfile.DoesNotExist:
        return JsonResponse({"tests": []})

    now = timezone.now()

    scheduled = ScheduledPracticeTest.objects.filter(
        college=student.college,
        course=student.course,
        semester=student.semester,
        year=student.year,
    )

    if domain_id:
        scheduled = scheduled.filter(practice_test__domain__id=domain_id)

    result = []
    for item in scheduled:
        question_count = PracticeQuestion.objects.filter(practice_test=item.practice_test).count()
        if question_count == 0:
            # Do not show tests that have no questions configured.
            continue

        is_active = item.start_datetime <= now <= item.end_datetime
        is_expired = now > item.end_datetime
        is_upcoming = now < item.start_datetime

        status = "active" if is_active else ("expired" if is_expired else "upcoming")

        user_results = PracticeResult.objects.filter(
            student=student,
            practice_test=item.practice_test
        ).order_by("-submitted_at")
        attempted = user_results.exists()
        attempts_count = user_results.count()
        latest_result = user_results.first()
        latest_result_id = str(latest_result.id) if latest_result else ""
        highest_score = user_results.aggregate(max_score=Max("marks_obtained"))["max_score"] or 0.0

        domain_name = item.practice_test.domain.domain_name if (hasattr(item.practice_test, 'domain') and item.practice_test.domain) else "Practice"

        result.append({
            'id': str(item.practice_test.id),
            'title': item.practice_test.title,
            'domain': domain_name,
            'duration_minutes': item.practice_test.duration_minutes,
            'question_count': question_count,
            'max_marks': float(item.practice_test.max_marks or 0),
            'highest_score': float(highest_score),
            'start': item.start_datetime,
            'end': item.end_datetime,
            'status': status,
            'is_active': is_active,
            'is_expired': is_expired,
            'is_upcoming': is_upcoming,
            'attempted': attempted,
            'attempts_count': attempts_count,
            'latest_result_id': latest_result_id,
        })

    return JsonResponse({"tests": result})

# 2. Start Practice Test - Render Template

@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def start_practice_test(request, test_id):
    test = get_object_or_404(PracticeTest, id=test_id)
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()

    if not student:
        messages.error(request, "Student profile not found.")
        return redirect("student_home_page")

    now = timezone.now()
    schedules = ScheduledPracticeTest.objects.filter(
        practice_test=test,
        college=student.college,
        course=student.course,
        semester=student.semester,
        year=student.year,
    )

    if not schedules.exists():
        messages.error(request, "This practice test is not scheduled for your class.")
        return redirect("student_home_page")

    active_schedule = schedules.filter(
        start_datetime__lte=now,
        end_datetime__gte=now,
    ).first()

    if not active_schedule:
        latest = schedules.order_by("-end_datetime").first()
        if latest and now > latest.end_datetime:
            formatted_end = latest.end_datetime.strftime("%d %b %Y, %I:%M %p")
            messages.error(request, f"This practice test expired on {formatted_end} and can no longer be taken.")
        elif latest and now < latest.start_datetime:
            formatted_start = latest.start_datetime.strftime("%d %b %Y, %I:%M %p")
            messages.error(request, f"This practice test will start on {formatted_start}.")
        else:
            messages.error(request, "This practice test is currently not active.")
        return redirect("student_home_page")

    questions = PracticeQuestion.objects.filter(practice_test=test)

    context = {
        "test": test,
        "questions": questions
    }
    return render(request, "student/start_practice.html", context)

# Helper function to run code for evaluation
def run_code_for_evaluation(code, language, input_data=''):
    """
    Run code with given input and return output.
    Uses the same compile_code_exam function but with shorter timeout.
    """
    try:
        from exam.sandbox import run_sandboxed
        return run_sandboxed({'code': code, 'language': language, 'input': input_data})
    except Exception as e:
        return {'success': False, 'error': str(e), 'output': ''}

# 3. Submit Practice Test

@login_required
@user_passes_test(is_student)
@require_http_methods(["POST"])
def submit_practice_test(request, test_id):
    test = get_object_or_404(PracticeTest, id=test_id)
    student = get_object_or_404(StudentProfile, user=request.user, is_current=True)

    now = timezone.now()
    schedules = ScheduledPracticeTest.objects.filter(
        practice_test=test,
        college=student.college,
        course=student.course,
        semester=student.semester,
        year=student.year,
    )

    if not schedules.exists():
        return JsonResponse({"error": "This practice test is not scheduled for your class."}, status=400)

    latest = schedules.order_by("-end_datetime").first()
    # Allow 5-minute grace period for network latency during submission
    if latest and now > (latest.end_datetime + timezone.timedelta(minutes=5)):
        return JsonResponse({"error": "The test submission time window has expired."}, status=400)
    questions = PracticeQuestion.objects.filter(practice_test=test)

    submitted_data = request.POST
    total_marks = 0
    obtained_marks = 0
    correct = 0
    wrong = 0
    attempted = 0
    breakdown = []
    question_count = questions.count()
    default_question_marks = (float(test.max_marks) / question_count) if question_count and test.max_marks else 0.0

    for q in questions:
        key = f"q_{q.id}"
        answer = submitted_data.get(key)
        awarded = 0
        is_correct = False
        question_marks = float(q.marks or 0)
        if question_marks <= 0 and default_question_marks > 0:
            question_marks = round(default_question_marks, 2)

        if q.type in ["MCQ", "TF"]:
            if answer and answer.strip().lower() == (q.correct_answer or "").strip().lower():
                awarded = question_marks
                is_correct = True
            else:
                awarded = -q.negative_mark if answer else 0

        elif q.type == "DESC" and answer:
            awarded = question_marks  # you can implement keyword logic here
            is_correct = True  # Mark as correct if answer provided
        
        elif q.type == "CODE" and answer:
            # Parse JSON answer for CODE questions
            import json
            try:
                code_data = json.loads(answer)
                code_content = code_data.get('code', '')
                language = code_data.get('language', 'python')
                
                # Evaluate code if there are test cases or expected output
                if code_content and code_content.strip():
                    judge_payload = None
                    if q.test_cases:
                        judge_payload = q.test_cases
                    elif q.expected_output:
                        judge_payload = {
                            "sample_test_cases": [
                                {
                                    "input": q.input_example or "",
                                    "output": q.expected_output
                                }
                            ],
                            "hidden_test_cases": []
                        }

                    if judge_payload:
                        judge = evaluate_code_with_test_cases(code_content, language, judge_payload)
                        passed_cases = int(judge.get("passed", 0))
                        total_cases = int(judge.get("total", 0))
                        score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                        awarded = round(question_marks * score_ratio, 2)
                        is_correct = judge.get("verdict") == "Accepted"

                        breakdown.append({
                            "question_id": q.id,
                            "answer": answer,
                            "marks_awarded": awarded,
                            "correct": is_correct,
                            "verdict": judge.get("verdict", "Wrong Answer"),
                            "passed": passed_cases,
                            "total": total_cases,
                            "score_ratio": round(score_ratio, 4),
                            "test_results": judge.get("details", [])
                        })
                        obtained_marks += awarded
                        if is_correct:
                            correct += 1
                        elif answer:
                            wrong += 1
                        if answer and str(answer).strip():
                            attempted += 1
                        total_marks += question_marks
                        continue
                    else:
                        # No test criteria configured -> no auto-marks
                        awarded = 0
                        is_correct = False
            except Exception as e:
                print(f"Error evaluating CODE question: {e}")
                pass

        breakdown.append({
            "question_id": q.id,
            "answer": answer,
            "marks_awarded": awarded,
            "correct": is_correct
        })

        obtained_marks += awarded
        if is_correct:
            correct += 1
        elif answer:
            wrong += 1
        if answer and str(answer).strip():
            attempted += 1

        total_marks += question_marks

    # Get time taken from form
    from datetime import timedelta
    time_taken_seconds = submitted_data.get('time_taken')
    time_taken = None
    if time_taken_seconds:
        try:
            time_taken = timedelta(seconds=int(time_taken_seconds))
        except (ValueError, TypeError):
            pass

    result = PracticeResult.objects.create(
        student=student,
        practice_test=test,
        total_marks=total_marks,
        marks_obtained=max(obtained_marks, 0),
        attempted_questions=attempted,
        correct_answers=correct,
        wrong_answers=wrong,
        question_wise_breakdown=breakdown,
        time_taken=time_taken
    )

    # Redirect to result page
    return redirect('practice_test_result', result_id=result.id)

@login_required
@user_passes_test(is_student)
def practice_test_result(request, result_id):
    """Display comprehensive practice test result sheet"""
    import json
    
    result = get_object_or_404(PracticeResult, id=result_id, student__user=request.user)
    test = result.practice_test
    questions = PracticeQuestion.objects.filter(practice_test=test)
    
    # Build question-wise data
    questions_data = []
    breakdown_dict = {item['question_id']: item for item in result.question_wise_breakdown}
    
    for q in questions:
        breakdown_item = breakdown_dict.get(q.id, {})
        student_answer = breakdown_item.get('answer', '')
        
        question_data = {
            'question_text': q.question_text,
            'type': q.type,
            'marks': float(q.marks),
            'marks_awarded': float(breakdown_item.get('marks_awarded', 0)),
            'student_answer': student_answer,
            'correct_answer': q.correct_answer if q.type in ['MCQ', 'TF'] else None,
            'is_correct': breakdown_item.get('correct', False),
            'options': list(q.options) if q.type == 'MCQ' and q.options else None,
        }
        
        # For CODE questions, extract language and code
        if q.type == 'CODE':
            try:
                if student_answer:
                    code_data = json.loads(student_answer)
                    if isinstance(code_data, dict):
                        question_data['language'] = code_data.get('language', 'Unknown')
                        question_data['student_answer'] = code_data.get('code', '')
                    else:
                        question_data['language'] = 'Unknown'
                        question_data['student_answer'] = str(student_answer)
                else:
                    question_data['language'] = 'Unknown'
                    question_data['student_answer'] = ''
            except (json.JSONDecodeError, TypeError):
                question_data['language'] = 'Unknown'
                question_data['student_answer'] = str(student_answer) if student_answer else ''
        
        questions_data.append(question_data)
    
    # Format time taken
    time_taken_str = '-'
    if result.time_taken:
        total_seconds = int(result.time_taken.total_seconds())
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        time_taken_str = f"{minutes}m {seconds}s"
    
    # Prepare result JSON
    result_json = {
        'student_name': result.student.user.get_full_name() or result.student.user.username,
        'student_usn': result.student.usn or '-',
        'test_title': test.title,
        'submitted_at': timezone.localtime(result.submitted_at).strftime('%B %d, %Y at %I:%M %p') if result.submitted_at else '-',
        'duration': f"{test.duration_minutes} minutes" if test.duration_minutes else '-',
        'time_taken': time_taken_str,
        'marks_obtained': float(result.marks_obtained),
        'total_marks': float(result.total_marks),
        'correct_answers': result.correct_answers,
        'wrong_answers': result.wrong_answers,
        'attempted_questions': result.attempted_questions,
        'total_questions': questions.count(),
        'questions': questions_data
    }
    
    return render(request, 'practice_result.html', {
        'result_json': json.dumps(result_json)
    })

@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def api_practice_questions(request):  # OK this must match the URL pattern
    test_id = request.GET.get("test_id")
    try:
        test = PracticeTest.objects.get(id=test_id)
    except PracticeTest.DoesNotExist:
        raise Http404("Practice test not found")

    questions = PracticeQuestion.objects.filter(practice_test=test)

    return JsonResponse({
        "test": {
            "id": str(test.id),
            "title": test.title,
            "duration_minutes": test.duration_minutes,
        },
        "questions": [
            {
                "id": str(q.id),
                "question_text": q.question_text,
                "type": q.type,  # OK corrected from q.question_type
                "options": q.options if q.type in ["MCQ", "TF"] else [],
                "image_url": q.image.url if q.image else None,
            }
            for q in questions
        ]
    })




@login_required
@user_passes_test(is_student)
def api_past_practice_attempts(request):
    student = get_object_or_404(StudentProfile, user=request.user, is_current=True)
    attempts = PracticeResult.objects.filter(student=student).select_related("practice_test").order_by("-submitted_at")

    test_id = request.GET.get("test_id")
    domain_id = request.GET.get("domain")

    if test_id:
        attempts = attempts.filter(practice_test__id=test_id)
    if domain_id:
        attempts = attempts.filter(practice_test__domain__id=domain_id)

    data = []
    for result in attempts:
        data.append({
            "test_title": result.practice_test.title,
            "marks": f"{result.marks_obtained}/{result.total_marks}",
            "marks_obtained": result.marks_obtained,
            "total_marks": result.total_marks,
            "attempted_on": result.submitted_at.strftime("%d %b %Y, %I:%M %p"),
            "test_id": str(result.practice_test.id),
        })

    return JsonResponse(data, safe=False)



# Add this at the bottom of practicetest/views.py

@login_required
@user_passes_test(is_student)
def student_get_performance(request):
    student = StudentProfile.objects.get(user=request.user, is_current=True)
    results = PracticeResult.objects.filter(student=student).order_by('submitted_at')

    labels = []
    scores = []

    for res in results:
        labels.append(res.practice_test.title)
        percent_score = (res.marks_obtained / res.total_marks) * 100 if res.total_marks > 0 else 0
        scores.append(round(percent_score, 2))

    return JsonResponse({
        "labels": labels,
        "scores": scores
    })


# Code compiler for practice tests - reuse exam compiler
compile_code_practice = compile_code_exam
