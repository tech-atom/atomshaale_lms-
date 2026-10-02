import json
import uuid
import random
import string
from datetime import timedelta
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required, user_passes_test
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt

from django.db.models import Q
from django.core.paginator import Paginator
from pre_assessment.models import PreAssessmentExam
from exam.models import Exam, ExamQuestion, ExamResult
from exam.views import evaluate_code_with_test_cases

# Constants
FINAL_SUBMISSION_STATUSES = {"submitted", "accidental_submit", "retaken"}
LIVE_MONITOR_STATUSES = {"not_started", "active", "in_progress", "suspicious"}

# Helper to check admin access
def is_admin(user):
    return user.is_authenticated and (user.role == 'admin' or user.is_superuser)

# Code Generator helper
def generate_unique_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not PreAssessmentExam.objects.filter(code=code).exists():
            return code

# Helper to normalize question time spent maps
def _normalize_question_time_map(value):
    if not value:
        return {}
    if isinstance(value, dict):
        return {str(k): int(v) for k, v in value.items() if str(k).isdigit()}
    return {}


# =====================================================================
# ADMIN VIEWS
# =====================================================================

@login_required
@user_passes_test(is_admin)
def admin_page(request):
    """
    Renders the PRE-Assessment Management dashboard.
    """
    exams = Exam.objects.all().order_by('-created_at')
    return render(request, 'pre_assessment/admin_pre_assessment.html', {'exams': exams})


@login_required
@user_passes_test(is_admin)
@require_GET
def admin_list_api(request):
    """
    JSON API listing all PRE-Assessments.
    """
    pre_exams = PreAssessmentExam.objects.select_related('exam').all().order_by('-created_at')
    data = []
    for item in pre_exams:
        # Count submissions
        sub_count = ExamResult.objects.filter(
            pre_assessment=item,
            submission_status__in=FINAL_SUBMISSION_STATUSES
        ).count()
        
        data.append({
            'id': str(item.id),
            'exam_id': str(item.exam.id),
            'exam_title': item.exam.title,
            'code': item.code,
            'is_active': item.is_active,
            'created_at': item.created_at.isoformat(),
            'submissions_count': sub_count
        })
    return JsonResponse({'data': data})


@login_required
@user_passes_test(is_admin)
@require_POST
def admin_create_api(request):
    """
    JSON API to create a new PRE-Assessment.
    """
    try:
        payload = json.loads(request.body)
        exam_id = payload.get('exam_id')
        if not exam_id:
            return JsonResponse({'error': 'Missing exam_id'}, status=400)
            
        exam = get_object_or_404(Exam, id=exam_id)
        code = generate_unique_code()
        
        pre_exam = PreAssessmentExam.objects.create(
            exam=exam,
            code=code,
            created_by=request.user
        )
        return JsonResponse({'success': True, 'code': pre_exam.code})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
@csrf_exempt
def admin_toggle_api(request, pk):
    """
    Toggles the active state of a PRE-Assessment.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, id=pk)
    pre_exam.is_active = not pre_exam.is_active
    pre_exam.save()
    status_str = "activated" if pre_exam.is_active else "deactivated"
    return JsonResponse({'success': True, 'message': f'PRE-Assessment is now {status_str}'})


@login_required
@user_passes_test(is_admin)
@require_http_methods(["DELETE"])
@csrf_exempt
def admin_delete_api(request, pk):
    """
    Deletes a PRE-Assessment.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, id=pk)
    pre_exam.delete()
    return JsonResponse({'success': True, 'message': 'PRE-Assessment deleted successfully'})


def _format_pre_assessment_question_time_map(time_map):
    if not isinstance(time_map, dict) or not time_map:
        return "-"
    def _sort_key(item):
        key = str(item[0])
        return (0, int(key)) if key.isdigit() else (1, key)
    pairs = sorted(time_map.items(), key=_sort_key)
    return " | ".join([f"Q{k}: {v}s" for k, v in pairs])


