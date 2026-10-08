from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST, require_http_methods, require_GET
from django.views.decorators.csrf import csrf_exempt
from .models import Exam, ExamQuestion, ScheduledExam, ExamResult
from .forms import ExamForm, ExamQuestionForm, ScheduleExamForm
from .device_detector import parse_device_info
import json
import random
from datetime import timedelta
from itertools import product
from college.models import College, Course, Section
from material.models import Domain
from student.models import StudentProfile
from django.utils import timezone
import csv
import io
from django.db import transaction
import logging
import os
import re
import sys
import shutil
import tempfile
import subprocess
from datetime import datetime

logger = logging.getLogger(__name__)


def _parse_browser_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip().replace("T", " ")
        dt = datetime.fromisoformat(text)

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "y"}
    return bool(value)


def _normalize_list_value(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, (list, tuple, set)):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except Exception:
                pass
        return [part.strip() for part in re.split(r"[,|]", text) if part.strip()]
    return [str(value).strip()] if str(value).strip() else []


def _parse_request_payload(request):
    if request.body:
        try:
            payload = json.loads(request.body)
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass

    if request.POST:
        return request.POST.dict()

    return {}


try:
    compiler_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Compiler', 'compiler')
    if compiler_path not in sys.path:
        sys.path.insert(0, compiler_path)
    from portable_compiler_detector import get_compiler_path, is_compiler_available
except Exception as e:
    import logging
    logging.getLogger(__name__).exception("Failed to import portable_compiler_detector at top-level:")
    def get_compiler_path(compiler_name):
        return compiler_name

    def is_compiler_available(_compiler_name):
        return True