def _submission_mode_for_pre_assessment(result):
    status_key = str(getattr(result, "submission_status", "") or "").lower()
    tab_limit = 3
    tab_switch_count = getattr(result, "tab_switch_count", 0) or 0
    if tab_switch_count >= tab_limit or status_key == "accidental_submit":
        return "Limit Exceeded Submit"
    if status_key in {"submitted", "retaken"}:
        return "Self Submitted"
    if status_key == "retake_allowed":
        return "Retake Allowed"
    if status_key:
        return status_key.replace("_", " ").title()
    return "-"


def _topic_analysis_for_pre_assessment(result, question_meta):
    breakdown = getattr(result, "question_wise_breakdown", None)
    if not isinstance(breakdown, list) or not breakdown:
        return "-"
    by_topic = {}
    for item in breakdown:
        if not isinstance(item, dict):
            continue
        qid = str(item.get("question_id") or "")
        qmeta = question_meta.get(qid, {"topic": "General", "marks": 0.0})
        topic = (qmeta.get("topic") or "General").strip() or "General"
        if topic not in by_topic:
            by_topic[topic] = {
                "attempted": 0,
                "correct": 0,
                "marks_obtained": 0.0,
                "total_marks": 0.0,
                "total_questions": 0,
            }
        by_topic[topic]["total_questions"] += 1
        by_topic[topic]["total_marks"] += qmeta["marks"]
        
        has_ans = item.get("attempted") or item.get("student_answer") or item.get("answer")
        if has_ans:
            by_topic[topic]["attempted"] += 1
        if item.get("correct"):
            by_topic[topic]["correct"] += 1
            by_topic[topic]["marks_obtained"] += float(item.get("marks_awarded") or 0.0)
            
    parts = []
    for topic, stat in sorted(by_topic.items()):
        parts.append(f"{topic}: Attempted={stat['attempted']}, Unattempted={stat['total_questions'] - stat['attempted']}, Correct={stat['correct']}, Score={stat['marks_obtained']}/{stat['total_marks']}")
    return " | ".join(parts) if parts else "-"


@login_required
@user_passes_test(is_admin)
@require_GET
def admin_results_api(request, pk):
    """
    Returns results for a specific PRE-Assessment with detailed activity logs.
    Supports server-side search, filtering, and pagination for high concurrency (e.g., 10,000+ candidates).
    """
    pre_exam = get_object_or_404(PreAssessmentExam, id=pk)
    
    # Base queryset
    qs = ExamResult.objects.filter(pre_assessment=pre_exam)
    
    # 1. Server-side search & filters
    q = request.GET.get("q", "").strip()
    college = request.GET.get("college", "").strip()
    course = request.GET.get("course", "").strip()
    status_filter = request.GET.get("status", "all").strip().lower()
    
    if q:
        qs = qs.filter(
            Q(candidate_name__icontains=q) |
            Q(candidate_usn__icontains=q) |
            Q(candidate_email__icontains=q)
        )
        
    if college:
        qs = qs.filter(candidate_college=college)
        
    if course:
        qs = qs.filter(candidate_course=course)
        
    if status_filter == "submitted":
        qs = qs.filter(submission_status__in=FINAL_SUBMISSION_STATUSES)
    elif status_filter == "active":
        qs = qs.exclude(submission_status__in=FINAL_SUBMISSION_STATUSES)
        
    # Order by submission time or active time
    qs = qs.order_by('-submitted_at')
    
    # 2. Compute live stats aggregates on the server (very fast)
    total_count = ExamResult.objects.filter(pre_assessment=pre_exam).count()
    submitted_count = ExamResult.objects.filter(
        pre_assessment=pre_exam,
        submission_status__in=FINAL_SUBMISSION_STATUSES
    ).count()
    active_count = total_count - submitted_count
    
    # 3. Dynamic lists of colleges & courses for dropdown filters (pre-filtered by this exam)
    colleges_list = list(
        ExamResult.objects.filter(pre_assessment=pre_exam)
        .exclude(candidate_college="")
        .values_list("candidate_college", flat=True)
        .distinct()
        .order_by("candidate_college")
    )
    courses_list = list(
        ExamResult.objects.filter(pre_assessment=pre_exam)
        .exclude(candidate_course="")
        .values_list("candidate_course", flat=True)
        .distinct()
        .order_by("candidate_course")
    )
    
    # 4. Pagination
    page = int(request.GET.get("page", 1))
    per_page = int(request.GET.get("per_page", 50)) # Default 50 items per page
    
    paginator = Paginator(qs, per_page)
    page_obj = paginator.get_page(page)
    
    total_questions = ExamQuestion.objects.filter(exam=pre_exam.exam).count()
    
    # Preload question metadata for topic analyses
    question_meta = {}
    for q_meta in ExamQuestion.objects.filter(exam=pre_exam.exam).values("id", "section_tag", "marks"):
        question_meta[str(q_meta["id"])] = {
            "topic": (q_meta.get("section_tag") or "General").strip() or "General",
            "marks": float(q_meta.get("marks") or 0),
        }
        
    data = []
    for r in page_obj:
        time_taken_str = ""
        if r.time_taken:
            total_seconds = int(r.time_taken.total_seconds())
            mins, secs = divmod(total_seconds, 60)
            hours, mins = divmod(mins, 60)
            if hours > 0:
                time_taken_str = f"{hours}h {mins}m {secs}s"
            else:
                time_taken_str = f"{mins}m {secs}s"
        else:
            time_taken_str = "-"
            
        attempted = int(r.attempted_questions or 0)
        unattempted = max(total_questions - attempted, 0)
        percentage = round((r.marks_obtained / r.total_marks * 100.0) if r.total_marks else 0.0, 2)
        
        time_map = getattr(r, "question_time_map", {}) or {}
        time_spent_str = _format_pre_assessment_question_time_map(time_map)
        sub_mode = _submission_mode_for_pre_assessment(r)
        topic_anal = _topic_analysis_for_pre_assessment(r, question_meta)

        data.append({
            'id': r.id,
            'candidate_name': r.candidate_name or "Guest",
            'candidate_email': r.candidate_email or "-",
            'candidate_phone': r.candidate_phone or "-",
            'candidate_usn': r.candidate_usn or "-",
            'candidate_college': r.candidate_college or "-",
            'candidate_course': r.candidate_course or "-",
            'candidate_year': r.candidate_year or "-",
            'candidate_sem': r.candidate_sem or "-",
            'marks_obtained': r.marks_obtained,
            'total_marks': r.total_marks,
            'percentage': percentage,
            'attempted': attempted,
            'correct': r.correct_answers or 0,
            'wrong': r.wrong_answers or 0,
            'unattempted': unattempted,
            'tab_switch_count': int(getattr(r, "tab_switch_count", 0) or 0),
            'time_spent_each_question': time_spent_str,
            'submission_mode': sub_mode,
            'topic_analysis': topic_anal,
            'time_taken': time_taken_str,
            'submitted_at': r.submitted_at.isoformat(),
            'status': r.submission_status,
            'current_question': getattr(r, 'current_question', 1),
            'last_active_at': r.last_active_at.isoformat() if getattr(r, 'last_active_at', None) else None,
        })
        
    return JsonResponse({
        'data': data,
        'total_questions': total_questions,
        'exam_title': pre_exam.exam.title,
        'total_count': total_count,
        'active_count': active_count,
        'submitted_count': submitted_count,
        'colleges': colleges_list,
        'courses': courses_list,
        'page': page_obj.number,
        'num_pages': paginator.num_pages,
        'has_next': page_obj.has_next(),
        'has_prev': page_obj.has_previous(),
    })