def run_code_with_input(code, language, input_data, timeout_seconds=3):
    """
    Execute code once with provided stdin.
    Returns: {status, output, error}
    status in: pass | runtime_error | time_limit_exceeded
    """
    lang = (language or "python").lower().strip()
    stdin_data = "" if input_data is None else str(input_data)

    try:
        if lang == 'python':
            python_cmd = get_compiler_path('python') if is_compiler_available('python') else 'python'
            res = subprocess.run(
                [python_cmd, '-c', code],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                encoding='utf-8',
                errors='replace'
            )
            if res.returncode != 0:
                return {"status": "runtime_error", "output": res.stdout or "", "error": res.stderr or ""}
            return {"status": "pass", "output": res.stdout or "", "error": ""}

        if lang == 'java':
            class_match = re.search(r'public\s+class\s+(\w+)', code)
            if not class_match:
                return {"status": "runtime_error", "output": "", "error": "Java code must contain a public class declaration"}

            class_name = class_match.group(1)
            with tempfile.TemporaryDirectory() as tmp:
                java_file = os.path.join(tmp, f'{class_name}.java')
                with open(java_file, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(code)

                javac_cmd = get_compiler_path('javac') if is_compiler_available('javac') else 'javac'
                java_cmd = get_compiler_path('java') if is_compiler_available('java') else 'java'

                comp = subprocess.run([javac_cmd, java_file], capture_output=True, text=True, timeout=timeout_seconds)
                if comp.returncode != 0:
                    return {"status": "compilation_error", "output": "", "error": comp.stderr or "Java compilation failed"}

                run = subprocess.run(
                    [java_cmd, '-cp', tmp, class_name],
                    input=stdin_data,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    encoding='utf-8',
                    errors='replace'
                )
                if run.returncode != 0:
                    return {"status": "runtime_error", "output": run.stdout or "", "error": run.stderr or ""}
                return {"status": "pass", "output": run.stdout or "", "error": ""}

        if lang in ['c', 'cpp', 'c++']:
            with tempfile.TemporaryDirectory() as tmp:
                ext = '.c' if lang == 'c' else '.cpp'
                src = os.path.join(tmp, f'src{ext}')
                exe = os.path.join(tmp, 'prog.exe')
                compiler_key = 'gcc' if lang == 'c' else 'g++'
                compiler_cmd = get_compiler_path(compiler_key) if is_compiler_available(compiler_key) else compiler_key

                with open(src, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(code)

                compile_args = [compiler_cmd, src, '-o', exe]
                if lang in ['cpp', 'c++']:
                    compile_args.extend(['-static-libstdc++', '-static-libgcc'])
                elif lang == 'c':
                    compile_args.append('-static-libgcc')

                comp = subprocess.run(compile_args, capture_output=True, text=True, timeout=timeout_seconds)
                if comp.returncode != 0:
                    return {"status": "compilation_error", "output": "", "error": comp.stderr or "Compilation failed"}

                run = subprocess.run(
                    [exe],
                    input=stdin_data,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    encoding='utf-8',
                    errors='replace'
                )
                if run.returncode != 0:
                    return {"status": "runtime_error", "output": run.stdout or "", "error": run.stderr or ""}
                return {"status": "pass", "output": run.stdout or "", "error": ""}

        if lang in ['csharp', 'c#']:
            project_dir = tempfile.mkdtemp()
            try:
                source_file = os.path.join(project_dir, 'Program.cs')
                with open(source_file, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(code)

                csproj_content = '''<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>'''
                csproj_file = os.path.join(project_dir, 'TempProject.csproj')
                with open(csproj_file, 'w', encoding='utf-8') as f:
                    f.write(csproj_content)

                dotnet_cmd = get_compiler_path('dotnet') if is_compiler_available('dotnet') else 'dotnet'
                run = subprocess.run(
                    [dotnet_cmd, 'run', '--project', project_dir],
                    input=stdin_data,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    encoding='utf-8',
                    errors='replace'
                )
                if run.returncode != 0:
                    return {"status": "runtime_error", "output": run.stdout or "", "error": run.stderr or ""}
                return {"status": "pass", "output": run.stdout or "", "error": ""}
            finally:
                shutil.rmtree(project_dir, ignore_errors=True)

        if lang == 'javascript':
            node_cmd = get_compiler_path('node') if is_compiler_available('node') else 'node'
            run = subprocess.run(
                [node_cmd, '-e', code],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                encoding='utf-8',
                errors='replace'
            )
            if run.returncode != 0:
                return {"status": "runtime_error", "output": run.stdout or "", "error": run.stderr or ""}
            return {"status": "pass", "output": run.stdout or "", "error": ""}

        if lang == 'php':
            php_cmd = get_compiler_path('php') if is_compiler_available('php') else 'php'
            php_code = (code or '').strip()
            if php_code.startswith('<?php'):
                php_code = php_code[5:].strip()
            if php_code.endswith('?>'):
                php_code = php_code[:-2].strip()

            run = subprocess.run(
                [php_cmd, '-r', php_code],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                encoding='utf-8',
                errors='replace'
            )
            if run.returncode != 0:
                return {"status": "runtime_error", "output": run.stdout or "", "error": run.stderr or ""}
            return {"status": "pass", "output": run.stdout or "", "error": ""}

        return {"status": "runtime_error", "output": "", "error": f"Unsupported language: {language}"}

    except subprocess.TimeoutExpired:
        return {"status": "time_limit_exceeded", "output": "", "error": f"Time limit exceeded ({timeout_seconds}s)"}
    except Exception as exc:
        return {"status": "runtime_error", "output": "", "error": str(exc)}

############# ADMIN SECTION TO CURD EXAM ###################################

try:
    import openpyxl  # for .xlsx import
except Exception:
    openpyxl = None

try:
    from docx import Document  # for .docx import/export
except Exception:
    Document = None


def _normalize_str(x):
    return (x or "").strip()


def _maybe_json_list(val):
    """
    Try to decode JSON list; if not JSON, fallback to splitting by | or ,.
    """
    if val is None:
        return []
    if isinstance(val, list):
        return val
    s = str(val).strip()
    if not s:
        return []
    # Try JSON
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    # Fallback: split by | then comma
    parts = [p.strip() for p in s.split("|") if p.strip()]
    if not parts and "," in s:
        parts = [p.strip() for p in s.split(",") if p.strip()]
    return parts


def _parse_test_cases(val, row=None):
    """
    Support JSON list of {input, output} OR paired columns tc_input1/tc_output1...
    """
    if val:
        try:
            data = json.loads(val)
            if isinstance(data, list):
                # support both {"input": "...", "output": "..."} and {"stdin":"...","expected_output":"..."}
                out = []
                for d in data:
                    if not isinstance(d, dict):
                        continue
                    inp = d.get("input") or d.get("stdin") or ""
                    outp = d.get("output") or d.get("expected_output") or ""
                    if inp != "" and outp != "":
                        out.append({"input": str(inp), "output": str(outp)})
                return out
        except Exception:
            pass
    # fallback: look for tc_inputN/tc_outputN pairs in row dict
    out = []
    if isinstance(row, dict):
        for i in range(1, 11):
            ik = f"tc_input{i}"
            ok = f"tc_output{i}"
            if row.get(ik) or row.get(ok):
                inp = str(row.get(ik) or "")
                outp = str(row.get(ok) or "")
                if inp and outp:
                    out.append({"input": inp, "output": outp})
    return out


def is_admin(user):
    return user.is_authenticated and user.role == 'admin'

def is_trainer(user):
    return user.is_authenticated and user.role == 'trainer'

def is_tpo(user):
    return user.is_authenticated and user.role == 'tpo'

def is_admin_trainer_tpo(user):
    return user.is_authenticated and user.role in ['admin', 'trainer', 'tpo']

def parse_json_fields(data, keys=('options', 'test_cases', 'expected_keywords')):
    """Convert specific keys from JSON-string to list."""
    for key in keys:
        if key in data and isinstance(data[key], str):
            try:
                data[key] = json.loads(data[key])
            except Exception:
                pass
    return data

@login_required
@user_passes_test(is_admin)
def admin_dropdown_data(request):
    from trainer.models import TrainerProfile
    from tpo.models import TpoProfile
    
    # Use values() to reduce payload
    domains = list(Domain.objects.values('id', 'domain_name'))
    colleges = list(College.objects.filter(is_active=True).values('id', 'name'))
    courses = list(Course.objects.values('id', 'name'))
    sections = list(Section.objects.values('name'))
    trainers = list(
        TrainerProfile.objects
        .select_related('user')
        .values('user_id', 'user__first_name', 'user__last_name')
    )
    for trainer in trainers:
        first = (trainer.get('user__first_name') or '').strip()
        last = (trainer.get('user__last_name') or '').strip()
        trainer['display_name'] = (f"{first} {last}".strip() or first or f"Trainer {trainer['user_id']}")

    tpos = list(
        TpoProfile.objects
        .select_related('user')
        .values('user_id', 'user__first_name', 'user__last_name')
    )
    for tpo in tpos:
        first = (tpo.get('user__first_name') or '').strip()
        last = (tpo.get('user__last_name') or '').strip()
        tpo['display_name'] = (f"{first} {last}".strip() or first or f"TPO {tpo['user_id']}")
    
    return JsonResponse({
        'domains': domains,
        'colleges': colleges,
        'courses': courses,
        'sections': sections,
        'trainers': trainers,
        'tpos': tpos,
    })

# Add Exam
@login_required
@user_passes_test(is_admin)
@require_POST
def add_exam(request):
    try:
        data = json.loads(request.body)
        form = ExamForm(data)
        if form.is_valid():
            form.save()
            return JsonResponse({'status': 'success', 'message': 'Exam added successfully'})
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid data', 'errors': form.errors}, status=400)
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Something went wrong. Please try again.'}, status=400)

# Update Exam
@login_required
@user_passes_test(is_admin)
@require_POST
def update_exam(request, pk):
    try:
        data = json.loads(request.body)
        exam = get_object_or_404(Exam, pk=pk)
        form = ExamForm(data, instance=exam)
        if form.is_valid():
            form.save()
            return JsonResponse({'status': 'success', 'message': 'Exam updated successfully'})
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid data', 'errors': form.errors}, status=400)
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Something went wrong. Please try again.'}, status=400)

# Delete Exam
@login_required
@user_passes_test(is_admin)
@require_POST
def delete_exam(request, pk):
    try:
        exam = get_object_or_404(Exam, pk=pk)
        exam.delete()
        return JsonResponse({'status': 'success', 'message': 'Exam deleted successfully'})
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Unable to delete exam. Please try again.'}, status=400)

# Fetch Questions for Exam
@login_required
@user_passes_test(is_admin)
def get_exam_questions(request, pk):
    try:
        exam = get_object_or_404(Exam, pk=pk)
        questions = ExamQuestion.objects.filter(exam=exam)
        q_list = []
        for q in questions:
            q_list.append({
                'id': q.id,
                'question_text': q.question_text,
                'type': q.type,
                'section_tag': getattr(q, 'section_tag', None),
                'marks': q.marks,
                'negative_mark': q.negative_mark,
                'options': q.options,
                'correct_answer': q.correct_answer,
                'test_cases': q.test_cases,
                'input_example': q.input_example,
                'expected_output': q.expected_output,
                'expected_keywords': q.expected_keywords,
                'min_characters': q.min_characters,
                'image_url': q.image.url if q.image else None,
            })
        return JsonResponse({'status': 'success', 'questions': q_list})
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Failed to fetch questions'}, status=400)

# Add Question
@login_required
@user_passes_test(is_admin)
@require_POST
def add_question(request, exam_id):
    exam = get_object_or_404(Exam, pk=exam_id)
    if request.content_type.startswith('multipart/form-data'):
        section_tag = request.POST.get("section_tag", "").strip() or request.POST.get("tag", "").strip()
    else:
        data = json.loads(request.body)
        section_tag = str(data.get("section_tag", "") or data.get("tag", "")).strip()
    # Try multipart/form-data first
    if request.content_type.startswith('multipart/form-data'):
        form = ExamQuestionForm(request.POST, request.FILES)
    else:
        form = ExamQuestionForm(data)
    if form.is_valid():
        q = form.save(commit=False)
        q.exam = exam
        q.section_tag = section_tag if section_tag else None
        q.save()
        return JsonResponse({'status': 'success', 'message': 'Question added successfully'})
    else:
        return JsonResponse({'status': 'error', 'message': 'Invalid data', 'errors': form.errors}, status=400)

# Update Question
@login_required
@user_passes_test(is_admin)
@require_POST
def update_question(request, exam_id, question_id):
    exam = get_object_or_404(Exam, pk=exam_id)
    question = get_object_or_404(ExamQuestion, pk=question_id, exam=exam)
    if request.content_type.startswith('multipart/form-data'):
        section_tag = request.POST.get("section_tag", "").strip() or request.POST.get("tag", "").strip()
    else:
        data = json.loads(request.body)
        section_tag = str(data.get("section_tag", "") or data.get("tag", "")).strip()
    if request.content_type.startswith('multipart/form-data'):
        form = ExamQuestionForm(request.POST, request.FILES, instance=question)
    else:
        form = ExamQuestionForm(data, instance=question)
    if form.is_valid():
        q = form.save(commit=False)
        q.section_tag = section_tag if section_tag else None
        q.save()
        return JsonResponse({'status': 'success', 'message': 'Question updated successfully'})
    else:
        return JsonResponse({'status': 'error', 'message': 'Invalid data', 'errors': form.errors}, status=400)

# Delete Question
@login_required
@user_passes_test(is_admin)
@require_POST
def delete_question(request, exam_id, question_id):
    try:
        question = get_object_or_404(ExamQuestion, pk=question_id, exam__pk=exam_id)
        question.delete()
        return JsonResponse({'status': 'success', 'message': 'Question deleted successfully'})
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Unable to delete question.'}, status=400)

# Schedule Exam
@login_required
@user_passes_test(is_admin_trainer_tpo)
@require_POST
def schedule_exam(request, exam_id):
    """
    Robust schedule endpoint:
     - Accepts JSON or form-encoded payloads.
     - Normalizes datetime-local values.
     - Allows duplicate schedules for same batch.
     - Adds admin control: whether result is released to students.
    """
    try:
        logger.info(f"=== Schedule Exam Request Received ===")
        logger.info(f"Exam ID: {exam_id}")
        logger.info(f"Request Method: {request.method}")
        logger.info(f"Content-Type: {request.content_type}")

        exam = get_object_or_404(Exam, pk=exam_id)
        logger.info(f"Exam found: {exam.title}")

        data = _parse_request_payload(request)
        logger.info(f"Parsed data: {data}")

        result_released = _coerce_bool(data.get("result_released", False))
        require_attendance = _coerce_bool(data.get("require_attendance", False))
        live_exam_monitor = _coerce_bool(data.get("live_exam_monitor", False))

        section_values = _normalize_list_value(data.get("section"))
        data["section"] = ",".join(section_values) if section_values else None

        colleges = _normalize_list_value(data.get("college"))
        courses = _normalize_list_value(data.get("course"))
        semesters = []
        years = []

        for key, target in (("semester", semesters), ("year", years)):
            raw_values = _normalize_list_value(data.get(key))
            for value in raw_values:
                try:
                    target.append(int(value))
                except (ValueError, TypeError):
                    return JsonResponse({
                        'status': 'error',
                        'message': f'Invalid {key} value: must be a number'
                    }, status=400)

        if not colleges or not courses or not semesters or not years:
            return JsonResponse({
                'status': 'error',
                'message': 'Please select at least one college, course, semester, and year.'
            }, status=400)

        for key in ["monitor_trainers", "monitor_tpos"]:
            if key in data:
                data[key] = _normalize_list_value(data.get(key))

        random_q_count = data.get("random_question_count")
        if random_q_count not in (None, ""):
            try:
                data["random_question_count"] = max(0, int(random_q_count))
            except (ValueError, TypeError):
                data["random_question_count"] = None
        else:
            data["random_question_count"] = None

        data['start_datetime'] = _parse_browser_datetime(data.get('start_datetime'))
        data['end_datetime'] = _parse_browser_datetime(data.get('end_datetime'))
        logger.info(
            f"After datetime normalization: start={data.get('start_datetime')}, "
            f"end={data.get('end_datetime')}"
        )

        combo_payloads = []
        for college_id, course_id, semester_val, year_val in product(colleges, courses, semesters, years):
            combo_payload = dict(data)
            combo_payload["college"] = college_id
            combo_payload["course"] = course_id
            combo_payload["semester"] = semester_val
            combo_payload["year"] = year_val
            combo_payloads.append(combo_payload)

        logger.info(f"Scheduling {len(combo_payloads)} combinations")

        with transaction.atomic():
            created_schedules = []
            for combo_payload in combo_payloads:
                form = ScheduleExamForm(combo_payload, instance=ScheduledExam(exam=exam))
                logger.info("Form created, validating...")

                if not form.is_valid():
                    errors = {k: list(v) for k, v in form.errors.items()}
                    logger.error(f"=== Form Validation Failed ===")
                    logger.error(f"Exam ID: {exam_id}")
                    logger.error(f"Errors: {json.dumps(errors, indent=2)}")
                    logger.error(f"Received data: {json.dumps(combo_payload, default=str, indent=2)}")
                    return JsonResponse({
                        'status': 'error',
                        'message': 'Form validation failed',
                        'errors': errors
                    }, status=400)

                cleaned = form.cleaned_data
                schedule = form.save(commit=False)
                schedule.exam = exam
                schedule.result_released = result_released
                schedule.require_attendance = require_attendance
                schedule.live_exam_monitor = live_exam_monitor
                schedule.save()
                form.save_m2m()
                created_schedules.append(schedule)

            logger.info("=== Schedule Created Successfully ===")
            first_schedule = created_schedules[0]
            logger.info(f"Schedule IDs: {[str(s.id) for s in created_schedules]}")
            logger.info(f"Exam: {exam.title}")
            logger.info(f"College: {first_schedule.college.name}")
            logger.info(f"Course: {first_schedule.course.name}")
            logger.info(f"Semester: {first_schedule.semester}, Year: {first_schedule.year}")
            logger.info(f"Result Released: {result_released}")
            logger.info(f"Trainers: {first_schedule.monitor_trainers.count()}, TPOs: {first_schedule.monitor_tpos.count()}")

            return JsonResponse({
                'status': 'success',
                'message': (
                    f'Exam "{exam.title}" scheduled successfully for {len(created_schedules)} combinations '
                    f'(Result Released: {"Yes" if result_released else "No"})'
                ),
                'schedule_ids': [str(schedule.id) for schedule in created_schedules],
                'created_count': len(created_schedules)
            })

    except Exam.DoesNotExist:
        logger.error(f"Exam not found: {exam_id}")
        return JsonResponse({
            'status': 'error',
            'message': 'Exam not found'
        }, status=404)

    except Exception as exc:
        logger.exception("=== Unexpected Error Scheduling Exam ===")
        logger.exception(f"Exam ID: {exam_id}")
        logger.exception(f"Error: {exc}")
        return JsonResponse({
            'status': 'error',
            'message': f'Unable to schedule exam: {str(exc)}'
        }, status=500)


# List Exams (JSON for admin panel)
@login_required
@user_passes_test(is_admin)
def admin_list_exams(request):
    exams = Exam.objects.select_related('domain').all()
    data = []
    for e in exams:
        data.append({
            'id': str(e.id),
            'title': e.title,
            'domain': str(e.domain.id) if e.domain else None,
            'domain_name': e.domain.domain_name if e.domain else "",
            'passing_marks': e.passing_marks,
            'max_marks': e.max_marks,
            'duration_minutes': e.duration_minutes,
            'questions_to_display': getattr(e, 'questions_to_display', 0),
            'question_count': ExamQuestion.objects.filter(exam=e).count(),
        })
    return JsonResponse({'exams': data})

# List Scheduled Exams (JSON for admin panel)
@login_required
@user_passes_test(is_admin_trainer_tpo)
@require_GET
def admin_list_scheduled_exams(request):
    """List all scheduled exams (for admin dashboard)."""
    try:
        check_and_update_scheduled_exams()
        schedules = (
            ScheduledExam.objects
            .select_related("exam", "college", "course")
            .prefetch_related("monitor_trainers__user", "monitor_tpos__user")
            .order_by("-start_datetime")
        )

        data = []
        for sch in schedules:
            start_local = timezone.localtime(sch.start_datetime) if sch.start_datetime else None
            end_local = timezone.localtime(sch.end_datetime) if sch.end_datetime else None
            data.append({
                "id": str(sch.id),
                "exam_id": str(sch.exam.id),
                "college_id": sch.college.id if sch.college else None,
                "course_id": sch.course.id if sch.course else None,
                "section_id": getattr(sch, "section", None),
                "exam_title": sch.exam.title if sch.exam else "N/A",
                "college_name": sch.college.name if sch.college else "N/A",
                "course_name": sch.course.name if sch.course else "N/A",
                "section_name": getattr(sch, "section", None) or "N/A",
                "semester": sch.semester,
                "year": sch.year,
                "start_datetime": start_local.strftime("%d-%m-%Y %I:%M %p") if start_local else "N/A",
                "end_datetime": end_local.strftime("%d-%m-%Y %I:%M %p") if end_local else "N/A",
                "start_datetime_iso": start_local.isoformat() if start_local else None,
                "end_datetime_iso": end_local.isoformat() if end_local else None,
                "status": sch.status,
                "require_attendance": getattr(sch, "require_attendance", False),
                # OK new field safely accessed
                "result_released": getattr(sch, "result_released", False),
                "allowed_tab_switches": getattr(sch, "allowed_tab_switches", 3),
                "random_question_count": getattr(sch, "random_question_count", None),
                "questions_to_display": getattr(sch, "random_question_count", None) or getattr(sch.exam, "questions_to_display", 0),
                "live_exam_monitor": getattr(sch, "live_exam_monitor", False),
                "monitor_trainers": [
                    t.user_id for t in sch.monitor_trainers.all()
                ],
                "monitor_trainers_names": [
                    t.user.get_full_name().strip() or t.user.first_name or f"Trainer {t.user_id}"
                    for t in sch.monitor_trainers.all()
                ],
                "monitor_tpos": [
                    t.user_id for t in sch.monitor_tpos.all()
                ],
                "monitor_tpos_names": [
                    t.user.get_full_name().strip() or t.user.first_name or f"TPO {t.user_id}"
                    for t in sch.monitor_tpos.all()
                ],
            })

        return JsonResponse({"status": "success", "schedules": data})

    except Exception as e:
        logger.exception("Error listing scheduled exams")
        return JsonResponse({
            "status": "error",
            "message": "Failed to load scheduled exams",
            "error": str(e)
        }, status=500)

def _normalize_question_time_map(value):
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, seconds in value.items():
        try:
            sec_int = max(0, int(seconds))
        except (TypeError, ValueError):
            sec_int = 0
        out[str(key)] = sec_int
    return out


def _compute_risk_score(tab_switch_count, tab_limit, current_question, question_time_map):
    risk_score = int(tab_switch_count) * 10

    if tab_switch_count >= tab_limit:
        risk_score += 30

    if current_question and current_question > 1 and question_time_map:
        values = list(question_time_map.values())
        if values:
            avg_time = sum(values) / len(values)
            if avg_time < 20:
                risk_score += 20

    return min(risk_score, 100)


def _build_live_monitor_payload(schedule):
    students_qs = StudentProfile.objects.filter(
        is_current=True,
        college=schedule.college,
        course=schedule.course,
        semester=schedule.semester,
        year=schedule.year,
    ).select_related("user", "section")

    if schedule.section:
        selected_sections = [s.strip() for s in schedule.section.split(",") if s.strip()]
        if selected_sections:
            students_qs = students_qs.filter(section__name__in=selected_sections)

    submissions = (
        ExamResult.objects
        .select_related("student", "student__user")
        .filter(scheduled_exam=schedule)
        .order_by("student_id", "-submitted_at")
    )

    submission_map = {}
    for submission in submissions:
        sid = str(submission.student_id)
        if sid not in submission_map:
            submission_map[sid] = submission

    total_pool_questions = ExamQuestion.objects.filter(exam=schedule.exam).count()
    target_count = getattr(schedule, "random_question_count", None) or getattr(schedule.exam, "questions_to_display", 0)
    default_total_questions = target_count if (target_count and 0 < target_count < total_pool_questions) else total_pool_questions
    tab_limit = int(getattr(schedule, "allowed_tab_switches", 3) or 3)

    rows = []
    active_count = 0
    submitted_count = 0
    not_started_count = 0

    for student in students_qs.order_by("usn"):
        sub = submission_map.get(str(student.id))

        status_key = "not_started"
        status_label = "Not Started"
        current_question = None
        tab_switch_count = 0
        result_id = None
        time_spent = {}

        if sub:
            raw_status = (
                getattr(sub, "status", None)
                or getattr(sub, "live_status", None)
                or getattr(sub, "submission_status", None)
                or "submitted"
            )
            raw_status = str(raw_status).lower().strip()

            current_question = getattr(sub, "current_question", None)
            tab_switch_count = int(
                getattr(sub, "tab_switch_count", None)
                or getattr(sub, "tab_switches", 0)
                or 0
            )
            result_id = str(sub.id)
            time_spent = _normalize_question_time_map(getattr(sub, "question_time_map", {}) or {})

            if raw_status in {"submitted", "retaken", "accidental_submit"}:
                if tab_switch_count >= tab_limit:
                    status_key = "accidental_submit"
                    status_label = "Auto Submitted"
                else:
                    status_key = raw_status
                    if raw_status == "accidental_submit":
                        status_label = "Auto Submitted"
                    else:
                        status_label = "Self Submitted"
            elif raw_status == "retake_allowed" or getattr(sub, "is_retaken_result", False):
                status_key = "retake_allowed"
                status_label = "Retake Allowed"
            else:
                if timezone.now() > schedule.end_datetime:
                    status_key = "not_submitted"
                    status_label = "Not Submitted"
                else:
                    status_key = "active"
                    status_label = "Active"

        if status_key in {"submitted", "retaken", "accidental_submit"}:
            submitted_count += 1
        elif status_key in {"not_started", "retake_allowed", "not_submitted"}:
            not_started_count += 1
        else:
            active_count += 1

        full_name = (student.user.get_full_name() or "").strip() or student.user.username

        risk_score = _compute_risk_score(
            tab_switch_count=tab_switch_count,
            tab_limit=tab_limit,
            current_question=int(current_question or 0),
            question_time_map=time_spent,
        )

        is_online = False
        if sub and status_key == "active":
            last_active = getattr(sub, "last_active_at", None)
            if last_active:
                is_online = (timezone.now() - last_active).total_seconds() < 15

        student_total_q = len(sub.selected_question_ids) if (sub and sub.selected_question_ids) else default_total_questions

        rows.append({
            "result_id": result_id,
            "student_id": str(student.id),
            "usn": student.usn,
            "name": full_name,
            "status": status_label,
            "status_key": status_key,
            "is_online": is_online,
            "current_question": current_question,
            "total_questions": student_total_q,
            "tab_switches": tab_switch_count,
            "tab_switch_count": tab_switch_count,
            "tab_limit_crossed": tab_switch_count >= tab_limit,
            "tab_switch_limit": tab_limit,
            "time_spent": time_spent,
            "risk_score": risk_score,
            "section": getattr(student.section, "name", "") or "",
            "course": schedule.course.name if schedule.course else "",
            "device_info": getattr(sub, "device_info", "") or "-",
            "device_type": getattr(sub, "device_type", "") or "-",
            "os_name": getattr(sub, "os_name", "") or "-",
            "browser_name": getattr(sub, "browser_name", "") or "-",
            "ip_address": getattr(sub, "ip_address", "") or "-",
        })

    return {
        "students": rows,
        "summary": {
            "total": students_qs.count(),
            "active": active_count,
            "submitted": submitted_count,
            "not_started": not_started_count,
        }
    }


@login_required
@user_passes_test(is_admin)
@require_GET
def admin_exam_submissions(request, schedule_id):
    """
    Return live monitoring data for an entire scheduled batch:
    - all students in the scheduled batch
    - merged submission status per student
    - summary counters for dashboard cards
    """
    try:
        schedule = get_object_or_404(
            ScheduledExam.objects.select_related("exam"),
            id=schedule_id
        )

        payload = _build_live_monitor_payload(schedule)
        data = payload["students"]
        summary = payload["summary"]
        total_students = summary["total"]
        active_count = summary["active"]
        submitted_count = summary["submitted"]
        not_started_count = summary["not_started"]

        return JsonResponse({
            "status": "success",
            "exam_title": schedule.exam.title,
            "students": data,
            "total_students": total_students,
            "active_students": active_count,
            "submitted_students": submitted_count,
            "not_started_students": not_started_count,
            "summary": {
                "total": total_students,
                "active": active_count,
                "submitted": submitted_count,
                "not_started": not_started_count,
            }
        })

    except Exception as e:
        logger.exception("Error fetching live exam monitor data")
        return JsonResponse({
            "status": "error",
            "message": str(e)
        }, status=500)


@login_required
@user_passes_test(is_admin)
@require_GET
def download_live_attendance_report(request, schedule_id):
    try:
        schedule = get_object_or_404(
            ScheduledExam.objects.select_related("exam"),
            id=schedule_id
        )

        payload = _build_live_monitor_payload(schedule)
        rows = payload["students"]

        result_ids = [
            r.get("result_id")
            for r in rows
            if r.get("result_id")
        ]
        results_map = {
            str(result.id): result
            for result in ExamResult.objects.filter(id__in=result_ids).select_related("student", "student__section")
        }

        question_rows = ExamQuestion.objects.filter(exam=schedule.exam).values("id", "section_tag", "marks")
        question_meta = {
            str(q["id"]): {
                "section_tag": (q.get("section_tag") or "General").strip() or "General",
                "marks": float(q.get("marks") or 0),
            }
            for q in question_rows
        }

        def _format_time_spent(time_map):
            if not isinstance(time_map, dict) or not time_map:
                return "-"

            def _sort_key(item):
                key = str(item[0])
                return (0, int(key)) if key.isdigit() else (1, key)

            pairs = sorted(time_map.items(), key=_sort_key)
            return " | ".join([f"Q{k}: {v}s" for k, v in pairs])

        def _submission_mode_label(result_obj):
            if not result_obj:
                return "Not Started"
            status_key = str(getattr(result_obj, "submission_status", "") or "").lower()
            if status_key == "accidental_submit":
                return "Auto Submitted (Tab Switch)"
            if status_key in {"submitted", "retaken"}:
                return "Self Submitted"
            if status_key == "retake_allowed":
                return "Retake Allowed"
            return status_key.replace("_", " ").title() if status_key else "Unknown"

        def _topic_analysis_string(result_obj):
            if not result_obj:
                return "-"

            breakdown = getattr(result_obj, "question_wise_breakdown", None)
            if not isinstance(breakdown, list):
                return "-"

            by_topic = {}
            for item in breakdown:
                if not isinstance(item, dict):
                    continue

                question_id = str(item.get("question_id") or "")
                meta = question_meta.get(question_id, {"section_tag": "General", "marks": 0.0})
                topic = meta["section_tag"]

                if topic not in by_topic:
                    by_topic[topic] = {
                        "attempted": 0,
                        "correct": 0,
                        "marks_obtained": 0.0,
                        "total_marks": 0.0,
                        "total_questions": 0,
                    }

                bucket = by_topic[topic]
                bucket["total_questions"] += 1
                bucket["total_marks"] += float(meta.get("marks") or 0)

                student_answer = item.get("student_answer")
                if student_answer not in (None, ""):
                    bucket["attempted"] += 1
                if bool(item.get("correct")):
                    bucket["correct"] += 1
                bucket["marks_obtained"] += float(item.get("marks_awarded") or 0)

            if not by_topic:
                return "-"

            parts = []
            for topic in sorted(by_topic.keys()):
                d = by_topic[topic]
                unattempted = max(d["total_questions"] - d["attempted"], 0)
                parts.append(
                    f"{topic}: A {d['attempted']}, U {unattempted}, C {d['correct']}, M {d['marks_obtained']:.1f}/{d['total_marks']:.1f}"
                )
            return " ; ".join(parts)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="live_monitor_report.csv"'

        writer = csv.writer(response)
        writer.writerow([
            "USN",
            "Name",
            "Section",
            "Status",
            "Submission Mode",
            "Current Question",
            "Attempted Questions",
            "Unattempted Questions",
            "Tab Switch",
            "Time Spent (Each Question)",
            "Risk Score",
            "Topic Wise Analysis",
            "Device / Environment",
            "Operating System",
            "Browser",
            "IP Address",
        ])

        for student in rows:
            result_obj = results_map.get(str(student.get("result_id") or ""))
            current_q = student.get("current_question") or "-"
            total_q = student.get("total_questions") or "-"
            current_q_display = f"Q {current_q}/{total_q}" if current_q != "-" else "-"
            attempted_questions = getattr(result_obj, "attempted_questions", None)
            if attempted_questions is None:
                attempted_questions = 0
            total_questions = int(student.get("total_questions") or 0)
            unattempted_questions = max(total_questions - int(attempted_questions), 0)
            writer.writerow([
                student.get("usn", ""),
                student.get("name", ""),
                student.get("section", ""),
                student.get("status", "Not Started"),
                _submission_mode_label(result_obj),
                current_q_display,
                attempted_questions,
                unattempted_questions,
                student.get("tab_switch_count", 0),
                _format_time_spent(student.get("time_spent", {})),
                f"{student.get('risk_score', 0)}%",
                _topic_analysis_string(result_obj),
                getattr(result_obj, "device_info", "") or student.get("device_info", "-"),
                getattr(result_obj, "os_name", "") or student.get("os_name", "-"),
                getattr(result_obj, "browser_name", "") or student.get("browser_name", "-"),
                getattr(result_obj, "ip_address", "") or student.get("ip_address", "-"),
            ])

        return response

    except Exception as exc:
        logger.exception("Failed to download live attendance report")
        return JsonResponse({"status": "error", "message": str(exc)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def allow_exam_retake(request, result_id):
    """
    Allow one retake for accidental submission.
    """
    try:
        result = get_object_or_404(ExamResult, id=result_id)

        data = json.loads(request.body)
        reason = data.get(
            "reason",
            "Accidental tab switch auto-submit"
        )

        result.allow_retake = True
        result.submission_status = "retake_allowed"
        result.live_status = "not_started"
        result.retake_reason = reason
        result.retake_allowed_at = timezone.now()
        result.retake_allowed_by = request.user
        result.save()

        return JsonResponse({
            "status": "success",
            "message": f"Retake allowed for {result.student.usn}"
        })

    except Exception as e:
        logger.exception("Error allowing retake")
        return JsonResponse({
            "status": "error",
            "message": str(e)
        }, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def remove_student_exam_attempt(request, result_id):
    try:
        result = get_object_or_404(ExamResult, id=result_id)
        student_usn = result.student.usn
        result.delete()
        return JsonResponse({
            "status": "success",
            "message": f"Attempt removed for student {student_usn}. They can now retake the exam from scratch."
        })
    except Exception as e:
        logger.exception("Failed to remove student exam attempt")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


# Delete Scheduled Exam
@login_required
@user_passes_test(is_admin)
@require_POST
def admin_delete_schedule(request, pk):
    try:
        schedule = get_object_or_404(ScheduledExam, pk=pk)
        schedule.delete()
        return JsonResponse({'status': 'success', 'message': 'Scheduled exam deleted.'})
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Unable to delete scheduled exam.'}, status=400)

# Update Scheduled Exam
@login_required
@user_passes_test(is_admin_trainer_tpo)
@require_POST
def update_scheduled_exam(request, pk):
    try:
        data = _parse_request_payload(request)
        schedule = get_object_or_404(ScheduledExam, pk=pk)

        section_val = data.get("section")
        if isinstance(section_val, list):
            cleaned_sections = [str(x).strip() for x in section_val if str(x).strip()]
            data["section"] = ",".join(cleaned_sections) if cleaned_sections else None
        elif isinstance(section_val, str):
            section_val = section_val.strip()
            data["section"] = section_val or None
        elif section_val is None:
            data["section"] = None

        for key in ["monitor_trainers", "monitor_tpos"]:
            if key in data:
                data[key] = _normalize_list_value(data.get(key))

        data["start_datetime"] = _parse_browser_datetime(data.get("start_datetime"))
        data["end_datetime"] = _parse_browser_datetime(data.get("end_datetime"))

        for key in ["semester", "year", "course", "allowed_tab_switches", "random_question_count"]:
            if key in data and data[key] not in (None, ""):
                try:
                    data[key] = int(data[key])
                except (ValueError, TypeError):
                    if key == "random_question_count":
                        data[key] = None
                    else:
                        return JsonResponse(
                            {'status': 'error', 'message': f'Invalid {key} value'},
                            status=400
                        )

        form = ScheduleExamForm(data, instance=schedule)
        if form.is_valid():
            updated_schedule = form.save(commit=False)
            updated_schedule.result_released = _coerce_bool(data.get("result_released", schedule.result_released))
            updated_schedule.require_attendance = _coerce_bool(data.get("require_attendance", schedule.require_attendance))
            updated_schedule.live_exam_monitor = _coerce_bool(data.get("live_exam_monitor", schedule.live_exam_monitor))
            updated_schedule.save()
            form.save_m2m()
            return JsonResponse({'status': 'success', 'message': 'Schedule updated successfully'})
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid data', 'errors': form.errors}, status=400)
    except Exception as e:
        logger.exception("Unable to update schedule")
        return JsonResponse({'status': 'error', 'message': "Unable to update Schedule Data "}, status=400)

@login_required
@user_passes_test(is_admin)
def admin_download_exam_paper(request, pk):
    """
    Download the question paper as DOCX. Falls back to TXT if python-docx isn't available.
    """
    exam = get_object_or_404(Exam.objects.select_related("domain"), pk=pk)
    qs = ExamQuestion.objects.filter(exam=exam).order_by("id")

    # DOCX preferred
    if Document is not None:
        doc = Document()
        doc.add_heading(exam.title, level=1)
        if exam.domain:
            doc.add_paragraph(f"Domain: {exam.domain.domain_name}")
        doc.add_paragraph(f"Total Marks: {sum(q.marks for q in qs)}")
        doc.add_paragraph("")

        for idx, q in enumerate(qs, start=1):
            doc.add_paragraph(f"Q{idx}. ({q.type}) [{q.marks} marks]")
            p = doc.add_paragraph()
            p.add_run(q.question_text).bold = False

            if q.type == "MCQ":
                opts = q.options or []
                labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                for i, opt in enumerate(opts):
                    doc.add_paragraph(f"{labels[i]}. {opt}", style=None)
            elif q.type == "TF":
                doc.add_paragraph("A. True")
                doc.add_paragraph("B. False")
            elif q.type == "Code":
                if q.input_example:
                    doc.add_paragraph(f"Example Input: {q.input_example}")
                if q.expected_output:
                    doc.add_paragraph(f"Example Output: {q.expected_output}")
            elif q.type == "DESC":
                if q.min_characters:
                    doc.add_paragraph(f"Min Characters: {q.min_characters}")

            doc.add_paragraph("")  # spacer

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        resp = HttpResponse(buf.read(), content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        resp["Content-Disposition"] = f'attachment; filename="{_normalize_str(exam.title) or "exam"}_paper.docx"'
        return resp

    # TXT fallback
    buf = io.StringIO()
    buf.write(f"{exam.title}\n")
    if exam.domain:
        buf.write(f"Domain: {exam.domain.domain_name}\n")
    buf.write(f"Total Marks: {sum(q.marks for q in qs)}\n\n")
    for idx, q in enumerate(qs, start=1):
        buf.write(f"Q{idx}. ({q.type}) [{q.marks} marks]\n")
        buf.write(q.question_text + "\n")
        if q.type == "MCQ":
            opts = q.options or []
            labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            for i, opt in enumerate(opts):
                buf.write(f"  {labels[i]}. {opt}\n")
        elif q.type == "TF":
            buf.write("  A. True\n  B. False\n")
        elif q.type == "Code":
            if q.input_example:
                buf.write(f"  Example Input: {q.input_example}\n")
            if q.expected_output:
                buf.write(f"  Example Output: {q.expected_output}\n")
        elif q.type == "DESC":
            if q.min_characters:
                buf.write(f"  Min Characters: {q.min_characters}\n")
        buf.write("\n")
    resp = HttpResponse(buf.getvalue(), content_type="text/plain; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{_normalize_str(exam.title) or "exam"}_paper.txt"'
    return resp


@login_required
@user_passes_test(is_admin)
@require_POST
def admin_bulk_upload_questions(request, exam_id):
    """
    Bulk create questions from CSV, XLSX, or DOCX.
    Expected columns (case-insensitive; extra columns ignored):
      - type [MCQ|TF|Code|DESC]
      - question_text
      - marks
      - negative_mark (optional)
      - options (JSON array or pipe/comma separated)  [MCQ]
      - correct_answer                               [MCQ|TF]
      - input_example, expected_output               [Code]
      - test_cases (JSON list of {input,output} or tc_inputN/tc_outputN pairs)
      - expected_keywords (JSON array or pipe/comma) [DESC]
      - min_characters                               [DESC]
      - opt1..opt6 (optional alternative to 'options') [MCQ]
      - tc_input1, tc_output1, tc_input2, tc_output2 ... (up to 10 pairs)
    """
    exam = get_object_or_404(Exam, pk=exam_id)

    if "file" not in request.FILES:
        return JsonResponse({"status": "error", "message": "No file uploaded."}, status=400)

    up = request.FILES["file"]
    name = (up.name or "").lower()

    rows = []
    try:
        if name.endswith(".csv"):
            import csv, io
            text = up.read().decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)

        elif name.endswith(".xlsx") or name.endswith(".xls"):
            if openpyxl is None:
                return JsonResponse({"status": "error", "message": "XLSX support not installed (openpyxl). Upload CSV or DOCX instead."}, status=400)
            wb = openpyxl.load_workbook(up)
            ws = wb.active
            headers = [str(c.value).strip() if c.value is not None else "" for c in next(ws.iter_rows(min_row=1, max_row=1))]
            for r in ws.iter_rows(min_row=2, values_only=True):
                row = {headers[i].strip(): ("" if r[i] is None else str(r[i])) for i in range(len(headers))}
                rows.append(row)

        elif name.endswith(".docx"):
            if Document is None:
                return JsonResponse({"status": "error", "message": "DOCX support not installed (python-docx). Upload XLSX/CSV instead."}, status=400)
            # Expect the first table to contain the questions, first row = headers
            doc = Document(up)
            if not doc.tables:
                return JsonResponse({"status": "error", "message": "No table found in DOCX. Please use the provided table template."}, status=400)
            table = doc.tables[0]
            if len(table.rows) < 2:
                return JsonResponse({"status": "error", "message": "DOCX table must have a header row and at least one data row."}, status=400)
            headers = [cell.text.strip() for cell in table.rows[0].cells]
            for row in table.rows[1:]:
                d = {}
                cells = row.cells
                for i, h in enumerate(headers):
                    v = cells[i].text if i < len(cells) else ""
                    d[h] = v.strip() if v else ""
                rows.append(d)

        else:
            return JsonResponse({"status": "error", "message": "Unsupported file type. Use CSV, XLSX, or DOCX."}, status=400)

    except Exception as e:
        return JsonResponse({"status": "error", "message": f"Failed to read file: {e}"}, status=400)

    # ---------- Same normalization/validation as before ----------
    def g(row, key):
        # case-insensitive get
        for k in row.keys():
            if k.lower() == key.lower():
                return row[k]
        return ""

    created = 0
    errors = []
    bulk = []

    with transaction.atomic():
        for idx, row in enumerate(rows, start=2):  # header is row 1
            try:
                qtype = _normalize_str(g(row, "type")).upper()
                if qtype not in {"MCQ", "TF", "CODE", "DESC"}:
                    raise ValueError("Invalid type. Use MCQ/TF/Code/DESC.")

                question_text = g(row, "question_text")
                if not question_text:
                    raise ValueError("question_text is required.")

                marks = float(g(row, "marks") or 0)
                negative_mark = float(g(row, "negative_mark") or 0)

                options = []
                correct_answer = None
                input_example = None
                expected_output = None
                test_cases = None
                expected_keywords = None
                min_characters = None

                if qtype == "MCQ":
                    # gather options from 'options' or opt1..opt6
                    options = _maybe_json_list(g(row, "options"))
                    if not options:
                        alt = []
                        for i in range(1, 7):
                            v = g(row, f"opt{i}")
                            if v:
                                alt.append(v.strip())
                        options = alt
                    if not options:
                        raise ValueError("MCQ needs options.")

                    correct_answer = _normalize_str(g(row, "correct_answer"))
                    if not correct_answer:
                        raise ValueError("MCQ needs correct_answer.")
                    if correct_answer not in options:
                        labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                        if correct_answer.upper() in labels[:len(options)]:
                            correct_answer = options[labels.index(correct_answer.upper())]
                        else:
                            raise ValueError("correct_answer must match one option text (or A/B/C/...).")

                elif qtype == "TF":
                    correct_answer = _normalize_str(g(row, "correct_answer")).capitalize()
                    if correct_answer not in {"True", "False"}:
                        raise ValueError("TF correct_answer must be True or False.")

                elif qtype == "CODE":
                    input_example = g(row, "input_example")
                    expected_output = g(row, "expected_output")
                    test_cases = _parse_test_cases(g(row, "test_cases"), row=row)
                    if not test_cases:
                        raise ValueError("Code requires test_cases (JSON list) or tc_inputN/tc_outputN pairs.")

                elif qtype == "DESC":
                    expected_keywords = _maybe_json_list(g(row, "expected_keywords"))
                    mc = g(row, "min_characters")
                    min_characters = int(float(mc)) if mc else None

                bulk.append(ExamQuestion(
                    exam=exam,
                    question_text=question_text,
                    type="Code" if qtype == "CODE" else qtype,
                    marks=marks,
                    negative_mark=negative_mark,
                    options=options if options else None,
                    correct_answer=correct_answer or None,
                    input_example=input_example or None,
                    expected_output=expected_output or None,
                    test_cases=test_cases or None,
                    expected_keywords=expected_keywords or None,
                    min_characters=min_characters,
                ))
                created += 1

            except Exception as e:
                errors.append(f"Row {idx}: {e}")

        if errors:
            transaction.set_rollback(True)
            return JsonResponse({"status": "error", "message": "Validation failed", "errors": errors}, status=400)

        ExamQuestion.objects.bulk_create(bulk)

    return JsonResponse({"status": "success", "message": f"Uploaded {created} questions."})


############# END OF ADMIN SECTION FOR CURD OF EXAM ########


################ Start OF STUDENT SECTION FOR EXAM ##########

def is_student(user):
    return user.is_authenticated and user.role == 'student'


LIVE_MONITOR_STATUSES = {"not_started", "active", "in_progress", "suspicious"}
FINAL_SUBMISSION_STATUSES = {"submitted", "accidental_submit", "retaken", "time_expired"}


def evaluate_and_finalize_scheduled_exam_result(result, answers_override=None, submission_mode_val=None):
    """
    Evaluates in-progress answers and finalizes an ExamResult to 'submitted' or 'accidental_submit'.
    Safe to call for any active or un-evaluated scheduled exam result.
    """
    exam = result.exam or (result.scheduled_exam.exam if result.scheduled_exam else None)
    if not exam:
        return result

    answers_map = {}
    if answers_override and isinstance(answers_override, list):
        for entry in answers_override:
            if isinstance(entry, dict):
                q_id = str(entry.get("question_id") or "")
                if q_id:
                    answers_map[q_id] = entry.get("answer")
    else:
        raw_answers = result.question_wise_breakdown or []
        if isinstance(raw_answers, list):
            for entry in raw_answers:
                if isinstance(entry, dict):
                    q_id = str(entry.get("question_id") or "")
                    ans = entry.get("answer") if "answer" in entry else entry.get("student_answer")
                    if q_id:
                        answers_map[q_id] = ans

    total = 0
    obtained = 0
    attempted = 0
    correct = 0
    wrong = 0
    breakdown = []

    if result.selected_question_ids and isinstance(result.selected_question_ids, list) and len(result.selected_question_ids) > 0:
        assigned_id_map = {q.id: q for q in ExamQuestion.objects.filter(exam=exam, id__in=result.selected_question_ids)}
        exam_questions = [assigned_id_map[qid] for qid in result.selected_question_ids if qid in assigned_id_map]
    else:
        assigned_ids = [int(k) for k in answers_map.keys() if str(k).isdigit()]
        pool_questions = list(ExamQuestion.objects.filter(exam=exam))
        if assigned_ids and len(assigned_ids) < len(pool_questions):
            assigned_id_map = {q.id: q for q in pool_questions if q.id in assigned_ids}
            exam_questions = [assigned_id_map[qid] for qid in assigned_ids if qid in assigned_id_map]
        else:
            exam_questions = pool_questions

    for q in exam_questions:
        q_id_str = str(q.id)
        if q_id_str not in answers_map or answers_map[q_id_str] is None or str(answers_map[q_id_str]).strip() == "":
            total += q.marks
            breakdown.append({
                "question_id": q_id_str,
                "type": q.type,
                "student_answer": None,
                "correct_answer": q.correct_answer if q.type in ["MCQ", "TF"] else None,
                "correct": False,
                "marks_awarded": 0
            })
            continue

        student_ans = answers_map[q_id_str]
        marks_awarded = 0
        is_correct = False

        if q.type in ["MCQ", "TF"]:
            if str(student_ans).strip() == str(q.correct_answer).strip():
                marks_awarded = q.marks
                is_correct = True
                correct += 1
            else:
                marks_awarded = -q.negative_mark
                wrong += 1
            breakdown.append({
                "question_id": str(q.id),
                "type": q.type,
                "student_answer": student_ans,
                "correct_answer": q.correct_answer,
                "correct": is_correct,
                "marks_awarded": marks_awarded
            })
        elif q.type == "Code":
            code_text = ""
            language = "python"
            if isinstance(student_ans, str):
                try:
                    parsed = json.loads(student_ans)
                    if isinstance(parsed, dict):
                        code_text = str(parsed.get("code", "") or "")
                        language = str(parsed.get("language", "python") or "python")
                    else:
                        code_text = student_ans
                except Exception:
                    code_text = student_ans
            else:
                code_text = str(student_ans or "")

            if not code_text.strip():
                marks_awarded = 0
                wrong += 1
                breakdown.append({
                    "question_id": str(q.id),
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": False,
                    "marks_awarded": 0,
                    "test_results": []
                })
                total += q.marks
                attempted += 1
                continue

            if q.test_cases and isinstance(q.test_cases, list) and len(q.test_cases) > 0:
                judge = evaluate_code_with_test_cases(
                    code_text,
                    language,
                    q.test_cases,
                    max_score=float(q.marks)
                )
                passed_cases = int(judge.get("passed", 0))
                total_cases = int(judge.get("total", 0))
                score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                marks_awarded = round(float(q.marks) * score_ratio, 2)
                is_correct = judge.get("verdict") == "Accepted"
                test_results = judge.get("details", [])

                if is_correct:
                    correct += 1
                else:
                    wrong += 1

                breakdown.append({
                    "question_id": str(q.id),
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": is_correct,
                    "marks_awarded": marks_awarded,
                    "test_results": test_results
                })
            else:
                if q.expected_output:
                    judge = evaluate_code_with_test_cases(
                        code_text,
                        language,
                        [{"input": q.input_example or "", "output": q.expected_output}],
                        max_score=float(q.marks)
                    )
                    passed_cases = int(judge.get("passed", 0))
                    total_cases = int(judge.get("total", 0))
                    score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                    marks_awarded = round(float(q.marks) * score_ratio, 2)
                    is_correct = judge.get("verdict") == "Accepted"

                    if is_correct:
                        correct += 1
                    else:
                        wrong += 1
                else:
                    marks_awarded = 0
                    wrong += 1

                breakdown.append({
                    "question_id": str(q.id),
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": is_correct,
                    "marks_awarded": marks_awarded
                })
        elif q.type == "DESC":
            if q.min_characters and len(str(student_ans).strip()) >= q.min_characters:
                marks_awarded = q.marks
            else:
                marks_awarded = 0

            breakdown.append({
                "question_id": str(q.id),
                "type": q.type,
                "student_answer": student_ans,
                "correct_answer": None,
                "correct": False,
                "marks_awarded": marks_awarded
            })

        obtained += marks_awarded
        total += q.marks
        attempted += 1

    tab_limit = 3
    if result.scheduled_exam:
        tab_limit = int(getattr(result.scheduled_exam, "allowed_tab_switches", 3) or 3)
    tab_switch_count = getattr(result, "tab_switch_count", 0) or 0

    if not submission_mode_val:
        if tab_switch_count >= tab_limit:
            status_to_save = "accidental_submit"
        else:
            status_to_save = "submitted"
    else:
        status_to_save = submission_mode_val

    result.exam = exam
    result.exam_title = exam.title
    result.total_marks = total
    result.marks_obtained = obtained
    result.attempted_questions = attempted
    result.correct_answers = correct
    result.wrong_answers = wrong
    result.question_wise_breakdown = breakdown
    result.selected_question_ids = [q.id for q in exam_questions]
    result.submission_status = status_to_save
    result.live_status = "submitted"
    if not result.time_taken and result.submitted_at:
        result.time_taken = timezone.now() - result.submitted_at
    result.save()
    return result


def check_and_update_scheduled_exams(schedule=None):
    """
    Checks scheduled exams and automatically:
    1. Activates scheduled exams when start_datetime <= now <= end_datetime (status -> 'started').
    2. Keeps upcoming exams as 'pending' when now < start_datetime.
    3. Deactivates scheduled exams when now > end_datetime (status -> 'completed').
    4. Evaluates and auto-submits any student attempts that were in progress when the deadline passed.
    """
    now = timezone.now()
    if schedule:
        schedules = [schedule]
    else:
        schedules = ScheduledExam.objects.filter(
            start_datetime__isnull=False,
            end_datetime__isnull=False
        )

    for sch in schedules:
        if sch.start_datetime and sch.end_datetime:
            if now < sch.start_datetime and sch.status != "completed":
                if sch.status != "pending":
                    sch.status = "pending"
                    ScheduledExam.objects.filter(id=sch.id).update(status="pending")
            elif sch.start_datetime <= now <= sch.end_datetime and sch.status != "completed":
                if sch.status != "started":
                    sch.status = "started"
                    ScheduledExam.objects.filter(id=sch.id).update(status="started")
            elif now > sch.end_datetime:
                if sch.status != "completed":
                    sch.status = "completed"
                    ScheduledExam.objects.filter(id=sch.id).update(status="completed")

                # Auto-finalize in-progress student attempts for this expired scheduled exam
                active_results = ExamResult.objects.filter(
                    scheduled_exam=sch
                ).exclude(submission_status__in=FINAL_SUBMISSION_STATUSES)

                for res in active_results:
                    try:
                        evaluate_and_finalize_scheduled_exam_result(res, submission_mode_val="submitted")
                    except Exception as e:
                        logger.exception("Failed to auto-finalize expired scheduled exam result %s: %s", res.id, e)


@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def student_get_exam(request):
    try:
        student = get_object_or_404(StudentProfile, user=request.user, is_current=True)
    except Exception as e:
        logger.error(f"Student profile not found for user {request.user.username}: {e}")
        return JsonResponse({"error": "Student profile not found", "exams": []}, status=404)
    
    now = timezone.now()
    upcoming_window = now + timedelta(days=30)  # show exams starting within next 30 days (increased from 6 hours)

    # Auto-activate and auto-deactivate scheduled exams
    check_and_update_scheduled_exams()

    logger.info(f"Student {student.usn} querying exams - College: {student.college.id}, Course: {student.course.id}, Semester: {student.semester}, Year: {student.year}")
    logger.info(f"Time window: {now} to {upcoming_window}")

    # Get all scheduled exams for debugging
    all_scheduled = ScheduledExam.objects.filter(
        status__in=["pending", "started"]
    ).select_related("exam", "college", "course")
    
    logger.info(f"Total active scheduled exams: {all_scheduled.count()}")
    for se in all_scheduled:
        logger.info(f"Scheduled Exam: {se.exam.title} - College: {se.college.id}, Course: {se.course.id}, Sem: {se.semester}, Year: {se.year}, Start: {se.start_datetime}, End: {se.end_datetime}")

    exams_qs = ScheduledExam.objects.filter(
        college=student.college,
        course=student.course,
        semester=student.semester,
        year=student.year,
        start_datetime__lte=upcoming_window,
        end_datetime__gte=now,
        status__in=["pending", "started"]
    ).select_related("exam")

    student_section_name = getattr(student.section, "name", "")
    student_section_name = student_section_name.strip() if student_section_name else ""

    exams = []
    for e in exams_qs:
        if not e.section:
            exams.append(e)
            continue

        selected_sections = [s.strip() for s in e.section.split(",") if s.strip()]
        if not selected_sections:
            exams.append(e)
            continue

        if student_section_name in selected_sections:
            exams.append(e)

    logger.info(f"Matching exams for student {student.usn}: {len(exams)}")

    exam_data = []
    seen_exam_ids = set()
    for e in exams:
        if e.exam.id in seen_exam_ids:
            continue

        start_local = timezone.localtime(e.start_datetime) if e.start_datetime else None
        end_local = timezone.localtime(e.end_datetime) if e.end_datetime else None
        # Check latest submission status for this exam.
        latest_submission = (
            ExamResult.objects
            .filter(student=student, exam=e.exam)
            .order_by("-submitted_at")
            .first()
        )
        already_attempted = (
            latest_submission is not None
            and latest_submission.submission_status in FINAL_SUBMISSION_STATUSES
        )
        if already_attempted:
            continue

        seen_exam_ids.add(e.exam.id)

        pool_count = ExamQuestion.objects.filter(exam=e.exam).count()
        target_count = getattr(e, "random_question_count", None) or getattr(e.exam, "questions_to_display", 0)
        effective_q_count = target_count if (target_count and 0 < target_count < pool_count) else pool_count

        exam_data.append({
            "scheduled_exam_id": str(e.id),
            "exam_id": str(e.exam.id),
            "title": e.exam.title,
            "duration": e.exam.duration_minutes,
            "allowed_tab_switches": e.allowed_tab_switches,
            "start": e.start_datetime,
            "end": e.end_datetime,
            "start_display": start_local.strftime("%d-%m-%Y") if start_local else "-",
            "start_time_display": start_local.strftime("%I:%M %p") if start_local else "-",
            "end_display": end_local.strftime("%d-%m-%Y") if end_local else "-",
            "end_time_display": end_local.strftime("%I:%M %p") if end_local else "-",
            "max_marks": e.exam.max_marks,
            "passing_marks": e.exam.passing_marks,
            "total_questions": effective_q_count,
            "already_attempted": already_attempted,
        })

    logger.info(f"Returning {len(exam_data)} exams to student {student.usn}")
    return JsonResponse({"exams": exam_data})
@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def student_get_exam_questions(request, scheduled_exam_id):
    student = get_object_or_404(StudentProfile, user=request.user, is_current=True)
    scheduled_exam = get_object_or_404(ScheduledExam, id=scheduled_exam_id)
    exam = scheduled_exam.exam
    now = timezone.now()

    if now < scheduled_exam.start_datetime:
        start_local = timezone.localtime(scheduled_exam.start_datetime) if scheduled_exam.start_datetime else None
        start_str = start_local.strftime("%d-%m-%Y %I:%M %p") if start_local else ""
        return JsonResponse({"error": f"Exam has not started yet. It will automatically activate on {start_str}."}, status=403)

    if now > scheduled_exam.end_datetime:
        end_local = timezone.localtime(scheduled_exam.end_datetime) if scheduled_exam.end_datetime else None
        end_str = end_local.strftime("%d-%m-%Y %I:%M %p") if end_local else ""
        return JsonResponse({"error": f"Exam time is over. The scheduled window closed on {end_str}."}, status=403)

    # Check if there is already a completed latest submission for this exam (any schedule)
    latest_exam_sub = (
        ExamResult.objects
        .filter(student=student, exam=exam)
        .order_by("-submitted_at")
        .first()
    )
    if latest_exam_sub and latest_exam_sub.submission_status in FINAL_SUBMISSION_STATUSES:
        return JsonResponse({"error": "Exam already attempted."}, status=403)

    device_token = request.GET.get("device_token")
    submission = (
        ExamResult.objects
        .filter(student=student, scheduled_exam=scheduled_exam)
        .order_by("-submitted_at")
        .first()
    )
    saved_answers = {}
    if submission:
        if submission.submission_status == "retake_allowed":
            # Consume retake allowance and allow a fresh attempt.
            submission.delete()
            submission = None
        elif submission.submission_status in LIVE_MONITOR_STATUSES:
            # Check device lock
            if device_token and submission.device_session_token:
                if submission.device_session_token != device_token:
                    # Check if the other session is active (heartbeat within last 35 seconds)
                    if submission.last_active_at and (now - submission.last_active_at).total_seconds() < 35:
                        return JsonResponse({
                            "error": "This exam is currently active on another device or window. Please close the other session first.",
                            "code": "MULTIPLE_DEVICE"
                        }, status=403)
                    else:
                        # Takeover allowed
                        submission.device_session_token = device_token
                        submission.save(update_fields=["device_session_token"])
            elif device_token:
                # No token saved yet, lock it to this device
                submission.device_session_token = device_token
                submission.save(update_fields=["device_session_token"])

            # Existing live-monitor row for this in-progress attempt; load temporary answers.
            if submission:
                breakdown = submission.question_wise_breakdown
                if isinstance(breakdown, list):
                    for item in breakdown:
                        q_id = item.get("question_id")
                        student_ans = item.get("answer") or item.get("student_answer")
                        if q_id is not None:
                            saved_answers[str(q_id)] = student_ans
        else:
            return JsonResponse({"error": "Exam already attempted."}, status=403)

    all_exam_questions = list(ExamQuestion.objects.filter(exam=exam))
    all_exam_questions_map = {q.id: q for q in all_exam_questions}

    assigned_questions = []
    if submission and submission.selected_question_ids and isinstance(submission.selected_question_ids, list) and len(submission.selected_question_ids) > 0:
        for qid in submission.selected_question_ids:
            if qid in all_exam_questions_map:
                assigned_questions.append(all_exam_questions_map[qid])

    if not assigned_questions:
        target_count = getattr(scheduled_exam, "random_question_count", None) or getattr(exam, "questions_to_display", 0)
        if target_count and 0 < target_count < len(all_exam_questions):
            assigned_questions = random.sample(all_exam_questions, target_count)
        else:
            assigned_questions = list(all_exam_questions)

        selected_ids = [q.id for q in assigned_questions]
        if submission:
            submission.selected_question_ids = selected_ids
            submission.save(update_fields=["selected_question_ids"])
        else:
            submission = ExamResult.objects.create(
                student=student,
                exam=exam,
                scheduled_exam=scheduled_exam,
                exam_title=exam.title,
                total_marks=sum(float(q.marks or 0) for q in assigned_questions),
                marks_obtained=0,
                attempted_questions=0,
                correct_answers=0,
                wrong_answers=0,
                question_wise_breakdown=[],
                submission_status="active",
                live_status="active",
                current_question=1,
                tab_switch_count=0,
                selected_question_ids=selected_ids,
                device_session_token=device_token,
                last_active_at=now,
            )

    questions = assigned_questions
    question_data = []

    for q in questions:
        item = {
            "id": q.id,
            "text": q.question_text,
            "type": q.type,
            "section_tag": getattr(q, "section_tag", None),
            "marks": q.marks,
            "negative": q.negative_mark,
            # FIX: use relative URL for image to avoid CSP / Mixed Content issues
            "image_url": q.image.url if q.image else None,
        }

        if q.type in ["MCQ", "TF"]:
            item["options"] = q.options or {}
        if q.type == "Code":
            item["input_example"] = q.input_example
        if q.type == "DESC":
            item["min_characters"] = q.min_characters

        question_data.append(item)

    return JsonResponse({
        "exam_id": str(exam.id),
        "exam_title": exam.title,
        "duration_minutes": exam.duration_minutes,
        "allowed_tab_switches": scheduled_exam.allowed_tab_switches,
        "questions": question_data,
        "saved_answers": saved_answers
    })


@login_required
@user_passes_test(is_student)
@require_http_methods(["POST"])

def submit_exam(request, scheduled_exam_id):
    student = get_object_or_404(StudentProfile, user=request.user, is_current=True)
    scheduled_exam = get_object_or_404(ScheduledExam, id=scheduled_exam_id)
    exam = scheduled_exam.exam
    now = timezone.now()

    if now < scheduled_exam.start_datetime:
        start_local = timezone.localtime(scheduled_exam.start_datetime) if scheduled_exam.start_datetime else None
        start_str = start_local.strftime("%d-%m-%Y %I:%M %p") if start_local else ""
        return JsonResponse({"error": f"Exam has not started yet. It will automatically activate on {start_str}."}, status=403)

    # Check if there is already a completed latest submission for this exam (excluding the current attempt)
    latest_exam_sub = (
        ExamResult.objects
        .filter(student=student, exam=exam)
        .order_by("-submitted_at")
        .first()
    )
    if latest_exam_sub and latest_exam_sub.submission_status in FINAL_SUBMISSION_STATUSES:
        current_attempt = (
            ExamResult.objects
            .filter(student=student, scheduled_exam=scheduled_exam)
            .order_by("-submitted_at")
            .first()
        )
        if not current_attempt or latest_exam_sub.id != current_attempt.id:
            return JsonResponse({"error": "You have already submitted this exam."}, status=403)

    data = json.loads(request.body)
    device_token = data.get("device_token")
    device_hints = data.get("device_hints")
    device_meta = parse_device_info(request, client_hints=device_hints)

    submission = (
        ExamResult.objects
        .filter(student=student, scheduled_exam=scheduled_exam)
        .order_by("-submitted_at")
        .first()
    )
    live_submission = None
    if submission:
        if submission.submission_status == "retake_allowed":
            # Consume retake allowance and accept the fresh retake submission.
            submission.delete()
            submission = None
        elif submission.submission_status in LIVE_MONITOR_STATUSES:
            # Reuse in-progress monitor row as final submission row.
            live_submission = submission
            # Check device lock
            if device_token and submission.device_session_token:
                if submission.device_session_token != device_token:
                    now_time = timezone.now()
                    if submission.last_active_at and (now_time - submission.last_active_at).total_seconds() < 35:
                        return JsonResponse({
                            "error": "This exam attempt has been accessed on another device. Submission is locked."
                        }, status=403)
        else:
            return JsonResponse({"error": "You have already submitted this exam."}, status=403)

    answers = data.get("answers", [])  # [{ "question_id": id, "answer": "..." }]

    answers_map = {}
    for entry in answers:
        q_id = str(entry.get("question_id") or "")
        answers_map[q_id] = entry.get("answer")

    total = 0
    obtained = 0
    attempted = 0
    correct = 0
    wrong = 0
    breakdown = []

    if submission and submission.selected_question_ids and isinstance(submission.selected_question_ids, list) and len(submission.selected_question_ids) > 0:
        assigned_id_map = {q.id: q for q in ExamQuestion.objects.filter(exam=exam, id__in=submission.selected_question_ids)}
        exam_questions = [assigned_id_map[qid] for qid in submission.selected_question_ids if qid in assigned_id_map]
    else:
        # Fallback: check if answers contain question IDs from a subset
        assigned_ids = [int(k) for k in answers_map.keys() if str(k).isdigit()]
        pool_questions = list(ExamQuestion.objects.filter(exam=exam))
        if assigned_ids and len(assigned_ids) < len(pool_questions):
            assigned_id_map = {q.id: q for q in pool_questions if q.id in assigned_ids}
            exam_questions = [assigned_id_map[qid] for qid in assigned_ids if qid in assigned_id_map]
        else:
            exam_questions = pool_questions

    for q in exam_questions:
        q_id_str = str(q.id)
        if q_id_str not in answers_map:
            total += q.marks
            breakdown.append({
                "question_id": q_id_str,
                "type": q.type,
                "student_answer": None,
                "correct_answer": q.correct_answer if q.type in ["MCQ", "TF"] else None,
                "correct": False,
                "marks_awarded": 0
            })
            continue

        student_ans = answers_map[q_id_str]
        marks_awarded = 0
        is_correct = False

        if q.type in ["MCQ", "TF"]:
            if student_ans == q.correct_answer:
                marks_awarded = q.marks
                is_correct = True
                correct += 1
            else:
                marks_awarded = -q.negative_mark
                wrong += 1
        elif q.type == "Code":
            # Code answers arrive as JSON string: {"code": "...", "language": "python"}
            # Fallback to raw text if older clients submit plain code.
            code_text = ""
            language = "python"
            if isinstance(student_ans, str):
                try:
                    parsed = json.loads(student_ans)
                    if isinstance(parsed, dict):
                        code_text = str(parsed.get("code", "") or "")
                        language = str(parsed.get("language", "python") or "python")
                    else:
                        code_text = student_ans
                except Exception:
                    code_text = student_ans
            else:
                code_text = str(student_ans or "")

            if not code_text.strip():
                marks_awarded = 0
                wrong += 1
                breakdown.append({
                    "question_id": str(q.id),
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": False,
                    "marks_awarded": marks_awarded,
                    "test_results": []
                })
                obtained += marks_awarded
                total += q.marks
                attempted += 1
                continue

            # Use test case evaluation if test cases exist
            if q.test_cases and isinstance(q.test_cases, list) and len(q.test_cases) > 0:
                # Auto-evaluate using test cases
                judge = evaluate_code_with_test_cases(
                    code_text,
                    language,
                    q.test_cases,
                    max_score=float(q.marks)
                )
                passed_cases = int(judge.get("passed", 0))
                total_cases = int(judge.get("total", 0))
                score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                marks_awarded = round(float(q.marks) * score_ratio, 2)
                is_correct = judge.get("verdict") == "Accepted"
                test_results = judge.get("details", [])

                if is_correct:
                    correct += 1
                else:
                    wrong += 1
                
                # Store test results in breakdown
                breakdown.append({
                    "question_id": str(q.id),
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": is_correct,
                    "marks_awarded": marks_awarded,
                    "test_results": test_results  # Store detailed test case results
                })
                obtained += marks_awarded
                total += q.marks
                attempted += 1
                continue  # Skip the default breakdown append
            else:
                # Strict behavior: without test cases, do not auto-mark coding answers as correct.
                # Use expected_output only when explicitly provided as a single test.
                if q.expected_output:
                    judge = evaluate_code_with_test_cases(
                        code_text,
                        language,
                        [{"input": q.input_example or "", "output": q.expected_output}],
                        max_score=float(q.marks)
                    )
                    passed_cases = int(judge.get("passed", 0))
                    total_cases = int(judge.get("total", 0))
                    score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                    marks_awarded = round(float(q.marks) * score_ratio, 2)
                    is_correct = judge.get("verdict") == "Accepted"

                    if is_correct:
                        correct += 1
                    else:
                        wrong += 1
                else:
                    marks_awarded = 0
                    wrong += 1
        elif q.type == "DESC":
            if q.min_characters and len(student_ans.strip()) >= q.min_characters:
                marks_awarded = q.marks  # Manual review assumed
            else:
                marks_awarded = 0
            # no correct/wrong increment

        obtained += marks_awarded
        total += q.marks
        attempted += 1

        breakdown.append({
            "question_id": str(q.id),
            "type": q.type,
            "student_answer": student_ans,
            "correct_answer": q.correct_answer if q.type in ["MCQ", "TF"] else None,
            "correct": is_correct,
            "marks_awarded": marks_awarded
        })

    total_seconds = 0
    post_qmap = data.get("question_time_map") or data.get("time_spent") or {}
    if isinstance(post_qmap, dict) and post_qmap:
        for k, v in post_qmap.items():
            try:
                total_seconds += int(v or 0)
            except (ValueError, TypeError):
                pass

    if total_seconds <= 0 and live_submission and isinstance(getattr(live_submission, "question_time_map", None), dict):
        for k, v in live_submission.question_time_map.items():
            try:
                total_seconds += int(v or 0)
            except (ValueError, TypeError):
                pass

    tab_limit = int(getattr(scheduled_exam, "allowed_tab_switches", 3) or 3)
    tab_switch_count = 0
    if live_submission:
        tab_switch_count = getattr(live_submission, "tab_switch_count", 0) or 0

    if tab_switch_count >= tab_limit:
        status_to_save = "accidental_submit"
    else:
        status_to_save = "submitted"

    if live_submission:
        result = live_submission
        result.exam = exam
        result.exam_title = exam.title
        selected_ids_to_save = [q.id for q in exam_questions]
        result.total_marks = total
        result.marks_obtained = obtained
        result.attempted_questions = attempted
        result.correct_answers = correct
        result.wrong_answers = wrong
        result.question_wise_breakdown = breakdown
        result.selected_question_ids = selected_ids_to_save
        result.submission_status = status_to_save
        result.live_status = status_to_save
        if total_seconds > 0:
            result.time_taken = timezone.timedelta(seconds=total_seconds)
        if device_meta.get('device_info'):
            result.device_info = device_meta['device_info']
            result.device_type = device_meta['device_type']
            result.os_name = device_meta['os_name']
            result.browser_name = device_meta['browser_name']
            result.ip_address = device_meta['ip_address']
            result.user_agent = device_meta['user_agent']
        result.save()
    else:
        selected_ids_to_save = [q.id for q in exam_questions]
        result = ExamResult.objects.create(
            student=student,
            exam=exam,
            scheduled_exam=scheduled_exam,
            exam_title=exam.title,
            total_marks=total,
            marks_obtained=obtained,
            attempted_questions=attempted,
            correct_answers=correct,
            wrong_answers=wrong,
            question_wise_breakdown=breakdown,
            selected_question_ids=selected_ids_to_save,
            submission_status=status_to_save,
            live_status=status_to_save,
            time_taken=timezone.timedelta(seconds=total_seconds) if total_seconds > 0 else None,
            device_type=device_meta.get('device_type', 'Laptop / Desktop'),
            os_name=device_meta.get('os_name', 'Unknown OS'),
            browser_name=device_meta.get('browser_name', 'Unknown Browser'),
            ip_address=device_meta.get('ip_address', ''),
            user_agent=device_meta.get('user_agent', ''),
            device_info=device_meta.get('device_info', ''),
        )

    # Don't change scheduled_exam.status here - each student should be able to attempt independently
    # The exam availability is controlled by checking ExamResult per student
    
    return JsonResponse({
        "message": "Exam submitted",
        "result_id": str(result.id),
        "total_marks": total,
        "marks_obtained": obtained,
        "correct": correct,
        "wrong": wrong
    })

@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def performance_page(request):
    return render(request, 'student_performance.html')


@login_required
@user_passes_test(is_student)
@require_POST
def student_live_update(request):
    """
    Receive heartbeat updates from the active student exam page.
    Stores current question index, tab switch count, status, and last activity time.
    """
    try:
        data = json.loads(request.body or "{}")
        schedule_id = data.get("schedule_id")

        if not schedule_id:
            return JsonResponse({"status": "error", "message": "Missing schedule_id"}, status=400)

        student = get_object_or_404(StudentProfile, user=request.user, is_current=True)
        schedule = get_object_or_404(ScheduledExam, id=schedule_id)

        if (
            schedule.college_id != student.college_id
            or schedule.course_id != student.course_id
            or schedule.year != student.year
            or schedule.semester != student.semester
        ):
            return JsonResponse({"status": "error", "message": "Invalid schedule for student"}, status=403)

        if schedule.section:
            selected_sections = [s.strip() for s in schedule.section.split(",") if s.strip()]
            student_section = getattr(student.section, "name", "")
            if selected_sections and student_section not in selected_sections:
                return JsonResponse({"status": "error", "message": "Student not in scheduled section"}, status=403)

        current_question = data.get("current_question", 1)
        tab_switch_count = data.get("tab_switch_count", 0)
        question_time_map = _normalize_question_time_map(data.get("question_time_map") or {})
        requested_status = str(data.get("status", "active") or "active").lower().strip()

        try:
            current_question = max(1, int(current_question))
        except (TypeError, ValueError):
            current_question = 1

        try:
            tab_switch_count = max(0, int(tab_switch_count))
        except (TypeError, ValueError):
            tab_switch_count = 0

        status = requested_status if requested_status in LIVE_MONITOR_STATUSES else "active"
        if tab_switch_count > 2 and status in {"active", "in_progress", "not_started"}:
            status = "suspicious"

        temp_answers = data.get("temp_answers", [])
        device_token = data.get("device_token")
        device_hints = data.get("device_hints")
        device_meta = parse_device_info(request, client_hints=device_hints)

        result = (
            ExamResult.objects
            .filter(student=student, scheduled_exam=schedule)
            .order_by("-submitted_at")
            .first()
        )

        if result and result.submission_status in FINAL_SUBMISSION_STATUSES:
            # Ignore late heartbeat after final submit.
            return JsonResponse({"status": "success"})

        if result is None:
            all_exam_questions = list(ExamQuestion.objects.filter(exam=schedule.exam))
            target_count = getattr(schedule, "random_question_count", None) or getattr(schedule.exam, "questions_to_display", 0)
            if target_count and 0 < target_count < len(all_exam_questions):
                selected_q_list = random.sample(all_exam_questions, target_count)
            else:
                selected_q_list = all_exam_questions
            selected_ids = [q.id for q in selected_q_list]

            result = ExamResult.objects.create(
                student=student,
                exam=schedule.exam,
                scheduled_exam=schedule,
                exam_title=schedule.exam.title,
                total_marks=sum(float(q.marks or 0) for q in selected_q_list),
                marks_obtained=0,
                attempted_questions=0,
                correct_answers=0,
                wrong_answers=0,
                question_wise_breakdown=temp_answers,
                submission_status=status,
                live_status=status,
                current_question=current_question,
                question_time_map=question_time_map,
                tab_switch_count=tab_switch_count,
                selected_question_ids=selected_ids,
                last_active_at=timezone.now(),
                device_session_token=device_token,
                device_type=device_meta.get('device_type', 'Laptop / Desktop'),
                os_name=device_meta.get('os_name', 'Unknown OS'),
                browser_name=device_meta.get('browser_name', 'Unknown Browser'),
                ip_address=device_meta.get('ip_address', ''),
                user_agent=device_meta.get('user_agent', ''),
                device_info=device_meta.get('device_info', ''),
            )
        else:
            # Check device lock
            if device_token and result.device_session_token:
                if result.device_session_token != device_token:
                    now_time = timezone.now()
                    # Check if the other session is actively sending updates
                    if result.last_active_at and (now_time - result.last_active_at).total_seconds() < 35:
                        return JsonResponse({
                            "status": "error",
                            "message": "multiple_devices",
                            "error": "This exam is currently active on another device or window."
                        }, status=403)
                    else:
                        # Allow takeover if other device has gone silent
                        result.device_session_token = device_token
            elif device_token:
                result.device_session_token = device_token

            result.current_question = current_question
            if question_time_map:
                result.question_time_map = question_time_map
            result.tab_switch_count = tab_switch_count
            result.submission_status = status
            result.live_status = status
            result.last_active_at = timezone.now()
            result.question_wise_breakdown = temp_answers
            if device_meta.get('device_info'):
                result.device_info = device_meta['device_info']
                result.device_type = device_meta['device_type']
                result.os_name = device_meta['os_name']
                result.browser_name = device_meta['browser_name']
                result.ip_address = device_meta['ip_address']
                result.user_agent = device_meta['user_agent']
            result.save()

        now = timezone.now()
        if schedule.end_datetime and now > schedule.end_datetime:
            if result and result.submission_status not in FINAL_SUBMISSION_STATUSES:
                evaluate_and_finalize_scheduled_exam_result(result, answers_override=temp_answers, submission_mode_val="submitted")
            return JsonResponse({"status": "success", "exam_ended": True, "message": "Exam window has closed and answers have been auto-submitted."})

        return JsonResponse({"status": "success"})

    except Exception as exc:
        logger.exception("Student live update failed")
        return JsonResponse({"status": "error", "message": str(exc)}, status=500)

    

@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def get_student_exam_results(request):
    try:
        student = StudentProfile.objects.get(user=request.user, is_current=True)
        results = ExamResult.objects.filter(student=student)

        if not results.exists():
            return JsonResponse({"message": "Student performance API is working. No results yet."})

        data = []
        for r in results:
            data.append({
                "exam_title": r.exam_title,
                "score": r.marks_obtained,
                "total": r.total_marks,
                "submitted_at": r.submitted_at.strftime("%d-%m-%Y %I:%M %p") if r.submitted_at else "N/A"
            })
        return JsonResponse(data, safe=False)
    except StudentProfile.DoesNotExist:
        return JsonResponse({"error": "Student profile not found."}, status=404)



@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def api_student_performance(request):
    def format_time_spent(question_time_map):
        if not isinstance(question_time_map, dict) or not question_time_map:
            return "-"

        def key_sort(item):
            key = str(item[0])
            return (0, int(key)) if key.isdigit() else (1, key)

        pairs = sorted(question_time_map.items(), key=key_sort)
        return " | ".join([f"Q{k}: {int(v)}s" for k, v in pairs])

    def submission_mode_label(status_value):
        status_key = str(status_value or "").lower()
        if status_key == "accidental_submit":
            return "Auto Submitted (Tab Switch)"
        if status_key in {"submitted", "retaken"}:
            return "Self Submitted"
        if status_key == "retake_allowed":
            return "Retake Allowed"
        if status_key in {"active", "in_progress"}:
            return "In Progress"
        return status_key.replace("_", " ").title() if status_key else "Unknown"

    def topic_analysis_string(result_obj):
        if not result_obj:
            return "-"

        breakdown = getattr(result_obj, "question_wise_breakdown", None)
        if not isinstance(breakdown, list):
            return "-"

        question_rows = ExamQuestion.objects.filter(exam=result_obj.exam).values("id", "section_tag", "marks")
        question_meta = {
            str(q["id"]): {
                "section_tag": (q.get("section_tag") or "General").strip() or "General",
                "marks": float(q.get("marks") or 0),
            }
            for q in question_rows
        }

        by_topic = {}
        for item in breakdown:
            if not isinstance(item, dict):
                continue

            question_id = str(item.get("question_id") or "")
            meta = question_meta.get(question_id, {"section_tag": "General", "marks": 0.0})
            topic = meta["section_tag"]

            if topic not in by_topic:
                by_topic[topic] = {
                    "attempted": 0,
                    "correct": 0,
                    "marks_obtained": 0.0,
                    "total_marks": 0.0,
                    "total_questions": 0,
                }

            bucket = by_topic[topic]
            bucket["total_questions"] += 1
            bucket["total_marks"] += float(meta.get("marks") or 0)

            student_answer = item.get("student_answer")
            if student_answer not in (None, ""):
                bucket["attempted"] += 1
            if bool(item.get("correct")):
                bucket["correct"] += 1
            bucket["marks_obtained"] += float(item.get("marks_awarded") or 0)

        if not by_topic:
            return "-"

        parts = []
        for topic in sorted(by_topic.keys()):
            d = by_topic[topic]
            unattempted = max(d["total_questions"] - d["attempted"], 0)
            parts.append(
                f"{topic}: A {d['attempted']}, U {unattempted}, C {d['correct']}, M {d['marks_obtained']:.1f}/{d['total_marks']:.1f}"
            )
        return " ; ".join(parts)

    try:
        student = StudentProfile.objects.get(user=request.user, is_current=True)
    except StudentProfile.DoesNotExist:
        return JsonResponse({
            "labels": [],
            "scores": [],
            "marks": [],
            "totals": [],
            "statuses": [],
            "attempted_questions": [],
            "correct_answers": [],
            "wrong_answers": [],
            "unattempted_questions": [],
            "tab_switch_count": [],
            "time_spent_each_question": [],
            "submission_mode": [],
            "section_analysis": [],
            "submitted_at": [],
            "error": "No active student profile found."
        })

    # Get only the latest result per exam_title
    latest_results = (
        ExamResult.objects
        .filter(student=student, submission_status__in=["submitted", "accidental_submit", "retaken"])
        .order_by('exam_title', '-submitted_at')
        .distinct('exam_title')  # Keep latest attempt per title
    )

    labels = []
    scores = []
    marks = []
    totals = []
    statuses = []
    attempted = []
    correct = []
    wrong = []
    unattempted = []
    tab_switch = []
    time_spent = []
    submission_mode = []
    section_analysis = []
    submitted_at = []

    total_seconds = 0
    total_questions_answered = 0

    for r in latest_results:
        labels.append(r.exam_title)
        score_percent = round((r.marks_obtained / r.total_marks) * 100, 2) if r.total_marks else 0
        scores.append(score_percent)
        marks.append(r.marks_obtained if r.marks_obtained is not None else 0)
        totals.append(r.total_marks if r.total_marks is not None else 0)
        statuses.append(str(getattr(r, "submission_status", "") or "").replace("_", " ").title())
        attempted.append(r.attempted_questions)
        correct.append(r.correct_answers)
        wrong.append(r.wrong_answers)

        total_questions = (
            len(r.selected_question_ids)
            if (r.selected_question_ids and isinstance(r.selected_question_ids, list))
            else (
                len(r.question_wise_breakdown)
                if (r.question_wise_breakdown and isinstance(r.question_wise_breakdown, list))
                else (ExamQuestion.objects.filter(exam=r.exam).count() if r.exam else 0)
            )
        )
        unattempted.append(max(total_questions - (r.attempted_questions or 0), 0))
        tab_switch.append(getattr(r, "tab_switch_count", 0) or 0)

        q_map = getattr(r, "question_time_map", None) or {}
        time_spent.append(format_time_spent(q_map))
        if isinstance(q_map, dict):
            for q_id, sec in q_map.items():
                total_seconds += int(sec or 0)
                total_questions_answered += 1

        submission_mode.append(submission_mode_label(getattr(r, "submission_status", "")))
        section_analysis.append(topic_analysis_string(r))
        submitted_at.append(r.submitted_at.strftime("%d-%m-%Y %I:%M %p") if r.submitted_at else "N/A")

    # Time Calculations
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    total_time_spent_str = f"{hours:02d}:{minutes:02d}:{secs:02d}"

    if total_questions_answered > 0:
        avg_sec = total_seconds / total_questions_answered
    else:
        avg_sec = 0.0
    avg_hours = int(avg_sec // 3600)
    avg_minutes = int((avg_sec % 3600) // 60)
    avg_secs = int(avg_sec % 60)
    avg_time_per_question_str = f"{avg_hours:02d}:{avg_minutes:02d}:{avg_secs:02d}"

    # Score Metrics
    highest_score = max(scores) if scores else 0.0
    lowest_score = min(scores) if scores else 0.0
    highest_score_str = f"{int(round(highest_score))}%"
    lowest_score_str = f"{int(round(lowest_score))}%"

    # Best Subject
    best_subject = "-"
    if latest_results and scores:
        max_score = max(scores)
        for r in latest_results:
            score_percent = round((r.marks_obtained / r.total_marks) * 100, 2) if r.total_marks else 0
            if score_percent == max_score and r.total_marks > 0:
                best_subject = r.exam_title
                break
        if best_subject == "-":
            best_subject = labels[0] if labels else "-"

    # Most Attempted Subject (aggregate counts of all attempts)
    from django.db.models import Count
    most_attempted_row = (
        ExamResult.objects
        .filter(student=student)
        .values('exam_title')
        .annotate(cnt=Count('id'))
        .order_by('-cnt', 'exam_title')
        .first()
    )
    most_attempted_subject = most_attempted_row['exam_title'] if most_attempted_row else "-"

    return JsonResponse({
        "labels": labels,
        "scores": scores,
        "marks": marks,
        "totals": totals,
        "statuses": statuses,
        "attempted_questions": attempted,
        "correct_answers": correct,
        "wrong_answers": wrong,
        "unattempted_questions": unattempted,
        "tab_switch_count": tab_switch,
        "time_spent_each_question": time_spent,
        "submission_mode": submission_mode,
        "section_analysis": section_analysis,
        "submitted_at": submitted_at,
        "summary": {
            "total_time_spent": total_time_spent_str,
            "avg_time_per_question": avg_time_per_question_str,
            "highest_score": highest_score_str,
            "lowest_score": lowest_score_str,
            "best_subject": best_subject,
            "most_attempted_subject": most_attempted_subject,
        }
    })


def _format_exam_time_taken(result):
    """
    Format time_taken into a readable string (e.g. '0m 55s', '1h 10m 5s').
    Falls back to question_time_map sum or submitted_at/last_active_at delta if result.time_taken is None.
    """
    total_seconds = 0
    if result.time_taken:
        total_seconds = int(result.time_taken.total_seconds())

    # Fallback 1: Sum per-question time spent from question_time_map
    if total_seconds <= 0 and hasattr(result, "question_time_map") and isinstance(result.question_time_map, dict) and result.question_time_map:
        for k, v in result.question_time_map.items():
            try:
                total_seconds += int(v or 0)
            except (ValueError, TypeError):
                pass

    # Fallback 2: Calculate from last_active_at / submitted_at delta
    if total_seconds <= 0 and result.submitted_at and getattr(result, "last_active_at", None):
        diff = result.submitted_at - result.last_active_at
        total_seconds = max(0, int(diff.total_seconds()))

    if total_seconds <= 0:
        return "N/A"

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}h {minutes}m {seconds}s"
    elif minutes > 0:
        return f"{minutes}m {seconds}s"
    else:
        return f"{seconds}s"


@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def get_exam_result_detail(request, result_id):
    """
    Get detailed exam result for result sheet display.
    Students can only view results once the admin releases them.
    """
    try:
        # OK Ensure the logged-in user has an active student profile
        student = StudentProfile.objects.get(user=request.user, is_current=True)
        result = get_object_or_404(ExamResult, id=result_id, student=student)
        student_display_name = student.user.get_full_name() or student.user.first_name or student.user.username

        # OK Prevent students from viewing results before admin release
        if result.scheduled_exam and not result.scheduled_exam.result_released:
            return JsonResponse({
                "status": "pending",
                "result_released": False,
                "message": "Your exam has been submitted successfully. Results will be released soon.",
                "student_name": student_display_name,
                "usn": student.usn,
                "exam_title": result.exam_title,
                "submitted_at": (
                    timezone.localtime(result.submitted_at).strftime("%d-%m-%Y %I:%M %p")
                    if result.submitted_at else "N/A"
                ),
                "duration_minutes": getattr(result.exam, "duration_minutes", "N/A"),
                "time_taken": _format_exam_time_taken(result),
            }, status=200)

        exam = result.exam
        questions_data = []
        total_questions = 0

        if exam:
            # OK Get all questions for this exam
            exam_questions = list(ExamQuestion.objects.filter(exam=exam))
            total_questions = len(exam_questions)

            # OK Create quick lookup table for questions
            question_map = {str(q.id): q for q in exam_questions}
            breakdown_map = {}
            for item in (result.question_wise_breakdown or []):
                if isinstance(item, dict):
                    qid = str(item.get('question_id') or '')
                    if qid:
                        breakdown_map[qid] = item

            seen_ids = set()
            for q in exam_questions:
                qid = str(q.id)
                seen_ids.add(qid)
                item = breakdown_map.get(qid)
                if item:
                    questions_data.append({
                        'question_id': qid,
                        'question_text': q.question_text,
                        'type': item.get('type', q.type or 'N/A'),
                        'student_answer': item.get('student_answer', ''),
                        'correct_answer': item.get('correct_answer', q.correct_answer if q.type in ['MCQ', 'TF'] else ''),
                        'correct': item.get('correct', False),
                        'marks_awarded': item.get('marks_awarded', 0),
                    })
                else:
                    questions_data.append({
                        'question_id': qid,
                        'question_text': q.question_text,
                        'type': q.type or 'N/A',
                        'student_answer': '— (Recorded in final score)' if (result.attempted_questions or 0) > 0 else '— (Unanswered)',
                        'correct_answer': q.correct_answer if q.type in ['MCQ', 'TF'] else '',
                        'correct': False,
                        'marks_awarded': 0,
                    })

            for item in (result.question_wise_breakdown or []):
                if isinstance(item, dict):
                    qid = str(item.get('question_id') or '')
                    if qid and qid not in seen_ids:
                        question_obj = question_map.get(qid)
                        questions_data.append({
                            'question_id': qid,
                            'question_text': (
                                question_obj.question_text
                                if question_obj else 'Question text not available'
                            ),
                            'type': item.get('type', 'N/A'),
                            'student_answer': item.get('student_answer', ''),
                            'correct_answer': item.get('correct_answer', ''),
                            'correct': item.get('correct', False),
                            'marks_awarded': item.get('marks_awarded', 0),
                        })

        # OK Prepare response payload
        response_data = {
            "student_name": student_display_name,
            "usn": student.usn,
            "exam_title": result.exam_title,
            "submitted_at": (
                timezone.localtime(result.submitted_at).strftime("%d-%m-%Y %I:%M %p")
                if result.submitted_at else "N/A"
            ),
            "duration_minutes": getattr(exam, "duration_minutes", "N/A"),
            "time_taken": _format_exam_time_taken(result),
            "total_marks": float(result.total_marks or 0),
            "marks_obtained": float(result.marks_obtained or 0),
            "passing_marks": float(getattr(exam, "passing_marks", 0)),
            "attempted_questions": result.attempted_questions or 0,
            "correct_answers": result.correct_answers or 0,
            "wrong_answers": result.wrong_answers or 0,
            "total_questions": total_questions,
            "question_wise_breakdown": questions_data,
            "device_info": result.device_info or "-",
            "device_type": result.device_type or "-",
            "os_name": result.os_name or "-",
            "browser_name": result.browser_name or "-",
            "ip_address": result.ip_address or "-",
        }

        return JsonResponse(response_data, safe=False)

    except StudentProfile.DoesNotExist:
        return JsonResponse({"error": "Student profile not found."}, status=404)

    except ExamResult.DoesNotExist:
        return JsonResponse({"error": "Result not found."}, status=404)

    except Exception as e:
        logger.exception(f"Error fetching result detail: {e}")
        return JsonResponse({"error": "Failed to fetch result details."}, status=500)

@login_required
@user_passes_test(is_student)
@require_http_methods(["GET"])
def view_exam_result(request):
    """Render the exam result page"""
    return render(request, 'exam_result.html')


def evaluate_code_with_test_cases(code, language, test_cases, max_score=None):
    """
    HackerRank-style judge:
    - Executes code separately for EACH test case
    - Supports {sample_test_cases:[], hidden_test_cases:[]} or plain list of test cases
    - Hidden test cases affect verdict but are not included in response details
    """
    def normalize_output(value):
        text = "" if value is None else str(value)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        return "\n".join(line.rstrip() for line in text.strip().split("\n")).strip()

    def normalize_case(tc):
        if not isinstance(tc, dict):
            return None
        return {
            "input": str(tc.get("input", tc.get("stdin", "")) or ""),
            "output": str(tc.get("output", tc.get("expected_output", "")) or "")
        }

    if not test_cases:
        return {
            "verdict": "Wrong Answer",
            "passed": 0,
            "total": 0,
            "details": []
        }

    sample_cases = []
    hidden_cases = []

    if isinstance(test_cases, dict):
        sample_cases = [normalize_case(tc) for tc in (test_cases.get("sample_test_cases") or [])]
        hidden_cases = [normalize_case(tc) for tc in (test_cases.get("hidden_test_cases") or [])]
    elif isinstance(test_cases, list):
        sample_cases = [normalize_case(tc) for tc in test_cases]

    sample_cases = [tc for tc in sample_cases if tc is not None]
    hidden_cases = [tc for tc in hidden_cases if tc is not None]
    all_cases = sample_cases + hidden_cases

    if not all_cases:
        return {
            "verdict": "Wrong Answer",
            "passed": 0,
            "total": 0,
            "details": []
        }

    passed_count = 0
    has_runtime_error = False
    has_compilation_error = False
    has_tle = False
    sample_details = []
    compilation_error_msg = ""

    for idx, tc in enumerate(all_cases):
        expected = normalize_output(tc["output"])
        
        if has_compilation_error:
            status = "Compilation Error"
            got = compilation_error_msg
        else:
            exec_result = run_code_with_input(code, language, tc["input"], timeout_seconds=3)

            if exec_result["status"] == "time_limit_exceeded":
                status = "Time Limit Exceeded"
                has_tle = True
                got = ""
            elif exec_result["status"] == "compilation_error":
                status = "Compilation Error"
                has_compilation_error = True
                compilation_error_msg = normalize_output(exec_result.get("error") or "")
                got = compilation_error_msg
            elif exec_result["status"] == "runtime_error":
                status = "Runtime Error"
                has_runtime_error = True
                got = normalize_output(exec_result.get("output") or exec_result.get("error") or "")
            else:
                got = normalize_output(exec_result.get("output", ""))
                if got == expected:
                    status = "Pass"
                    passed_count += 1
                else:
                    status = "Fail"

        if idx < len(sample_cases):
            sample_details.append({
                "test_case": idx + 1,
                "status": status,
                "expected": expected,
                "got": got,
                "passed": (status == "Pass")
            })

    total_cases = len(all_cases)
    if has_compilation_error:
        verdict = "Compilation Error"
    elif has_tle:
        verdict = "Time Limit Exceeded"
    elif has_runtime_error:
        verdict = "Runtime Error"
    elif passed_count == total_cases:
        verdict = "Accepted"
    else:
        verdict = "Wrong Answer"

    return {
        "verdict": verdict,
        "passed": passed_count,
        "total": total_cases,
        "details": sample_details
    }


@csrf_exempt
@require_http_methods(["POST"])
def compile_code_exam(request):
    if not request.user.is_authenticated and not request.session.get('pre_assessment_candidate'):
        return HttpResponse("Unauthorized", status=401)
    """
    Advanced Code Compiler for Exam Coding Questions
    Supports: Python, Java, C, C++, C#, JavaScript, PHP
    Includes: Input handling, portable compiler detection, intelligent language detection
    """
    import subprocess
    import json
    import tempfile
    import os
    import re
    import sys
    from pathlib import Path
    
    # Try to import portable compiler detector from Compiler app
    try:
        compiler_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Compiler', 'compiler')
        if compiler_path not in sys.path:
            sys.path.insert(0, compiler_path)
        from portable_compiler_detector import portable_detector, get_compiler_path, is_compiler_available
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Failed to import portable_compiler_detector locally:")
        # Fallback functions if portable detector is not available
        def get_compiler_path(compiler_name):
            return compiler_name
        
        def is_compiler_available(compiler_name):
            try:
                result = subprocess.run([compiler_name, '--version'], 
                                      capture_output=True, text=True, timeout=5)
                return result.returncode == 0
            except:
                return False
        
        class MockDetector:
            def get_available_compilers(self):
                return {}
        
        portable_detector = MockDetector()
    
    def detect_language_from_code(code):
        """Intelligent language detection from code content"""
        code_lower = code.lower().strip()
        
        # C detection (check BEFORE Python - C is more specific)
        if ('#include <stdio.h>' in code or '#include <stdlib.h>' in code or 
            '#include <string.h>' in code or 'struct ' in code or
            ('printf(' in code and '#include' in code) or
            ('scanf(' in code and '#include' in code)):
            return 'c'
        
        # C++ detection
        if '#include <iostream>' in code or ('cout <<' in code and 'using namespace std' in code):
            return 'cpp'
        
        # Java detection
        if 'public class' in code and 'public static void main' in code and 'system.out.println' in code_lower:
            return 'java'
        
        # Python detection
        if 'print(' in code or 'def ' in code or 'import ' in code or ('for ' in code and ':' in code):
            return 'python'
        
        # C# detection
        if 'using system' in code_lower and ('console.writeline' in code_lower or 'console.write' in code_lower):
            return 'csharp'
        
        # JavaScript detection
        if 'console.log(' in code or ('let ' in code and 'const ' in code):
            return 'javascript'
        
        # PHP detection
        if code.startswith('<?php') or ('$' in code and 'echo ' in code):
            return 'php'
        
        return 'python'  # Default
    
    try:
        data = json.loads(request.body)
        code = data.get('code', '')
        language = data.get('language', 'python').lower()
        user_input = data.get('input', '')
        question_id = data.get('question_id')
        
        from django.http import JsonResponse as DjangoJsonResponse
        def JsonResponse(dict_data, *args, **kwargs):
            if isinstance(dict_data, dict):
                dict_data['language'] = language
            return DjangoJsonResponse(dict_data, *args, **kwargs)
        
        if not code.strip():
            return JsonResponse({
                'success': False,
                'error': 'No code provided'
            })
        
        # Auto-detect language if needed
        # detected_language = detect_language_from_code(code)
        # if detected_language != language:
        #     language = detected_language

        # Judge mode for exam code questions (HackerRank-style): evaluate against stored test cases
        if question_id:
            try:
                question = None
                is_uuid = False
                try:
                    import uuid
                    uuid.UUID(str(question_id))
                    is_uuid = True
                except ValueError:
                    pass
                
                if is_uuid:
                    try:
                        from company_prep.models import CompanyTechnicalQuestion
                        question = CompanyTechnicalQuestion.objects.filter(id=question_id).first()
                    except Exception:
                        pass
                else:
                    try:
                        question = ExamQuestion.objects.filter(id=question_id, type='Code').first()
                    except Exception:
                        pass
                    if not question:
                        try:
                            from practicetest.models import PracticeQuestion
                            question = PracticeQuestion.objects.filter(id=question_id, type='CODE').first()
                        except Exception:
                            pass
                
                # If no judge data is configured, fall back to normal code execution path.
                if question and not (getattr(question, 'test_cases', None) or getattr(question, 'expected_output', None)):
                    question = None
                if question and (getattr(question, 'test_cases', None) or getattr(question, 'expected_output', None)):
                    judge_payload = question.test_cases
                    if not judge_payload and getattr(question, 'expected_output', None):
                        judge_payload = {
                            "sample_test_cases": [
                                {
                                    "input": getattr(question, 'input_example', '') or "",
                                    "output": question.expected_output
                                }
                            ],
                            "hidden_test_cases": []
                        }

                    judge_result = evaluate_code_with_test_cases(code, language, judge_payload)
                    verdict = judge_result.get('verdict', 'Wrong Answer')
                    passed = int(judge_result.get('passed', 0))
                    total = int(judge_result.get('total', 0))
                    return JsonResponse({
                        'success': verdict == 'Accepted',
                        'verdict': verdict,
                        'passed': passed,
                        'total': total,
                        'details': judge_result.get('details', []),
                        'judge': judge_result,
                        'output': f"{passed}/{total} test cases passed",
                        'error': '' if verdict == 'Accepted' else f"Verdict: {verdict}"
                    })
            except Exception as judge_err:
                return JsonResponse({
                    'success': False,
                    'error': f'Judge execution error: {str(judge_err)}'
                })
        
        # Python Execution
        if language == 'python':
            try:
                python_cmd = get_compiler_path('python') if is_compiler_available('python') else 'python'
                # Always provide stdin, even if empty, to prevent input() from hanging
                stdin_data = user_input if user_input else ""
                result = subprocess.run(
                    [python_cmd, '-c', code], 
                    input=stdin_data,
                    capture_output=True, 
                    text=True, 
                    timeout=15,
                    encoding='utf-8',
                    errors='replace'
                )
                return JsonResponse({
                    'success': True,
                    'output': result.stdout if result.stdout else '(no output)',
                    'error': result.stderr if result.returncode != 0 else ''
                })
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'Python execution timed out (15 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Python execution error: {str(e)}'
                })
        
        # Java Execution
        elif language == 'java':
            if not is_compiler_available('javac'):
                return JsonResponse({
                    'success': False,
                    'error': 'Java compiler not available. Please ensure JDK is installed and in PATH.'
                })
            
            try:
                # Extract class name
                class_match = re.search(r'public\s+class\s+(\w+)', code)
                if not class_match:
                    return JsonResponse({
                        'success': False,
                        'error': 'Java code must contain a public class declaration'
                    })
                
                class_name = class_match.group(1)
                
                # Create temp file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.java', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(code)
                    java_file = f.name
                
                correct_java_file = os.path.join(os.path.dirname(java_file), f"{class_name}.java")
                if os.path.exists(correct_java_file):
                    os.unlink(correct_java_file)
                os.rename(java_file, correct_java_file)
                
                javac_cmd = get_compiler_path('javac')
                java_cmd = get_compiler_path('java')
                
                # Compile
                compile_result = subprocess.run([javac_cmd, correct_java_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    if os.path.exists(correct_java_file):
                        os.unlink(correct_java_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'Java compilation error:\n{compile_result.stderr}'
                    })
                
                # Run with input
                class_dir = os.path.dirname(correct_java_file)
                stdin_data = user_input if user_input else None
                run_result = subprocess.run([java_cmd, '-cp', class_dir, class_name], 
                                          input=stdin_data,
                                          capture_output=True, text=True, timeout=10,
                                          encoding='utf-8',
                                          errors='replace')
                
                # Cleanup
                if os.path.exists(correct_java_file):
                    os.unlink(correct_java_file)
                class_file = correct_java_file.replace('.java', '.class')
                if os.path.exists(class_file):
                    os.unlink(class_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout if run_result.stdout else '(no output)',
                    'error': run_result.stderr if run_result.returncode != 0 else ''
                })
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'Java execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Java execution error: {str(e)}'
                })
        
        # C Execution
        elif language == 'c':
            if not is_compiler_available('gcc'):
                return JsonResponse({
                    'success': False,
                    'error': 'C compiler (gcc) not available. Please ensure MinGW/GCC is installed.'
                })
            
            try:
                with tempfile.NamedTemporaryFile(mode='w', suffix='.c', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(code)
                    c_file = f.name
                
                gcc_cmd = get_compiler_path('gcc')
                exe_file = c_file.replace('.c', '.exe')
                
                # Compile
                compile_result = subprocess.run([gcc_cmd, c_file, '-o', exe_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    os.unlink(c_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'C compilation error:\n{compile_result.stderr}'
                    })
                
                # Run with input
                stdin_data = user_input if user_input else None
                run_result = subprocess.run([exe_file], 
                                          input=stdin_data,
                                          capture_output=True, text=True, timeout=10,
                                          encoding='utf-8',
                                          errors='replace')
                
                # Cleanup
                if os.path.exists(c_file):
                    os.unlink(c_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout if run_result.stdout else '(no output)',
                    'error': run_result.stderr if run_result.returncode != 0 else ''
                })
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'C execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'C execution error: {str(e)}'
                })
        
        # C++ Execution
        elif language in ['cpp', 'c++']:
            if not is_compiler_available('g++'):
                return JsonResponse({
                    'success': False,
                    'error': 'C++ compiler (g++) not available. Please ensure MinGW/G++ is installed.'
                })
            
            try:
                with tempfile.NamedTemporaryFile(mode='w', suffix='.cpp', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(code)
                    cpp_file = f.name
                
                gpp_cmd = get_compiler_path('g++')
                exe_file = cpp_file.replace('.cpp', '.exe')
                
                # Compile
                compile_result = subprocess.run([gpp_cmd, cpp_file, '-o', exe_file, '-static-libstdc++', '-static-libgcc'], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    os.unlink(cpp_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'C++ compilation error:\n{compile_result.stderr}'
                    })
                
                # Run with input
                stdin_data = user_input if user_input else None
                run_result = subprocess.run([exe_file], 
                                          input=stdin_data,
                                          capture_output=True, text=True, timeout=10,
                                          encoding='utf-8',
                                          errors='replace')
                
                # Cleanup
                if os.path.exists(cpp_file):
                    os.unlink(cpp_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout if run_result.stdout else '(no output)',
                    'error': run_result.stderr if run_result.returncode != 0 else ''
                })
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'C++ execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'C++ execution error: {str(e)}'
                })
                
        # C# Execution
        elif language in ['csharp', 'c#']:
            if not is_compiler_available('dotnet'):
                return JsonResponse({
                    'success': False,
                    'error': 'C#/.NET compiler not available. Please ensure .NET SDK is installed.'
                })
            
            project_dir = None  # Initialize to avoid unbound error
            try:
                project_dir = tempfile.mkdtemp()
                project_file = os.path.join(project_dir, 'Program.cs')
                
                with open(project_file, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(code)
                
                csproj_content = '''<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>'''
                
                csproj_file = os.path.join(project_dir, 'TempProject.csproj')
                with open(csproj_file, 'w') as f:
                    f.write(csproj_content)
                
                dotnet_cmd = get_compiler_path('dotnet')
                stdin_data = user_input if user_input else None
                build_result = subprocess.run([dotnet_cmd, 'run', '--project', project_dir], 
                                            input=stdin_data,
                                            capture_output=True, text=True, timeout=15,
                                            encoding='utf-8',
                                            errors='replace')
                
                # Cleanup
                import shutil
                shutil.rmtree(project_dir, ignore_errors=True)
                
                return JsonResponse({
                    'success': build_result.returncode == 0,
                    'output': build_result.stdout if build_result.stdout else '(no output)',
                    'error': build_result.stderr if build_result.returncode != 0 else ''
                })
                
            except subprocess.TimeoutExpired:
                if project_dir:
                    import shutil
                    shutil.rmtree(project_dir, ignore_errors=True)
                return JsonResponse({
                    'success': False,
                    'error': 'C# execution timed out (15 seconds limit)'
                })
            except Exception as e:
                if project_dir:
                    import shutil
                    shutil.rmtree(project_dir, ignore_errors=True)
                return JsonResponse({
                    'success': False,
                    'error': f'C# execution error: {str(e)}'
                })
        
        # JavaScript Execution
        elif language == 'javascript':
            try:
                node_cmd = get_compiler_path('node') if is_compiler_available('node') else 'node'
                stdin_data = user_input if user_input else None
                result = subprocess.run([node_cmd, '-e', code], 
                                      input=stdin_data,
                                      capture_output=True, text=True, timeout=10,
                                      encoding='utf-8',
                                      errors='replace')
                return JsonResponse({
                    'success': True,
                    'output': result.stdout if result.stdout else '(no output)',
                    'error': result.stderr if result.returncode != 0 else ''
                })
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'JavaScript execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'JavaScript execution error: {str(e)} (Node.js required)'
                })
        
        # PHP Execution
        elif language == 'php':
            try:
                php_cmd = get_compiler_path('php') if is_compiler_available('php') else 'php'
                php_code = code.strip()
                if php_code.startswith('<?php'):
                    php_code = php_code[5:].strip()
                if php_code.endswith('?>'):
                    php_code = php_code[:-2].strip()
                
                stdin_data = user_input if user_input else None
                result = subprocess.run([php_cmd, '-r', php_code], 
                                      input=stdin_data,
                                      capture_output=True, text=True, timeout=10,
                                      encoding='utf-8',
                                      errors='replace')
                return JsonResponse({
                    'success': True,
                    'output': result.stdout if result.stdout else '(no output)',
                    'error': result.stderr if result.returncode != 0 else ''
                })
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'PHP execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'PHP execution error: {str(e)} (PHP required)'
                })
        
        else:
            return JsonResponse({
                'success': False,
                'error': f'Language "{language}" is not supported. Supported: Python, Java, C, C++, C#, JavaScript, PHP'
            })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid JSON data'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Server error: {str(e)}'
        })