@login_required
@user_passes_test(is_admin)
@require_POST
@csrf_exempt
def admin_allow_retake_api(request, result_id):
    """
    Allow one retake for a pre-assessment candidate attempt.
    """
    try:
        result = get_object_or_404(ExamResult, id=result_id)
        
        reason = "Accidental submission/Tab limit exceeded"
        if request.body:
            try:
                data = json.loads(request.body)
                reason = data.get("reason", reason)
            except Exception:
                pass

        result.allow_retake = True
        result.submission_status = "retake_allowed"
        result.live_status = "not_started"
        result.retake_reason = reason
        result.retake_allowed_at = timezone.now()
        result.retake_allowed_by = request.user
        
        # Reset progress fields
        result.tab_switch_count = 0
        result.current_question = 1
        result.question_time_map = {}
        result.save()

        name = result.candidate_name or result.candidate_email
        return JsonResponse({
            "status": "success",
            "message": f"Retake allowed for candidate {name}"
        })
    except Exception as e:
        return JsonResponse({
            "status": "error",
            "message": str(e)
        }, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
@csrf_exempt
def admin_remove_attempt_api(request, result_id):
    """
    Deletes the candidate attempt so they can register and start completely from scratch.
    """
    try:
        result = get_object_or_404(ExamResult, id=result_id)
        name = result.candidate_name or result.candidate_email
        result.delete()
        return JsonResponse({
            "status": "success",
            "message": f"Attempt removed for candidate {name}. They can now register and start from scratch."
        })
    except Exception as e:
        return JsonResponse({
            "status": "error",
            "message": str(e)
        }, status=500)


# =====================================================================
# CANDIDATE (STUDENT) PUBLIC FLOW VIEWS
# =====================================================================

@csrf_exempt
@require_POST
def candidate_enter_code(request):
    """
    Public entry point handling the code form from home page.
    """
    code = request.POST.get('code', '').strip().upper()
    if not code:
        return JsonResponse({'error': 'Please enter a code.'}, status=400)
        
    pre_exam = PreAssessmentExam.objects.filter(code=code, is_active=True).first()
    if not pre_exam:
        return JsonResponse({'error': 'Invalid or inactive access code.'}, status=400)
        
    # Redirect URL to registration page
    return JsonResponse({'success': True, 'redirect_url': f'/pre-assessment/register/{code}/'})


def candidate_register(request, code):
    """
    Registers basic candidate details into session before starting the exam.
    """
    from college.models import College, Course
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper(), is_active=True)
    colleges = College.objects.filter(is_active=True).order_by('name')
    
    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        email = request.POST.get('email', '').strip().lower()
        usn = request.POST.get('usn', '').strip().upper()
        college_id = request.POST.get('college', '').strip()
        course_id = request.POST.get('course', '').strip()
        year = request.POST.get('year', '').strip()
        sem = request.POST.get('sem', '').strip()
        
        try:
            college_obj = College.objects.get(id=college_id, is_active=True)
            college_name = college_obj.name
        except (College.DoesNotExist, ValueError):
            college_name = ""
            
        try:
            course_obj = Course.objects.get(id=course_id)
            course_name = course_obj.name
        except (Course.DoesNotExist, ValueError):
            course_name = ""
        
        if not name or not email or not usn or not college_name or not course_name or not year or not sem:
            return render(request, 'pre_assessment/register.html', {
                'pre_exam': pre_exam,
                'colleges': colleges,
                'error': 'All fields (Name, Email, USN, College, Course, Year, Semester) are required.'
            })
            
        # Check if already attempted by Email
        existing_email = ExamResult.objects.filter(
            pre_assessment=pre_exam,
            candidate_email=email,
            submission_status__in=FINAL_SUBMISSION_STATUSES
        ).first()
        
        if existing_email:
            return render(request, 'pre_assessment/register.html', {
                'pre_exam': pre_exam,
                'colleges': colleges,
                'error': f'A candidate with the email "{email}" has already submitted this assessment.'
            })

        # Check if already attempted by USN
        existing_usn = ExamResult.objects.filter(
            pre_assessment=pre_exam,
            candidate_usn=usn,
            submission_status__in=FINAL_SUBMISSION_STATUSES
        ).first()
        
        if existing_usn:
            return render(request, 'pre_assessment/register.html', {
                'pre_exam': pre_exam,
                'colleges': colleges,
                'error': f'A candidate with the USN "{usn}" has already submitted this assessment.'
            })
            
        # Save into session
        request.session['pre_assessment_candidate'] = {
            'name': name,
            'email': email,
            'usn': usn,
            'college': college_name,
            'course': course_name,
            'year': int(year),
            'sem': int(sem),
            'phone': '',  # kept for structure fallback
            'code': code.upper(),
            'session_token': str(uuid.uuid4())
        }
        return redirect('pre_assessment_exam_page', code=code.upper())
        
    return render(request, 'pre_assessment/register.html', {
        'pre_exam': pre_exam,
        'colleges': colleges
    })