@csrf_exempt
@require_http_methods(["GET"])
def compiler_job_status(request, job_id):
    """
    Check the status and result of an asynchronous compiler Celery job.
    """
    if not request.user.is_authenticated and not request.session.get('pre_assessment_candidate'):
        return HttpResponse("Unauthorized", status=401)

    try:
        from celery.result import AsyncResult
        res = AsyncResult(job_id)
        state = res.state

        if state in ('PENDING', 'RECEIVED'):
            return JsonResponse({'status': 'queued', 'job_id': job_id})
        elif state == 'STARTED':
            return JsonResponse({'status': 'started', 'job_id': job_id})
        elif state == 'RETRY':
            return JsonResponse({'status': 'retry', 'job_id': job_id})
        elif state == 'SUCCESS':
            result_data = res.result
            if isinstance(result_data, dict):
                return JsonResponse(result_data)
            return JsonResponse({'success': True, 'output': str(result_data)})
        elif state == 'FAILURE':
            err_msg = str(res.result) if res.result else 'Execution failed'
            return JsonResponse({
                'success': False,
                'status': 'failure',
                'error': err_msg
            })
        else:
            return JsonResponse({'status': state.lower(), 'job_id': job_id})
    except Exception as e:
        logger.exception("Error checking compiler job status for %s", job_id)
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def compile_code_exam_sync(request):
    """
    Disabled legacy entrypoint.
    """
    raise RuntimeError("Synchronous compiler execution is disabled; use isolated sandbox or Celery queue.")