def candidate_exam_page(request, code):
    """
    Renders the standalone exam taking environment.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper(), is_active=True)
    candidate = request.session.get('pre_assessment_candidate')
    
    if not candidate or candidate.get('code') != code.upper():
        return redirect('home')
        
    return render(request, 'pre_assessment/take_exam.html', {
        'code': code.upper(),
        'candidate': candidate,
        'exam': pre_exam.exam
    })


def candidate_thank_you(request, code):
    """
    Renders the thank you screen.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper())
    return render(request, 'pre_assessment/thank_you.html', {'pre_exam': pre_exam})


# =====================================================================
# CANDIDATE EXAM APIS (Replicates Scheduled Exam student APIs)
# =====================================================================

@require_GET
def api_get_exam_meta(request, code):
    """
    Returns exam meta-information array containing 1 exam block.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper(), is_active=True)
    candidate = request.session.get('pre_assessment_candidate')
    if not candidate or candidate.get('code') != code.upper():
        return JsonResponse({"error": "Unauthorized session"}, status=403)
        
    # Check if already completed
    latest_submission = ExamResult.objects.filter(
        Q(candidate_email=candidate['email']) | Q(candidate_usn=candidate.get('usn', ''))
    ).filter(pre_assessment=pre_exam).order_by("-submitted_at").first()
    
    already_attempted = (
        latest_submission is not None
        and latest_submission.submission_status in FINAL_SUBMISSION_STATUSES
    )
    
    # Send meta format expected by exam.js
    fake_start = pre_exam.created_at
    fake_end = pre_exam.created_at + timedelta(days=365)
    
    exam_data = [{
        "scheduled_exam_id": str(pre_exam.id),
        "exam_id": str(pre_exam.exam.id),
        "title": pre_exam.exam.title,
        "duration": pre_exam.exam.duration_minutes,
        "allowed_tab_switches": 3,
        "start": fake_start.isoformat(),
        "end": fake_end.isoformat(),
        "start_display": fake_start.strftime("%d-%m-%Y"),
        "start_time_display": fake_start.strftime("%I:%M %p"),
        "end_display": fake_end.strftime("%d-%m-%Y"),
        "end_time_display": fake_end.strftime("%I:%M %p"),
        "max_marks": pre_exam.exam.max_marks,
        "passing_marks": pre_exam.exam.passing_marks,
        "already_attempted": already_attempted,
    }]
    return JsonResponse({"exams": exam_data})


@require_GET
def api_get_exam_questions(request, code):
    """
    Returns question payloads and populates any saved answers (heartbeat recovery).
    """
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper(), is_active=True)
    candidate = request.session.get('pre_assessment_candidate')
    if not candidate or candidate.get('code') != code.upper():
        return JsonResponse({"error": "Unauthorized session"}, status=403)
        
    # Ensure a single result object is pre-created/retrieved for this candidate synchronously
    submission, created = ExamResult.objects.get_or_create(
        pre_assessment=pre_exam,
        candidate_email=candidate['email'],
        candidate_usn=candidate.get('usn', ''),
        defaults={
            'student': None,
            'exam': pre_exam.exam,
            'candidate_name': candidate['name'],
            'candidate_college': candidate.get('college', ''),
            'candidate_course': candidate.get('course', ''),
            'candidate_year': candidate.get('year'),
            'candidate_sem': candidate.get('sem'),
            'candidate_phone': candidate.get('phone', ''),
            'exam_title': pre_exam.exam.title,
            'total_marks': 0,
            'marks_obtained': 0,
            'attempted_questions': 0,
            'correct_answers': 0,
            'wrong_answers': 0,
            'question_wise_breakdown': [],
            'submission_status': 'active',
            'live_status': 'active',
        }
    )
    
    saved_answers = {}
    if submission:
        if submission.submission_status in FINAL_SUBMISSION_STATUSES:
            return JsonResponse({"error": "Assessment already submitted."}, status=403)
            
        breakdown = submission.question_wise_breakdown
        if isinstance(breakdown, list):
            for item in breakdown:
                q_id = item.get("question_id")
                student_ans = item.get("answer") or item.get("student_answer")
                if q_id is not None:
                    saved_answers[str(q_id)] = student_ans

    questions = ExamQuestion.objects.filter(exam=pre_exam.exam)
    question_data = []
    
    for q in questions:
        item = {
            "id": q.id,
            "text": q.question_text,
            "type": q.type,
            "section_tag": getattr(q, "section_tag", None),
            "marks": q.marks,
            "negative": q.negative_mark,
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
        "exam_id": str(pre_exam.exam.id),
        "exam_title": pre_exam.exam.title,
        "duration_minutes": pre_exam.exam.duration_minutes,
        "allowed_tab_switches": 3,
        "questions": question_data,
        "saved_answers": saved_answers
    })


@csrf_exempt
@require_POST
def api_live_update(request, code):
    """
    Handles live updates / heartbeat saving for PRE-Assessment candidates.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper(), is_active=True)
    candidate = request.session.get('pre_assessment_candidate')
    if not candidate or candidate.get('code') != code.upper():
        return JsonResponse({"error": "Unauthorized session"}, status=403)

    try:
        data = json.loads(request.body or "{}")
        current_question = data.get("current_question", 1)
        tab_switch_count = data.get("tab_switch_count", 0)
        question_time_map = _normalize_question_time_map(data.get("question_time_map") or {})
        requested_status = str(data.get("status", "active") or "active").lower().strip()
        
        status = requested_status if requested_status in LIVE_MONITOR_STATUSES else "active"
        if tab_switch_count > 2 and status in {"active", "in_progress", "not_started"}:
            status = "suspicious"
            
        temp_answers = data.get("temp_answers", [])
        device_token = data.get("device_token")
        
        result = ExamResult.objects.filter(
            Q(candidate_email=candidate['email']) | Q(candidate_usn=candidate.get('usn', ''))
        ).filter(pre_assessment=pre_exam).order_by("-submitted_at").first()
        
        if result and result.submission_status in FINAL_SUBMISSION_STATUSES:
            return JsonResponse({"status": "success"})
            
        if result is None:
            ExamResult.objects.create(
                student=None, # Guest student
                exam=pre_exam.exam,
                pre_assessment=pre_exam,
                candidate_name=candidate['name'],
                candidate_email=candidate['email'],
                candidate_usn=candidate.get('usn', ''),
                candidate_college=candidate.get('college', ''),
                candidate_course=candidate.get('course', ''),
                candidate_year=candidate.get('year'),
                candidate_sem=candidate.get('sem'),
                candidate_phone=candidate.get('phone', ''),
                exam_title=pre_exam.exam.title,
                total_marks=0,
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
                last_active_at=timezone.now(),
                device_session_token=device_token,
            )
        else:
            result.question_wise_breakdown = temp_answers
            result.submission_status = status
            result.live_status = status
            result.current_question = current_question
            result.question_time_map = question_time_map
            result.tab_switch_count = tab_switch_count
            result.last_active_at = timezone.now()
            if device_token:
                result.device_session_token = device_token
            result.save()
            
        return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@require_POST
def api_submit(request, code):
    """
    Submits candidate answers, evaluates grades, and computes marks.
    """
    pre_exam = get_object_or_404(PreAssessmentExam, code=code.upper(), is_active=True)
    candidate = request.session.get('pre_assessment_candidate')
    if not candidate or candidate.get('code') != code.upper():
        return JsonResponse({"error": "Unauthorized session"}, status=403)

    try:
        data = json.loads(request.body or "{}")
        device_token = data.get("device_token")
        answers = data.get("answers", [])
        
        result = ExamResult.objects.filter(
            Q(candidate_email=candidate['email']) | Q(candidate_usn=candidate.get('usn', ''))
        ).filter(pre_assessment=pre_exam).order_by("-submitted_at").first()
        
        if result and result.submission_status in FINAL_SUBMISSION_STATUSES:
            return JsonResponse({"error": "Already submitted"}, status=403)
            
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
        
        exam_questions = ExamQuestion.objects.filter(exam=pre_exam.exam)
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
                    # No test cases, code is submitted but needs manual evaluation
                    marks_awarded = q.marks
                    correct += 1
                    is_correct = True
                    breakdown.append({
                        "question_id": str(q.id),
                        "type": q.type,
                        "student_answer": student_ans,
                        "correct_answer": None,
                        "correct": True,
                        "marks_awarded": marks_awarded
                    })
            elif q.type == "DESC":
                # Descriptive questions require manual evaluation, awarded full marks temporarily
                marks_awarded = q.marks
                correct += 1
                is_correct = True
                breakdown.append({
                    "question_id": str(q.id),
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": True,
                    "marks_awarded": marks_awarded
                })
                
            obtained += marks_awarded
            total += q.marks
            attempted += 1
            
        # Time calculations
        total_seconds = 0
        post_qmap = data.get("question_time_map") or {}
        if isinstance(post_qmap, dict) and post_qmap:
            for k, v in post_qmap.items():
                try:
                    total_seconds += int(v or 0)
                except (ValueError, TypeError):
                    pass

        if total_seconds <= 0 and result and isinstance(getattr(result, "question_time_map", None), dict):
            for k, v in result.question_time_map.items():
                try:
                    total_seconds += int(v or 0)
                except (ValueError, TypeError):
                    pass

        if total_seconds > 0:
            time_taken = timedelta(seconds=total_seconds)
        elif result and result.submitted_at:
            time_taken = timezone.now() - result.submitted_at
        else:
            time_taken = None
            
        if result is None:
            result = ExamResult.objects.create(
                student=None,
                exam=pre_exam.exam,
                pre_assessment=pre_exam,
                candidate_name=candidate['name'],
                candidate_email=candidate['email'],
                candidate_usn=candidate.get('usn', ''),
                candidate_college=candidate.get('college', ''),
                candidate_course=candidate.get('course', ''),
                candidate_year=candidate.get('year'),
                candidate_sem=candidate.get('sem'),
                candidate_phone=candidate.get('phone', ''),
                exam_title=pre_exam.exam.title,
                total_marks=total,
                marks_obtained=obtained,
                attempted_questions=attempted,
                correct_answers=correct,
                wrong_answers=wrong,
                question_wise_breakdown=breakdown,
                submission_status="submitted",
                live_status="submitted",
                time_taken=time_taken,
                device_session_token=device_token,
            )
        else:
            result.total_marks = total
            result.marks_obtained = obtained
            result.attempted_questions = attempted
            result.correct_answers = correct
            result.wrong_answers = wrong
            result.question_wise_breakdown = breakdown
            result.submission_status = "submitted"
            result.live_status = "submitted"
            result.time_taken = time_taken
            if device_token:
                result.device_session_token = device_token
            result.save()
            
        # Clean the candidate session
        if 'pre_assessment_candidate' in request.session:
            del request.session['pre_assessment_candidate']
            
        return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
