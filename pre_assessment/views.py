import json
import uuid
import random
import string
import logging
from datetime import timedelta, datetime
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse
from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required, user_passes_test
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_http_methods, require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt

from django.db import transaction, IntegrityError
from django.db.models import Q
from django.core.paginator import Paginator
from pre_assessment.models import PreAssessmentExam
from exam.models import Exam, ExamQuestion, ExamResult
from exam.views import evaluate_code_with_test_cases
from exam.device_detector import parse_device_info

logger = logging.getLogger(__name__)

# Constants
FINAL_SUBMISSION_STATUSES = {"submitted", "accidental_submit", "retaken", "time_expired"}
LIVE_MONITOR_STATUSES = {"not_started", "active", "in_progress", "suspicious"}

DEFAULT_STANDARD_FIELDS = {
    "usn": {"enabled": True, "required": True, "label": "USN / Register Number"},
    "phone": {"enabled": True, "required": False, "label": "Phone Number"},
    "college": {"enabled": True, "required": True, "label": "College Name"},
    "course": {"enabled": True, "required": True, "label": "Course / Department"},
    "year": {"enabled": True, "required": True, "label": "Year of Study"},
    "sem": {"enabled": True, "required": True, "label": "Semester"},
    "gender": {"enabled": False, "required": False, "label": "Gender"},
    "cgpa": {"enabled": False, "required": False, "label": "CGPA / Percentage"},
    "dob": {"enabled": False, "required": False, "label": "Date of Birth"},
    "city": {"enabled": False, "required": False, "label": "City / Location"},
}

def get_assessment_registration_config(pre_exam):
    """
    Returns the resolved registration fields configuration for a PreAssessmentExam.
    Ensures robust fallbacks for standard fields and dynamic custom fields.
    """
    raw = getattr(pre_exam, 'registration_fields', None) or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    
    std_cfg = {}
    for k, default_val in DEFAULT_STANDARD_FIELDS.items():
        std_cfg[k] = {
            "enabled": default_val["enabled"],
            "required": default_val["required"],
            "label": default_val["label"],
        }
    
    raw_std = raw.get("standard_fields")
    if isinstance(raw_std, dict):
        for k, default_val in DEFAULT_STANDARD_FIELDS.items():
            if k in raw_std and isinstance(raw_std[k], dict):
                std_cfg[k] = {
                    "enabled": bool(raw_std[k].get("enabled", default_val["enabled"])),
                    "required": bool(raw_std[k].get("required", default_val["required"])),
                    "label": str(raw_std[k].get("label", default_val["label"]) or default_val["label"]).strip(),
                }
    
    custom_fields = []
    raw_custom = raw.get("custom_fields")
    if isinstance(raw_custom, list):
        for idx, cf in enumerate(raw_custom):
            if isinstance(cf, dict) and cf.get("label"):
                cf_id = str(cf.get("id") or f"custom_{idx+1}").strip()
                raw_opts = cf.get("options", "")
                if isinstance(raw_opts, str):
                    opts = [opt.strip() for opt in raw_opts.split(",") if opt.strip()]
                elif isinstance(raw_opts, list):
                    opts = [str(opt).strip() for opt in raw_opts if str(opt).strip()]
                else:
                    opts = []
                custom_fields.append({
                    "id": cf_id,
                    "label": str(cf.get("label", "")).strip(),
                    "type": str(cf.get("type", "text")).strip().lower(),
                    "required": bool(cf.get("required", False)),
                    "placeholder": str(cf.get("placeholder", "")).strip(),
                    "options": opts
                })
                
    return {
        "standard_fields": std_cfg,
        "custom_fields": custom_fields
    }

# Helper to check admin access
def is_admin(user):
    return user.is_authenticated and (getattr(user, 'role', '') == 'admin' or user.is_superuser)

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
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception:
            return {}
    if isinstance(value, dict):
        result = {}
        for k, v in value.items():
            if str(k).isdigit():
                try:
                    result[str(k)] = int(float(v))
                except (ValueError, TypeError):
                    pass
        return result
    return {}

# Candidate attempt query helper to prevent cross-candidate collisions when USN is empty
def _get_candidate_exam_query(candidate, pre_exam):
    email = (candidate.get('email') or "").strip().lower()
    usn = (candidate.get('usn') or "").strip()
    if usn:
        q_filter = (Q(candidate_email__iexact=email) | Q(candidate_usn__iexact=usn))
    else:
        q_filter = Q(candidate_email__iexact=email)
    return ExamResult.objects.filter(q_filter, pre_assessment=pre_exam)


# Helper to check if a result was genuinely evaluated (Issue 6)
def _is_result_evaluated(result):
    """
    Returns True ONLY if ExamResult has been evaluated and graded.
    Verifies that entries in question_wise_breakdown have grading metadata
    ('marks_awarded' or 'verdict'), not just raw autosaved student answers.
    """
    if not result or result.submission_status not in FINAL_SUBMISSION_STATUSES:
        return False
        
    breakdown = getattr(result, "question_wise_breakdown", None)
    if isinstance(breakdown, str):
        try:
            breakdown = json.loads(breakdown)
        except Exception:
            return False
            
    if not isinstance(breakdown, list):
        return False

    if len(breakdown) == 0:
        # Edge case: Exam had 0 questions and result was finalized
        exam_obj = result.exam or (result.pre_assessment.exam if result.pre_assessment else None)
        if exam_obj and not ExamQuestion.objects.filter(exam=exam_obj).exists() and result.submitted_at is not None:
            return True
        return False
        
    for entry in breakdown:
        if isinstance(entry, dict) and ("marks_awarded" in entry or "verdict" in entry):
            return True
    return False


# Helper to merge autosaved answers per question safely (Issue 2)
def _merge_autosaved_answers(existing_breakdown, incoming_answers, client_timestamp=None, client_seq=None):
    """
    Safely merges incoming autosave answers into existing breakdown by question_id (Issue 2).
    - Preserves answers for other questions.
    - Prevents stale empty answers from overwriting existing answers.
    - Tracks versions, sequence numbers, and client timestamps to reject out-of-order delayed packets.
    """
    current_map = {}
    if isinstance(existing_breakdown, str):
        try:
            existing_breakdown = json.loads(existing_breakdown)
        except Exception:
            existing_breakdown = []
            
    if isinstance(existing_breakdown, list):
        for item in existing_breakdown:
            if isinstance(item, dict):
                qid = str(item.get("question_id") or "").strip()
                if qid:
                    current_map[qid] = dict(item)

    if isinstance(incoming_answers, str):
        try:
            incoming_answers = json.loads(incoming_answers)
        except Exception:
            incoming_answers = []

    if isinstance(incoming_answers, list):
        for item in incoming_answers:
            if not isinstance(item, dict):
                continue
            qid = str(item.get("question_id") or "").strip()
            if not qid:
                continue

            incoming_ans = item.get("answer") if "answer" in item else item.get("student_answer")
            incoming_ts = item.get("client_timestamp") or item.get("updated_at") or client_timestamp or 0
            incoming_seq = item.get("seq") or item.get("sequence_number") or client_seq or 0

            # Check if incoming answer is blank
            is_incoming_blank = False
            if incoming_ans is None or str(incoming_ans).strip() == "":
                is_incoming_blank = True
            elif isinstance(incoming_ans, str) and incoming_ans.strip().startswith("{") and "code" in incoming_ans:
                try:
                    p = json.loads(incoming_ans)
                    if isinstance(p, dict) and not str(p.get("code") or "").strip():
                        is_incoming_blank = True
                except Exception:
                    pass

            # If question already has an answer saved
            if qid in current_map:
                existing_item = current_map[qid]
                existing_ans = existing_item.get("answer") if "answer" in existing_item else existing_item.get("student_answer")
                existing_ts = existing_item.get("client_timestamp") or existing_item.get("updated_at") or 0
                existing_seq = existing_item.get("seq") or existing_item.get("sequence_number") or 0
                existing_version = int(existing_item.get("version") or 1)

                # 1. Reject stale delayed updates if incoming sequence or timestamp is older
                try:
                    if incoming_seq and existing_seq and int(incoming_seq) < int(existing_seq):
                        logger.debug("Rejecting stale autosave for question %s: seq %s < %s", qid, incoming_seq, existing_seq)
                        continue
                    if incoming_ts and existing_ts and float(incoming_ts) < float(existing_ts):
                        logger.debug("Rejecting stale autosave for question %s: ts %s < %s", qid, incoming_ts, existing_ts)
                        continue
                except (ValueError, TypeError):
                    pass

                # 2. If incoming answer is blank but existing answer is valid, preserve existing valid answer!
                if is_incoming_blank and existing_ans is not None and str(existing_ans).strip():
                    continue

                # Merge updated question answer with incremented version
                new_entry = dict(item)
                new_entry["question_id"] = qid
                new_entry["answer"] = incoming_ans
                new_entry["version"] = existing_version + 1
                if incoming_ts:
                    new_entry["client_timestamp"] = incoming_ts
                if incoming_seq:
                    new_entry["seq"] = incoming_seq
                current_map[qid] = new_entry
            else:
                new_entry = dict(item)
                new_entry["question_id"] = qid
                new_entry["answer"] = incoming_ans
                new_entry["version"] = 1
                if incoming_ts:
                    new_entry["client_timestamp"] = incoming_ts
                if incoming_seq:
                    new_entry["seq"] = incoming_seq
                current_map[qid] = new_entry

    return list(current_map.values())


# =====================================================================
# ADMIN VIEWS
# =====================================================================

def _parse_schedule_dt(dt_str):
    if not dt_str or not str(dt_str).strip():
        return None
    try:
        val = str(dt_str).strip()
        dt = parse_datetime(val)
        if dt is None:
            for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
                try:
                    dt = datetime.strptime(val, fmt)
                    break
                except ValueError:
                    pass
        if dt is not None and timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    except Exception:
        return None


def check_and_finalize_expired_pre_assessments(pre_exam=None):
    """
    Checks if assessment window has passed (end_datetime < now).
    If expired, auto-finalizes any active/in-progress student attempts.
    Optimized for high performance without N+1 query loop.
    """
    try:
        now = timezone.now()
        if pre_exam:
            if not pre_exam.end_datetime:
                return
            end_dt = pre_exam.end_datetime
            if timezone.is_naive(end_dt):
                end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())
            if end_dt >= now:
                return
            active_results = ExamResult.objects.filter(
                pre_assessment=pre_exam
            ).exclude(submission_status__in=FINAL_SUBMISSION_STATUSES).select_related('exam', 'pre_assessment__exam')
        else:
            active_results = ExamResult.objects.filter(
                pre_assessment__end_datetime__isnull=False,
                pre_assessment__end_datetime__lt=now
            ).exclude(submission_status__in=FINAL_SUBMISSION_STATUSES).select_related('exam', 'pre_assessment__exam')
            
        for res in active_results:
            try:
                exam_obj = res.exam or (res.pre_assessment.exam if res.pre_assessment else None)
                evaluate_and_finalize_pre_assessment_result(res, exam_obj, submission_mode_val="time_expired")
            except Exception as e:
                logger.exception("Failed to auto-finalize expired result %s", getattr(res, 'id', None))
    except Exception as e:
        logger.exception("Error in check_and_finalize_expired_pre_assessments")


def get_pre_assessment_dynamic_status(pre_exam, now=None):
    """
    Computes dynamic live status of a PreAssessment based on its schedule:
    - inactive: Manually deactivated (pre_exam.is_active=False takes absolute priority, Issue 4)
    - expired: end_datetime has passed
    - upcoming: start_datetime in future
    - active: Currently within scheduled window or active with no schedule
    """
    if now is None:
        now = timezone.now()
    
    current_tz = timezone.get_current_timezone()

    # Manual deactivation ALWAYS takes priority over schedules (Issue 4)
    if not pre_exam.is_active:
        return "inactive", "Inactive"
    
    start_dt = pre_exam.start_datetime
    if start_dt and timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, current_tz)
        
    end_dt = pre_exam.end_datetime
    if end_dt and timezone.is_naive(end_dt):
        end_dt = timezone.make_aware(end_dt, current_tz)
        
    if end_dt and now > end_dt:
        return "expired", "Expired"
    if start_dt and now < start_dt:
        return "upcoming", "Upcoming"
    if start_dt and end_dt and start_dt <= now <= end_dt:
        return "active", "Active"
    return "active", "Active"


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
    JSON API listing all PRE-Assessments with schedule, auto-activation/deactivation status, security settings, and registration fields.
    """
    try:
        now = timezone.now()
        check_and_finalize_expired_pre_assessments()
        
        pre_exams = PreAssessmentExam.objects.select_related('exam').all().order_by('-created_at')
        current_tz = timezone.get_current_timezone()
        data = []
        for item in pre_exams:
            sub_count = ExamResult.objects.filter(
                pre_assessment=item,
                submission_status__in=FINAL_SUBMISSION_STATUSES
            ).count()
            
            start_dt = item.start_datetime
            if start_dt:
                start_dt = timezone.make_aware(start_dt, current_tz) if timezone.is_naive(start_dt) else start_dt.astimezone(current_tz)
            
            end_dt = item.end_datetime
            if end_dt:
                end_dt = timezone.make_aware(end_dt, current_tz) if timezone.is_naive(end_dt) else end_dt.astimezone(current_tz)
            
            status_key, status_display = get_pre_assessment_dynamic_status(item, now)
            reg_config = get_assessment_registration_config(item)
            
            data.append({
                'id': str(item.id),
                'exam_id': str(item.exam.id) if item.exam else '',
                'exam_title': item.exam.title if item.exam else 'Untitled Exam',
                'code': item.code,
                'is_active': item.is_active,
                'status_key': status_key,
                'status_display': status_display,
                'is_live_now': status_key == 'active',
                'start_datetime': start_dt.strftime('%Y-%m-%dT%H:%M') if start_dt else '',
                'end_datetime': end_dt.strftime('%Y-%m-%dT%H:%M') if end_dt else '',
                'start_display': start_dt.strftime('%d/%m/%Y, %I:%M %p') if start_dt else 'Anytime / Immediate',
                'end_display': end_dt.strftime('%d/%m/%Y, %I:%M %p') if end_dt else 'No Expiry',
                'allowed_tab_switches': int(item.allowed_tab_switches or 3),
                'registration_fields': reg_config,
                'created_at': item.created_at.isoformat() if getattr(item, 'created_at', None) else '',
                'submissions_count': sub_count
            })
        return JsonResponse({'data': data})
    except Exception as e:
        logger.exception("Error in admin_list_api")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def admin_create_api(request):
    """
    JSON API to create a new PRE-Assessment with optional schedule, tab limit, and custom registration fields.
    """
    try:
        payload = json.loads(request.body)
        exam_id = payload.get('exam_id')
        if not exam_id:
            return JsonResponse({'error': 'Missing exam_id'}, status=400)
            
        exam = get_object_or_404(Exam, id=exam_id)
        code = generate_unique_code()
        
        start_dt = _parse_schedule_dt(payload.get('start_datetime'))
        end_dt = _parse_schedule_dt(payload.get('end_datetime'))
        
        if start_dt and end_dt and start_dt >= end_dt:
            return JsonResponse({'error': 'End date & time must be after start date & time.'}, status=400)
            
        allowed_tab_switches = payload.get('allowed_tab_switches')
        try:
            allowed_tab_switches = max(1, int(allowed_tab_switches)) if allowed_tab_switches is not None and str(allowed_tab_switches).strip() != '' else 3
        except (ValueError, TypeError):
            allowed_tab_switches = 3
            
        registration_fields = payload.get('registration_fields') or {}
        if not isinstance(registration_fields, dict):
            registration_fields = {}
        
        pre_exam = PreAssessmentExam.objects.create(
            exam=exam,
            code=code,
            start_datetime=start_dt,
            end_datetime=end_dt,
            allowed_tab_switches=allowed_tab_switches,
            registration_fields=registration_fields,
            created_by=request.user
        )
        return JsonResponse({'success': True, 'code': pre_exam.code})
    except Exception as e:
        logger.exception("Error in admin_create_api")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def admin_update_settings_api(request, pk):
    """
    JSON API to update schedule, tab limit, and registration fields for an existing PRE-Assessment.
    """
    try:
        pre_exam = get_object_or_404(PreAssessmentExam, id=pk)
        payload = json.loads(request.body)
        
        start_dt = _parse_schedule_dt(payload.get('start_datetime')) if 'start_datetime' in payload else pre_exam.start_datetime
        end_dt = _parse_schedule_dt(payload.get('end_datetime')) if 'end_datetime' in payload else pre_exam.end_datetime
        
        if start_dt and end_dt and start_dt >= end_dt:
            return JsonResponse({'error': 'End date & time must be after start date & time.'}, status=400)
            
        if 'allowed_tab_switches' in payload:
            try:
                val = payload['allowed_tab_switches']
                pre_exam.allowed_tab_switches = max(1, int(val)) if val is not None and str(val).strip() != '' else 3
            except (ValueError, TypeError):
                pre_exam.allowed_tab_switches = 3
                
        if 'registration_fields' in payload:
            raw_reg = payload['registration_fields']
            if isinstance(raw_reg, dict):
                pre_exam.registration_fields = raw_reg
                
        if 'start_datetime' in payload:
            pre_exam.start_datetime = start_dt
        if 'end_datetime' in payload:
            pre_exam.end_datetime = end_dt
        if 'is_active' in payload and payload['is_active'] is not None:
            pre_exam.is_active = bool(payload['is_active'])
        elif start_dt or end_dt:
            pre_exam.is_active = True
            
        pre_exam.save()
        return JsonResponse({'success': True, 'message': 'Assessment settings updated successfully.'})
    except Exception as e:
        logger.exception("Error in admin_update_settings_api")
        return JsonResponse({'error': str(e)}, status=500)


def evaluate_and_finalize_pre_assessment_result(result, exam_obj=None, answers_override=None, submission_mode_val="submitted"):
    """
    Evaluates answers and finalizes ExamResult.
    1. Merges autosaved answers with submitted answers so autosaved answers are never lost (Issue 1).
    2. Enforces valid grading rules (Issue 3):
       - Empty coding answers are marked 'Unattempted' and not counted as attempted.
       - Coding questions without test cases or expected output require manual evaluation (0 auto-marks).
       - Descriptive questions enforce min_characters and match expected_keywords; without keywords, 0 auto-marks (Pending Review).
    3. Guarantees atomic transaction so result is marked submitted only after evaluation completes successfully (Issue 5).
    """
    if not exam_obj:
        exam_obj = result.exam or (result.pre_assessment.exam if result.pre_assessment else None)
    if not exam_obj:
        with transaction.atomic():
            now_dt = timezone.now()
            result.submission_status = submission_mode_val
            result.live_status = "submitted"
            result.submitted_at = now_dt
            result.save()
        return result

    # 1. Merge submitted answers with saved answers (Issue 1)
    saved_answers_map = {}
    raw_saved = getattr(result, "question_wise_breakdown", None) or []
    if isinstance(raw_saved, str):
        try:
            raw_saved = json.loads(raw_saved)
        except Exception:
            raw_saved = []
    if isinstance(raw_saved, list):
        for entry in raw_saved:
            if isinstance(entry, dict):
                qid = str(entry.get("question_id") or "").strip()
                ans = entry.get("answer") if "answer" in entry else entry.get("student_answer")
                if qid and ans is not None and str(ans).strip():
                    saved_answers_map[qid] = ans

    # Parse submitted answers
    submitted_answers_map = {}
    if answers_override is not None:
        raw_sub = answers_override
        if isinstance(raw_sub, str):
            try:
                raw_sub = json.loads(raw_sub)
            except Exception:
                raw_sub = []
        if isinstance(raw_sub, list):
            for entry in raw_sub:
                if isinstance(entry, dict):
                    qid = str(entry.get("question_id") or "").strip()
                    ans = entry.get("answer") if "answer" in entry else entry.get("student_answer")
                    if qid:
                        submitted_answers_map[qid] = ans

    # Baseline is saved answers; submitted non-empty answers take precedence (conflict resolution rule)
    answers_map = dict(saved_answers_map)
    for qid, sub_ans in submitted_answers_map.items():
        if sub_ans is not None and str(sub_ans).strip():
            # Check for empty code payload
            is_valid = True
            if isinstance(sub_ans, str) and sub_ans.strip().startswith("{") and "code" in sub_ans:
                try:
                    p = json.loads(sub_ans)
                    if isinstance(p, dict) and not str(p.get("code") or "").strip():
                        is_valid = False
                except Exception:
                    pass
            if is_valid:
                answers_map[qid] = sub_ans
            elif qid not in answers_map:
                answers_map[qid] = sub_ans
        elif qid not in answers_map:
            answers_map[qid] = sub_ans

    total = 0.0
    obtained = 0.0
    attempted = 0
    correct = 0
    wrong = 0
    breakdown = []

    exam_questions = ExamQuestion.objects.filter(exam=exam_obj)
    for q in exam_questions:
        q_id_str = str(q.id)
        q_marks = float(q.marks or 0.0)
        q_neg = float(q.negative_mark or 0.0)

        student_ans = answers_map.get(q_id_str)
        if student_ans is None or str(student_ans).strip() == "":
            total += q_marks
            breakdown.append({
                "question_id": q_id_str,
                "type": q.type,
                "student_answer": None,
                "correct_answer": q.correct_answer if q.type in ["MCQ", "TF"] else None,
                "correct": False,
                "marks_awarded": 0.0,
                "verdict": "Unattempted"
            })
            continue

        marks_awarded = 0.0
        is_correct = False

        if q.type in ["MCQ", "TF"]:
            attempted += 1
            if str(student_ans).strip().lower() == str(q.correct_answer or "").strip().lower():
                marks_awarded = q_marks
                is_correct = True
                correct += 1
                verdict = "Correct"
            else:
                marks_awarded = -q_neg
                wrong += 1
                verdict = "Wrong Answer"
            breakdown.append({
                "question_id": q_id_str,
                "type": q.type,
                "student_answer": student_ans,
                "correct_answer": q.correct_answer,
                "correct": is_correct,
                "marks_awarded": marks_awarded,
                "verdict": verdict
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
                # Empty code is UNATTEMPTED (Issue 3: empty code not counted as attempted)
                total += q_marks
                breakdown.append({
                    "question_id": q_id_str,
                    "type": q.type,
                    "student_answer": None,
                    "correct_answer": None,
                    "correct": False,
                    "marks_awarded": 0.0,
                    "verdict": "Unattempted",
                    "passed": 0,
                    "total": 0,
                    "test_results": []
                })
                continue

            attempted += 1
            test_cases_list = q.test_cases
            if isinstance(test_cases_list, str):
                try:
                    test_cases_list = json.loads(test_cases_list)
                except Exception:
                    test_cases_list = []

            try:
                if test_cases_list and isinstance(test_cases_list, (list, dict)) and len(test_cases_list) > 0:
                    judge = evaluate_code_with_test_cases(
                        code_text,
                        language,
                        test_cases_list,
                        max_score=q_marks
                    )
                    passed_cases = int(judge.get("passed", 0))
                    total_cases = int(judge.get("total", 0))
                    score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                    marks_awarded = round(q_marks * score_ratio, 2)
                    is_correct = judge.get("verdict") == "Accepted"
                    test_results = judge.get("details", [])

                    if is_correct:
                        correct += 1
                    else:
                        wrong += 1

                    breakdown.append({
                        "question_id": q_id_str,
                        "type": q.type,
                        "student_answer": student_ans,
                        "correct_answer": None,
                        "correct": is_correct,
                        "marks_awarded": marks_awarded,
                        "verdict": judge.get("verdict", "Accepted" if is_correct else "Wrong Answer"),
                        "passed": passed_cases,
                        "total": total_cases,
                        "test_results": test_results
                    })
                elif q.expected_output:
                    judge = evaluate_code_with_test_cases(
                        code_text,
                        language,
                        [{"input": q.input_example or "", "output": q.expected_output}],
                        max_score=q_marks
                    )
                    passed_cases = int(judge.get("passed", 0))
                    total_cases = int(judge.get("total", 0))
                    score_ratio = (passed_cases / total_cases) if total_cases else 0.0
                    marks_awarded = round(q_marks * score_ratio, 2)
                    is_correct = judge.get("verdict") == "Accepted"
                    test_results = judge.get("details", [])

                    if is_correct:
                        correct += 1
                    else:
                        wrong += 1

                    breakdown.append({
                        "question_id": q_id_str,
                        "type": q.type,
                        "student_answer": student_ans,
                        "correct_answer": None,
                        "correct": is_correct,
                        "marks_awarded": marks_awarded,
                        "verdict": judge.get("verdict", "Accepted" if is_correct else "Wrong Answer"),
                        "passed": passed_cases,
                        "total": total_cases,
                        "test_results": test_results
                    })
                else:
                    # Coding question without test cases or expected output -> Manual evaluation required, 0 auto-marks (Issue 3)
                    marks_awarded = 0.0
                    is_correct = False
                    wrong += 1
                    breakdown.append({
                        "question_id": q_id_str,
                        "type": q.type,
                        "student_answer": student_ans,
                        "correct_answer": None,
                        "correct": False,
                        "marks_awarded": 0.0,
                        "verdict": "Pending Review (Requires Manual Grading)",
                        "passed": 0,
                        "total": 0,
                        "test_results": []
                    })
            except Exception as judge_err:
                logger.exception("Code evaluation error for Question %s", q.id)
                marks_awarded = 0.0
                wrong += 1
                breakdown.append({
                    "question_id": q_id_str,
                    "type": q.type,
                    "student_answer": student_ans,
                    "correct_answer": None,
                    "correct": False,
                    "marks_awarded": 0.0,
                    "verdict": "Evaluation Error",
                    "passed": 0,
                    "total": 1,
                    "test_results": [{"status": "Error", "message": str(judge_err)}]
                })
        elif q.type == "DESC":
            desc_text = str(student_ans or "").strip()
            if not desc_text:
                total += q_marks
                breakdown.append({
                    "question_id": q_id_str,
                    "type": q.type,
                    "student_answer": None,
                    "correct_answer": None,
                    "correct": False,
                    "marks_awarded": 0.0,
                    "verdict": "Unattempted"
                })
                continue

            attempted += 1
            min_chars = int(q.min_characters or 0)
            if min_chars > 0 and len(desc_text) < min_chars:
                marks_awarded = 0.0
                is_correct = False
                wrong += 1
                verdict = f"Failed (Length {len(desc_text)} < {min_chars} required min characters)"
            else:
                raw_kws = q.expected_keywords
                if isinstance(raw_kws, str):
                    try:
                        raw_kws = json.loads(raw_kws)
                    except Exception:
                        raw_kws = [k.strip() for k in raw_kws.split(",") if k.strip()]
                if not isinstance(raw_kws, list):
                    raw_kws = []

                expected_kws = [str(k).strip().lower() for k in raw_kws if str(k).strip()]
                if expected_kws:
                    ans_lower = desc_text.lower()
                    matched = [kw for kw in expected_kws if kw in ans_lower]
                    ratio = len(matched) / len(expected_kws)
                    marks_awarded = round(q_marks * ratio, 2)
                    is_correct = (ratio >= 0.7)
                    verdict = f"Matched {len(matched)}/{len(expected_kws)} keywords"
                    if is_correct:
                        correct += 1
                    else:
                        wrong += 1
                else:
                    # Descriptive without keywords -> Manual evaluation required, 0 auto-marks (Issue 3)
                    marks_awarded = 0.0
                    is_correct = False
                    verdict = "Pending Review (Requires Manual Grading)"

            breakdown.append({
                "question_id": q_id_str,
                "type": q.type,
                "student_answer": student_ans,
                "correct_answer": None,
                "correct": is_correct,
                "marks_awarded": marks_awarded,
                "verdict": verdict
            })

        obtained += marks_awarded
        total += q_marks

    # Issue 5: Finalize submission atomically ONLY after successful evaluation
    with transaction.atomic():
        now_dt = timezone.now()
        if not result.time_taken:
            if result.submitted_at:
                result.time_taken = now_dt - result.submitted_at
            else:
                result.time_taken = timedelta(seconds=0)

        result.submitted_at = now_dt
        result.total_marks = round(total, 2)
        result.marks_obtained = round(obtained, 2)
        result.attempted_questions = attempted
        result.correct_answers = correct
        result.wrong_answers = wrong
        result.question_wise_breakdown = breakdown
        result.submission_status = submission_mode_val
        result.live_status = "submitted"
        result.save()
    return result


@login_required
@user_passes_test(is_admin)
@require_POST
def admin_toggle_api(request, pk):
    """
    Toggles the active state of a PRE-Assessment.
    When deactivating, automatically submits all in-progress student attempts.
    """
    try:
        pre_exam = get_object_or_404(PreAssessmentExam, id=pk)
        pre_exam.is_active = not pre_exam.is_active
        pre_exam.save()
        
        if not pre_exam.is_active:
            in_progress_results = ExamResult.objects.filter(
                pre_assessment=pre_exam
            ).exclude(submission_status__in=FINAL_SUBMISSION_STATUSES).select_related('exam', 'pre_assessment__exam')
            
            for res in in_progress_results:
                try:
                    exam_obj = res.exam or pre_exam.exam
                    evaluate_and_finalize_pre_assessment_result(res, exam_obj)
                except Exception as e:
                    logger.exception("Failed to auto-finalize result %s", res.id)
                    
        status_str = "activated" if pre_exam.is_active else "deactivated"
        return JsonResponse({'success': True, 'message': f'PRE-Assessment is now {status_str}'})
    except Exception as e:
        logger.exception("Error in admin_toggle_api")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_http_methods(["DELETE"])
def admin_delete_api(request, pk):
    """
    Deletes a PRE-Assessment.
    """
    try:
        pre_exam = get_object_or_404(PreAssessmentExam, id=pk)
        pre_exam.delete()
        return JsonResponse({'success': True, 'message': 'PRE-Assessment deleted successfully'})
    except Exception as e:
        logger.exception("Error in admin_delete_api")
        return JsonResponse({'error': str(e)}, status=500)


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
    if isinstance(breakdown, str):
        try:
            breakdown = json.loads(breakdown)
        except Exception:
            breakdown = None
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
        by_topic[topic]["total_marks"] += float(qmeta.get("marks") or 0.0)
        
        has_ans = item.get("attempted") or item.get("student_answer") or item.get("answer")
        if has_ans:
            by_topic[topic]["attempted"] += 1
        if item.get("correct"):
            by_topic[topic]["correct"] += 1
        try:
            by_topic[topic]["marks_obtained"] += float(item.get("marks_awarded") or 0.0)
        except (ValueError, TypeError):
            pass
            
    parts = []
    for topic, stat in sorted(by_topic.items()):
        marks_obt = round(stat['marks_obtained'], 2)
        tot_marks = round(stat['total_marks'], 2)
        parts.append(f"{topic}: Attempted={stat['attempted']}, Unattempted={stat['total_questions'] - stat['attempted']}, Correct={stat['correct']}, Score={marks_obt}/{tot_marks}")
    return " | ".join(parts) if parts else "-"


@login_required
@user_passes_test(is_admin)
@require_GET
def admin_results_api(request, pk):
    """
    Returns results for a specific PRE-Assessment with detailed activity logs.
    Supports server-side search, filtering, and pagination for high concurrency.
    Guaranteed zero 500 errors on null submitted_at, null marks, or unsubmitted candidates.
    """
    try:
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
        qs = qs.order_by('-submitted_at', '-id')
        
        # 2. Compute live stats aggregates on the server
        total_count = ExamResult.objects.filter(pre_assessment=pre_exam).count()
        submitted_count = ExamResult.objects.filter(
            pre_assessment=pre_exam,
            submission_status__in=FINAL_SUBMISSION_STATUSES
        ).count()
        active_count = max(0, total_count - submitted_count)
        
        # 3. Dynamic lists of colleges & courses for dropdown filters (excluding empty/null)
        colleges_raw = (
            ExamResult.objects.filter(pre_assessment=pre_exam)
            .exclude(candidate_college="")
            .exclude(candidate_college__isnull=True)
            .values_list("candidate_college", flat=True)
            .distinct()
            .order_by("candidate_college")
        )
        colleges_list = [c.strip() for c in colleges_raw if c and str(c).strip()]
        
        courses_raw = (
            ExamResult.objects.filter(pre_assessment=pre_exam)
            .exclude(candidate_course="")
            .exclude(candidate_course__isnull=True)
            .values_list("candidate_course", flat=True)
            .distinct()
            .order_by("candidate_course")
        )
        courses_list = [c.strip() for c in courses_raw if c and str(c).strip()]
        
        # 4. Pagination
        try:
            page = max(1, int(request.GET.get("page", 1)))
        except (ValueError, TypeError):
            page = 1
        try:
            per_page = max(1, min(200, int(request.GET.get("per_page", 50))))
        except (ValueError, TypeError):
            per_page = 50
        
        paginator = Paginator(qs, per_page)
        page_obj = paginator.get_page(page)
        
        total_questions = ExamQuestion.objects.filter(exam=pre_exam.exam).count() if pre_exam.exam else 0
        
        # Preload question metadata for topic analyses
        question_meta = {}
        if pre_exam.exam:
            for q_meta in ExamQuestion.objects.filter(exam=pre_exam.exam).values("id", "section_tag", "marks"):
                question_meta[str(q_meta["id"])] = {
                    "topic": (q_meta.get("section_tag") or "General").strip() or "General",
                    "marks": float(q_meta.get("marks") or 0.0),
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
            tot_m = float(r.total_marks or 0.0)
            obt_m = float(r.marks_obtained or 0.0)
            percentage = round((obt_m / tot_m * 100.0) if tot_m > 0 else 0.0, 2)
            
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
                'candidate_custom_data': getattr(r, 'candidate_custom_data', {}) or {},
                'marks_obtained': obt_m,
                'total_marks': tot_m,
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
                'submitted_at': r.submitted_at.isoformat() if getattr(r, 'submitted_at', None) else None,
                'status': r.submission_status,
                'current_question': getattr(r, 'current_question', 1),
                'last_active_at': r.last_active_at.isoformat() if getattr(r, 'last_active_at', None) else None,
                'device_info': r.device_info or "-",
                'device_type': r.device_type or "-",
                'os_name': r.os_name or "-",
                'browser_name': r.browser_name or "-",
                'ip_address': r.ip_address or "-",
            })
            
        return JsonResponse({
            'data': data,
            'total_questions': total_questions,
            'exam_title': pre_exam.exam.title if pre_exam.exam else 'Untitled Exam',
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
    except Exception as e:
        logger.exception("Error in admin_results_api for assessment %s", pk)
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def admin_allow_retake_api(request, result_id):
    """
    Allow one retake for a pre-assessment candidate attempt.
    Completely resets previous answers, scores, timestamps, and progress (Issue 5).
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
        
        # Issue 5: Completely reset all attempt-specific grading and answer fields
        result.marks_obtained = 0.0
        result.total_marks = 0.0
        result.correct_answers = 0
        result.wrong_answers = 0
        result.attempted_questions = 0
        result.question_wise_breakdown = []
        result.tab_switch_count = 0
        result.current_question = 1
        result.question_time_map = {}
        result.time_taken = None
        result.submitted_at = None
        result.last_active_at = None
        result.save()

        name = result.candidate_name or result.candidate_email
        return JsonResponse({
            "status": "success",
            "message": f"Retake allowed for candidate {name}"
        })
    except Exception as e:
        logger.exception("Error in admin_allow_retake_api")
        return JsonResponse({
            "status": "error",
            "error": str(e),
            "message": str(e)
        }, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
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
        logger.exception("Error in admin_remove_attempt_api")
        return JsonResponse({
            "status": "error",
            "error": str(e),
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
    Automatically checks schedule window for auto-activation / deactivation.
    """
    try:
        code = request.POST.get('code', '').strip().upper()
        if not code:
            return JsonResponse({'error': 'Please enter a code.'}, status=400)
            
        pre_exam = PreAssessmentExam.objects.filter(code=code).first()
        if not pre_exam:
            return JsonResponse({'error': 'Invalid access code. Please check and try again.'}, status=400)

        now = timezone.now()
        check_and_finalize_expired_pre_assessments(pre_exam)
        current_tz = timezone.get_current_timezone()
        status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)

        if status_key == "upcoming":
            start_str = pre_exam.start_datetime.astimezone(current_tz).strftime("%d-%b-%Y %I:%M %p") if pre_exam.start_datetime else "soon"
            return JsonResponse({'error': f'This assessment has not started yet. It will automatically activate on {start_str}.'}, status=400)

        if status_key == "expired":
            end_str = pre_exam.end_datetime.astimezone(current_tz).strftime("%d-%b-%Y %I:%M %p") if pre_exam.end_datetime else "earlier"
            return JsonResponse({'error': f'This assessment has ended. The scheduled window closed on {end_str}.'}, status=400)

        if status_key == "inactive":
            return JsonResponse({'error': 'This assessment is currently inactive or has been disabled by the administrator.'}, status=400)
            
        # Redirect URL to registration page
        return JsonResponse({'success': True, 'redirect_url': f'/pre-assessment/register/{code}/'})
    except Exception as e:
        logger.exception("Error in candidate_enter_code")
        return JsonResponse({'error': 'An unexpected error occurred. Please try again.'}, status=500)


def candidate_register(request, code):
    """
    Registers basic candidate details into session before starting the exam.
    Automatically validates against the scheduled window and dynamically configured registration fields.
    """
    clean_code = (code or "").strip().upper()
    try:
        from college.models import College, Course
        pre_exam = PreAssessmentExam.objects.filter(code=clean_code).first()

        if not pre_exam:
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'is_inactive': False,
                'is_not_found': True,
                'title': 'Invalid Assessment Link',
                'message': f'No assessment was found matching access code "{clean_code}". Please verify the link or enter a valid access code.'
            }, status=404)

        now = timezone.now()
        try:
            check_and_finalize_expired_pre_assessments(pre_exam)
        except Exception:
            logger.exception("Error checking expired pre_assessments in candidate_register")

        current_tz = timezone.get_current_timezone()
        status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)

        if status_key == "upcoming":
            start_str = pre_exam.start_datetime.astimezone(current_tz).strftime("%d-%b-%Y %I:%M %p") if pre_exam.start_datetime else "soon"
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': pre_exam,
                'is_inactive': True,
                'is_not_found': False,
                'title': 'Assessment Has Not Started',
                'message': f'The assessment "{pre_exam.exam.title if pre_exam.exam else clean_code}" is scheduled to automatically activate on {start_str}. Please return at the scheduled start time.'
            }, status=403)

        if status_key == "expired":
            end_str = pre_exam.end_datetime.astimezone(current_tz).strftime("%d-%b-%Y %I:%M %p") if pre_exam.end_datetime else "earlier"
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': pre_exam,
                'is_inactive': True,
                'is_not_found': False,
                'title': 'Assessment Window Closed',
                'message': f'The assessment "{pre_exam.exam.title if pre_exam.exam else clean_code}" automatically closed on {end_str}. New registrations are no longer accepted.'
            }, status=403)

        if status_key == "inactive":
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': pre_exam,
                'is_inactive': True,
                'is_not_found': False,
                'title': 'Assessment Currently Inactive',
                'message': f'The assessment "{pre_exam.exam.title if pre_exam.exam else clean_code}" (Code: {clean_code}) is currently inactive or has been closed by the administrator.'
            }, status=403)

        try:
            colleges = list(College.objects.filter(is_active=True).order_by('name'))
        except Exception:
            try:
                colleges = list(College.objects.all().order_by('name'))
            except Exception:
                colleges = []

        reg_config = get_assessment_registration_config(pre_exam)
        std_cfg = reg_config.get("standard_fields", {})
        
        if request.method == 'POST':
            try:
                name = request.POST.get('name', '').strip()
                email = request.POST.get('email', '').strip().lower()
                
                if not name or not email:
                    return render(request, 'pre_assessment/register.html', {
                        'pre_exam': pre_exam,
                        'colleges': colleges,
                        'reg_config': reg_config,
                        'error': 'Full Name and Email Address are mandatory.'
                    })

                custom_data = {}
                
                # 1. USN / Register Number
                usn = ''
                if std_cfg.get('usn', {}).get('enabled', True):
                    usn = request.POST.get('usn', '').strip().upper()
                    if std_cfg.get('usn', {}).get('required', True) and not usn:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{std_cfg.get('usn', {}).get('label', 'USN / Register Number')} is required."
                        })

                # 2. Phone Number
                phone = ''
                if std_cfg.get('phone', {}).get('enabled', True):
                    phone = request.POST.get('phone', '').strip()
                    if std_cfg.get('phone', {}).get('required', False) and not phone:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{std_cfg.get('phone', {}).get('label', 'Phone Number')} is required."
                        })

                # 3. College Name
                college_name = ''
                if std_cfg.get('college', {}).get('enabled', True):
                    college_id = request.POST.get('college', '').strip()
                    try:
                        college_obj = College.objects.get(id=college_id, is_active=True)
                        college_name = college_obj.name
                    except Exception:
                        college_name = request.POST.get('college_text', '').strip() or college_id
                    if std_cfg.get('college', {}).get('required', True) and not college_name:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{std_cfg.get('college', {}).get('label', 'College Name')} is required."
                        })

                # 4. Course / Department
                course_name = ''
                if std_cfg.get('course', {}).get('enabled', True):
                    course_id = request.POST.get('course', '').strip()
                    try:
                        course_obj = Course.objects.get(id=course_id)
                        course_name = course_obj.name
                    except Exception:
                        course_name = request.POST.get('course_text', '').strip() or course_id
                    if std_cfg.get('course', {}).get('required', True) and not course_name:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{std_cfg.get('course', {}).get('label', 'Course / Department')} is required."
                        })

                # 5. Year of Study
                year_num = None
                if std_cfg.get('year', {}).get('enabled', True):
                    year_val = request.POST.get('year', '').strip()
                    if std_cfg.get('year', {}).get('required', True) and not year_val:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{std_cfg.get('year', {}).get('label', 'Year of Study')} is required."
                        })
                    year_num = int(year_val) if year_val.isdigit() else None

                # 6. Semester
                sem_num = None
                if std_cfg.get('sem', {}).get('enabled', True):
                    sem_val = request.POST.get('sem', '').strip()
                    if std_cfg.get('sem', {}).get('required', True) and not sem_val:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{std_cfg.get('sem', {}).get('label', 'Semester')} is required."
                        })
                    sem_num = int(sem_val) if sem_val.isdigit() else None

                # 7. Additional standard fields (Gender, CGPA, DOB, City)
                for f_key in ('gender', 'cgpa', 'dob', 'city'):
                    f_cfg = std_cfg.get(f_key, {})
                    if f_cfg.get('enabled'):
                        f_val = request.POST.get(f_key, '').strip()
                        f_label = f_cfg.get('label') or f_key.title()
                        if f_cfg.get('required') and not f_val:
                            return render(request, 'pre_assessment/register.html', {
                                'pre_exam': pre_exam,
                                'colleges': colleges,
                                'reg_config': reg_config,
                                'error': f"{f_label} is required."
                            })
                        if f_val:
                            custom_data[f_label] = f_val

                # 8. Dynamic custom fields
                for cf in reg_config.get('custom_fields', []):
                    cid = cf.get('id')
                    clabel = cf.get('label', 'Custom Field')
                    val = request.POST.get(f'custom_{cid}', '').strip()
                    if not val:
                        val = request.POST.get(cid, '').strip()
                    if cf.get('required') and not val:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f"{clabel} is required."
                        })
                    if val:
                        custom_data[clabel] = val
                    
                # Check if already attempted by Email
                existing_email = ExamResult.objects.filter(
                    pre_assessment=pre_exam,
                    candidate_email__iexact=email,
                    submission_status__in=FINAL_SUBMISSION_STATUSES
                ).first()
                
                if existing_email:
                    return render(request, 'pre_assessment/register.html', {
                        'pre_exam': pre_exam,
                        'colleges': colleges,
                        'reg_config': reg_config,
                        'error': f'A candidate with the email "{email}" has already submitted this assessment.'
                    })

                # Check if already attempted by USN (if non-empty USN was provided)
                if usn:
                    existing_usn = ExamResult.objects.filter(
                        pre_assessment=pre_exam,
                        candidate_usn__iexact=usn,
                        submission_status__in=FINAL_SUBMISSION_STATUSES
                    ).first()
                    
                    if existing_usn:
                        return render(request, 'pre_assessment/register.html', {
                            'pre_exam': pre_exam,
                            'colleges': colleges,
                            'reg_config': reg_config,
                            'error': f'A candidate with the USN "{usn}" has already submitted this assessment.'
                        })
                    
                # Detect candidate device metadata
                device_hints_raw = request.POST.get('device_hints')
                device_hints = None
                if device_hints_raw:
                    try:
                        device_hints = json.loads(device_hints_raw)
                    except Exception:
                        device_hints = None
                device_meta = parse_device_info(request, client_hints=device_hints)

                # Save into session
                request.session['pre_assessment_candidate'] = {
                    'name': name,
                    'email': email,
                    'usn': usn,
                    'phone': phone,
                    'college': college_name,
                    'course': course_name,
                    'year': year_num,
                    'sem': sem_num,
                    'custom_data': custom_data,
                    'code': clean_code,
                    'session_token': str(uuid.uuid4()),
                    'device_meta': device_meta,
                }
                return redirect('pre_assessment_exam_page', code=clean_code)
            except Exception as e:
                logger.exception("Error in candidate_register POST")
                return render(request, 'pre_assessment/register.html', {
                    'pre_exam': pre_exam,
                    'colleges': colleges,
                    'reg_config': reg_config,
                    'error': f'An unexpected registration error occurred: {str(e)}'
                })
            
        return render(request, 'pre_assessment/register.html', {
            'pre_exam': pre_exam,
            'colleges': colleges,
            'reg_config': reg_config
        })
    except Exception as e:
        logger.exception("Critical unexpected error in candidate_register GET for code %s", clean_code)
        return render(request, 'pre_assessment/inactive_code.html', {
            'code': clean_code,
            'is_inactive': True,
            'is_not_found': False,
            'title': 'High Server Load / Temporary Issue',
            'message': 'The assessment portal is temporarily experiencing high traffic. Please wait a few moments and refresh this page.'
        }, status=503)


def candidate_exam_page(request, code):
    """
    Renders the standalone exam taking environment.
    Enforces schedule and activation before rendering for any session (Issue 4).
    """
    try:
        clean_code = (code or "").strip().upper()
        pre_exam = PreAssessmentExam.objects.filter(code__iexact=clean_code).first()

        if not pre_exam:
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': None,
                'is_inactive': False,
                'is_not_found': True,
                'title': 'Invalid Assessment Link',
                'message': f'No assessment was found matching access code "{clean_code}".'
            }, status=404)

        # Issue 4: Dynamic status check MUST be performed regardless of whether candidate session exists
        now = timezone.now()
        try:
            check_and_finalize_expired_pre_assessments(pre_exam)
        except Exception:
            logger.exception("Error checking expired pre_assessments in candidate_exam_page")
        current_tz = timezone.get_current_timezone()
        status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)

        if status_key == "upcoming":
            start_str = pre_exam.start_datetime.astimezone(current_tz).strftime("%d-%b-%Y %I:%M %p") if pre_exam.start_datetime else "soon"
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': pre_exam,
                'is_inactive': True,
                'is_not_found': False,
                'title': 'Assessment Has Not Started',
                'message': f'The assessment "{pre_exam.exam.title if pre_exam.exam else clean_code}" is scheduled to automatically activate on {start_str}.'
            }, status=403)

        if status_key == "expired":
            end_str = pre_exam.end_datetime.astimezone(current_tz).strftime("%d-%b-%Y %I:%M %p") if pre_exam.end_datetime else "earlier"
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': pre_exam,
                'is_inactive': True,
                'is_not_found': False,
                'title': 'Assessment Window Closed',
                'message': f'The assessment "{pre_exam.exam.title if pre_exam.exam else clean_code}" automatically closed on {end_str}.'
            }, status=403)

        if status_key == "inactive":
            return render(request, 'pre_assessment/inactive_code.html', {
                'code': clean_code,
                'pre_exam': pre_exam,
                'is_inactive': True,
                'is_not_found': False,
                'title': 'Assessment Currently Inactive',
                'message': f'This assessment is currently inactive or has been closed by the administrator.'
            }, status=403)

        candidate = request.session.get('pre_assessment_candidate')
        # If candidate is already in session:
        if candidate and candidate.get('code') == pre_exam.code:
            # Check if attempt has already been submitted
            existing = _get_candidate_exam_query(candidate, pre_exam).filter(
                submission_status__in=FINAL_SUBMISSION_STATUSES
            ).first()
            if existing:
                return redirect('pre_assessment_thank_you', code=pre_exam.code)
                
            return render(request, 'pre_assessment/take_exam.html', {
                'code': pre_exam.code,
                'candidate': candidate,
                'exam': pre_exam.exam
            })

        return redirect('pre_assessment_register', code=pre_exam.code)
    except Exception as e:
        logger.exception("Error in candidate_exam_page")
        clean_code = (code or "").strip().upper()
        return redirect('pre_assessment_register', code=clean_code)


def candidate_thank_you(request, code):
    """
    Renders the thank you screen.
    """
    clean_code = (code or "").strip().upper()
    pre_exam = PreAssessmentExam.objects.filter(code__iexact=clean_code).first()
    reason = request.GET.get('reason', '')
    tab_exceeded = (reason in {'tab_switch_exceeded', 'tab_switch', 'tab_limit_exceeded'})
    return render(request, 'pre_assessment/thank_you.html', {
        'pre_exam': pre_exam,
        'code': clean_code,
        'reason': reason,
        'tab_exceeded': tab_exceeded
    })


# =====================================================================
# CANDIDATE EXAM APIS
# =====================================================================

@require_GET
def api_get_exam_meta(request, code):
    """
    Returns exam meta-information array containing 1 exam block.
    Enforces schedule & activation restrictions (Issue 4).
    """
    try:
        clean_code = (code or "").strip().upper()
        pre_exam = PreAssessmentExam.objects.filter(code__iexact=clean_code).first()
        if not pre_exam:
            return JsonResponse({"error": "Assessment not found."}, status=404)

        candidate = request.session.get('pre_assessment_candidate')
        if not candidate or candidate.get('code') != pre_exam.code:
            return JsonResponse({"error": "Unauthorized session"}, status=403)

        # Issue 4: Enforce schedule and activation
        now = timezone.now()
        status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)
        if status_key != "active":
            return JsonResponse({"error": f"Assessment is currently {status_display.lower()}."}, status=403)
            
        # Check if already completed using collision-free candidate query
        latest_submission = _get_candidate_exam_query(candidate, pre_exam).order_by("-submitted_at", "-id").first()
        
        already_attempted = (
            latest_submission is not None
            and latest_submission.submission_status in FINAL_SUBMISSION_STATUSES
        )
        
        current_tz = timezone.get_current_timezone()
        start_dt = pre_exam.start_datetime or pre_exam.created_at or timezone.now()
        end_dt = pre_exam.end_datetime or (start_dt + timedelta(days=365))
        tab_limit = int(pre_exam.allowed_tab_switches or 3)
        
        start_local = timezone.make_aware(start_dt, current_tz) if timezone.is_naive(start_dt) else start_dt.astimezone(current_tz)
        end_local = timezone.make_aware(end_dt, current_tz) if timezone.is_naive(end_dt) else end_dt.astimezone(current_tz)
        
        exam_data = [{
            "scheduled_exam_id": str(pre_exam.id),
            "exam_id": str(pre_exam.exam.id) if pre_exam.exam else '',
            "title": pre_exam.exam.title if pre_exam.exam else 'Untitled Exam',
            "duration": pre_exam.exam.duration_minutes if pre_exam.exam else 60,
            "allowed_tab_switches": tab_limit,
            "start": start_local.isoformat(),
            "end": end_local.isoformat(),
            "start_display": start_local.strftime("%d-%m-%Y"),
            "start_time_display": start_local.strftime("%I:%M %p"),
            "end_display": end_local.strftime("%d-%m-%Y"),
            "end_time_display": end_local.strftime("%I:%M %p"),
            "max_marks": pre_exam.exam.max_marks if pre_exam.exam else 0,
            "passing_marks": pre_exam.exam.passing_marks if pre_exam.exam else 0,
            "already_attempted": already_attempted,
        }]
        return JsonResponse({"exams": exam_data})
    except Exception as e:
        logger.exception("Error in api_get_exam_meta")
        return JsonResponse({"error": str(e)}, status=500)


@require_GET
def api_get_exam_questions(request, code):
    """
    Returns question payloads and populates any saved answers (heartbeat recovery).
    Enforces schedule and activation restrictions (Issue 4).
    Locks ONLY the candidate's own attempt row to ensure high scalability (Issue 1).
    Supports clean retake starts without reusing old answers or marks (Issue 5).
    """
    try:
        clean_code = (code or "").strip().upper()
        pre_exam = PreAssessmentExam.objects.filter(code__iexact=clean_code).first()
        if not pre_exam:
            return JsonResponse({"error": "Assessment not found."}, status=404)

        candidate = request.session.get('pre_assessment_candidate')
        if not candidate or candidate.get('code') != pre_exam.code:
            return JsonResponse({"error": "Unauthorized session"}, status=403)

        # Issue 4: Enforce schedule and activation
        now = timezone.now()
        status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)
        if status_key != "active":
            return JsonResponse({"error": f"Assessment is currently {status_display.lower()}."}, status=403)
            
        cand_email = (candidate.get('email') or "").strip().lower()
        cand_usn = (candidate.get('usn') or "").strip()
        device_meta = candidate.get('device_meta') or parse_device_info(request)

        # Issue 1: Lock ONLY the candidate's own ExamResult row, NEVER the shared PreAssessmentExam row!
        with transaction.atomic():
            submission = _get_candidate_exam_query(candidate, pre_exam).select_for_update().order_by('-submitted_at', '-id').first()
            
            if submission and submission.submission_status in FINAL_SUBMISSION_STATUSES:
                return JsonResponse({"error": "Assessment already submitted."}, status=403)

            # Issue 5: Clean retake start - reset status, start timestamp, and answers completely
            if submission and submission.submission_status == "retake_allowed":
                submission.submission_status = "active"
                submission.live_status = "active"
                submission.submitted_at = timezone.now()
                submission.question_wise_breakdown = []
                submission.marks_obtained = 0.0
                submission.total_marks = 0.0
                submission.correct_answers = 0
                submission.wrong_answers = 0
                submission.attempted_questions = 0
                submission.time_taken = None
                submission.save(update_fields=[
                    'submission_status', 'live_status', 'submitted_at',
                    'question_wise_breakdown', 'marks_obtained', 'total_marks',
                    'correct_answers', 'wrong_answers', 'attempted_questions', 'time_taken'
                ])
                
            if not submission:
                try:
                    with transaction.atomic():
                        submission = ExamResult.objects.create(
                            student=None,
                            exam=pre_exam.exam,
                            pre_assessment=pre_exam,
                            candidate_name=candidate['name'],
                            candidate_email=cand_email,
                            candidate_usn=cand_usn,
                            candidate_college=candidate.get('college', ''),
                            candidate_course=candidate.get('course', ''),
                            candidate_year=candidate.get('year'),
                            candidate_sem=candidate.get('sem'),
                            candidate_phone=candidate.get('phone', ''),
                            candidate_custom_data=candidate.get('custom_data', {}),
                            exam_title=pre_exam.exam.title if pre_exam.exam else 'Untitled Exam',
                            total_marks=0,
                            marks_obtained=0,
                            attempted_questions=0,
                            correct_answers=0,
                            wrong_answers=0,
                            question_wise_breakdown=[],
                            submission_status='active',
                            live_status='active',
                            device_type=device_meta.get('device_type', 'Laptop / Desktop'),
                            os_name=device_meta.get('os_name', 'Unknown OS'),
                            browser_name=device_meta.get('browser_name', 'Unknown Browser'),
                            ip_address=device_meta.get('ip_address', ''),
                            user_agent=device_meta.get('user_agent', ''),
                            device_info=device_meta.get('device_info', ''),
                        )
                except IntegrityError:
                    submission = _get_candidate_exam_query(candidate, pre_exam).first()
            else:
                updates = []
                if candidate.get('phone') and not submission.candidate_phone:
                    submission.candidate_phone = candidate.get('phone', '')
                    updates.append('candidate_phone')
                if candidate.get('custom_data') and not submission.candidate_custom_data:
                    submission.candidate_custom_data = candidate.get('custom_data', {})
                    updates.append('candidate_custom_data')
                if updates:
                    submission.save(update_fields=updates)

        saved_answers = {}
        if submission:
            breakdown = submission.question_wise_breakdown
            if isinstance(breakdown, str):
                try:
                    breakdown = json.loads(breakdown)
                except Exception:
                    breakdown = []
            if isinstance(breakdown, list):
                for item in breakdown:
                    if isinstance(item, dict):
                        q_id = item.get("question_id")
                        student_ans = item.get("answer") if "answer" in item else item.get("student_answer")
                        if q_id is not None:
                            saved_answers[str(q_id)] = student_ans

        questions = ExamQuestion.objects.filter(exam=pre_exam.exam) if pre_exam.exam else []
        question_data = []
        
        for q in questions:
            img_url = None
            if q.image:
                try:
                    img_url = q.image.url
                except Exception:
                    img_url = None

            options = q.options or {}
            if isinstance(options, str):
                try:
                    options = json.loads(options)
                except Exception:
                    options = {}

            item = {
                "id": q.id,
                "text": q.question_text,
                "type": q.type,
                "section_tag": getattr(q, "section_tag", None),
                "marks": q.marks,
                "negative": q.negative_mark,
                "image_url": img_url,
            }
            if q.type in ["MCQ", "TF"]:
                item["options"] = options
            if q.type == "Code":
                item["input_example"] = q.input_example or ""
            if q.type == "DESC":
                item["min_characters"] = q.min_characters or 0
                
            question_data.append(item)
            
        return JsonResponse({
            "exam_id": str(pre_exam.exam.id) if pre_exam.exam else '',
            "exam_title": pre_exam.exam.title if pre_exam.exam else 'Untitled Exam',
            "duration_minutes": pre_exam.exam.duration_minutes if pre_exam.exam else 60,
            "allowed_tab_switches": int(pre_exam.allowed_tab_switches or 3),
            "questions": question_data,
            "saved_answers": saved_answers
        })
    except Exception as e:
        logger.exception("Error in api_get_exam_questions")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_POST
def api_live_update(request, code):
    """
    Handles live updates / heartbeat saving for PRE-Assessment candidates.
    Supports sendBeacon() from client unload events.
    1. Locks ONLY the candidate's row, preventing shared row bottlenecks (Issue 1).
    2. Safely merges answers per question, preventing delayed packets from overwriting newer answers (Issue 2).
    3. Strictly enforces schedule: rejects upcoming and expired requests, preventing new attempts on closed exams (Issue 3).
    """
    clean_code = (code or "").strip().upper()
    pre_exam = PreAssessmentExam.objects.filter(code__iexact=clean_code).first()
    if not pre_exam:
        return JsonResponse({"error": "Assessment not found."}, status=404)

    candidate = request.session.get('pre_assessment_candidate')
    if not candidate or candidate.get('code') != pre_exam.code:
        return JsonResponse({"error": "Unauthorized session"}, status=403)

    # Issue 3: Enforce schedule and activation strictly
    now = timezone.now()
    status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)
    if status_key == "inactive":
        return JsonResponse({"error": "This assessment has been deactivated by the administrator."}, status=403)
    if status_key == "upcoming":
        return JsonResponse({"error": "This assessment has not started yet."}, status=403)

    try:
        data = json.loads(request.body or "{}")
        current_question = data.get("current_question", 1)
        tab_switch_count = int(data.get("tab_switch_count") or 0)
        question_time_map = _normalize_question_time_map(data.get("question_time_map") or {})
        requested_status = str(data.get("status", "active") or "active").lower().strip()
        
        status = requested_status if requested_status in LIVE_MONITOR_STATUSES else "active"
        tab_limit = int(pre_exam.allowed_tab_switches or 3)
        if tab_switch_count >= tab_limit and status in {"active", "in_progress", "not_started"}:
            status = "suspicious"
            
        temp_answers = data.get("temp_answers", [])
        client_ts = data.get("client_timestamp") or data.get("timestamp")
        client_seq = data.get("sequence_number") or data.get("seq")
        device_token = data.get("device_token")
        device_hints = data.get("device_hints")
        device_meta = parse_device_info(request, client_hints=device_hints)
        
        # Issue 1: Lock ONLY candidate's individual ExamResult row
        with transaction.atomic():
            result = _get_candidate_exam_query(candidate, pre_exam).select_for_update().order_by("-submitted_at", "-id").first()
            
            # Issue 3: If time expired, auto-finalize active attempt. NEVER create a new attempt if expired!
            if status_key == "expired":
                if result and result.submission_status not in FINAL_SUBMISSION_STATUSES:
                    merged = _merge_autosaved_answers(
                        result.question_wise_breakdown,
                        temp_answers,
                        client_timestamp=client_ts,
                        client_seq=client_seq
                    )
                    evaluate_and_finalize_pre_assessment_result(result, pre_exam.exam, answers_override=merged, submission_mode_val="time_expired")
                    return JsonResponse({
                        "status": "expired",
                        "redirect_url": reverse('pre_assessment_thank_you', kwargs={'code': pre_exam.code}) + '?reason=time_expired'
                    })
                return JsonResponse({"error": "This assessment window has closed."}, status=403)

            # Issue 4: If result is already evaluating or finalized, do NOT disrupt it!
            if result and (result.submission_status in FINAL_SUBMISSION_STATUSES or result.submission_status == "evaluating"):
                return JsonResponse({"status": "success"})
                
            if result is None:
                # Disallow attempt creation if assessment is not strictly active (Issue 3)
                if status_key != "active":
                    return JsonResponse({"error": f"Assessment is {status_display.lower()}."}, status=403)

                try:
                    with transaction.atomic():
                        result = ExamResult.objects.create(
                            student=None,
                            exam=pre_exam.exam,
                            pre_assessment=pre_exam,
                            candidate_name=candidate['name'],
                            candidate_email=(candidate.get('email') or "").strip().lower(),
                            candidate_usn=(candidate.get('usn') or "").strip(),
                            candidate_college=candidate.get('college', ''),
                            candidate_course=candidate.get('course', ''),
                            candidate_year=candidate.get('year'),
                            candidate_sem=candidate.get('sem'),
                            candidate_phone=candidate.get('phone', ''),
                            candidate_custom_data=candidate.get('custom_data', {}),
                            exam_title=pre_exam.exam.title if pre_exam.exam else 'Untitled Exam',
                            total_marks=0,
                            marks_obtained=0,
                            attempted_questions=0,
                            correct_answers=0,
                            wrong_answers=0,
                            question_wise_breakdown=_merge_autosaved_answers(
                                [],
                                temp_answers,
                                client_timestamp=client_ts,
                                client_seq=client_seq
                            ),
                            submission_status=status,
                            live_status=status,
                            current_question=current_question,
                            question_time_map=question_time_map,
                            tab_switch_count=tab_switch_count,
                            last_active_at=timezone.now(),
                            device_session_token=device_token,
                            device_type=device_meta.get('device_type', 'Laptop / Desktop'),
                            os_name=device_meta.get('os_name', 'Unknown OS'),
                            browser_name=device_meta.get('browser_name', 'Unknown Browser'),
                            ip_address=device_meta.get('ip_address', ''),
                            user_agent=device_meta.get('user_agent', ''),
                            device_info=device_meta.get('device_info', ''),
                        )
                except IntegrityError:
                    result = _get_candidate_exam_query(candidate, pre_exam).select_for_update().first()
            else:
                # Issue 2: Merge answers safely per-question instead of replacing whole list
                result.question_wise_breakdown = _merge_autosaved_answers(
                    result.question_wise_breakdown,
                    temp_answers,
                    client_timestamp=client_ts,
                    client_seq=client_seq
                )
                result.submission_status = status
                result.live_status = status
                result.current_question = current_question
                result.question_time_map = question_time_map
                result.tab_switch_count = tab_switch_count
                result.last_active_at = timezone.now()
                if candidate.get('phone') and not result.candidate_phone:
                    result.candidate_phone = candidate.get('phone', '')
                if candidate.get('custom_data') and not result.candidate_custom_data:
                    result.candidate_custom_data = candidate.get('custom_data', {})
                if device_token:
                    result.device_session_token = device_token
                if device_meta.get('device_info'):
                    result.device_info = device_meta['device_info']
                    result.device_type = device_meta['device_type']
                    result.os_name = device_meta['os_name']
                    result.browser_name = device_meta['browser_name']
                    result.ip_address = device_meta['ip_address']
                    result.user_agent = device_meta['user_agent']
                result.save()
            
        return JsonResponse({"status": "success"})
    except Exception as e:
        logger.exception("Error in api_live_update")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@require_POST
def api_submit(request, code):
    """
    Submits candidate answers, evaluates grades, and computes marks.
    1. Locks ONLY the candidate's row, preventing shared row bottlenecks (Issue 1).
    2. Enforces schedule and deadline restrictions (Issue 3).
    3. Atomic Claim Pattern prevents concurrent duplicate evaluations (Issue 4).
    4. Distinguishes evaluated results from autosaved answers (Issue 6).
    """
    clean_code = (code or "").strip().upper()
    pre_exam = PreAssessmentExam.objects.filter(code__iexact=clean_code).first()
    if not pre_exam:
        return JsonResponse({"error": "Assessment not found."}, status=404)

    candidate = request.session.get('pre_assessment_candidate')
    if not candidate or candidate.get('code') != pre_exam.code:
        return JsonResponse({"error": "Unauthorized session"}, status=403)

    # Issue 3: Enforce schedule & activation on submit
    now = timezone.now()
    status_key, status_display = get_pre_assessment_dynamic_status(pre_exam, now)
    if status_key == "inactive":
        return JsonResponse({"error": "This assessment has been deactivated by the administrator."}, status=403)
    if status_key == "upcoming":
        return JsonResponse({"error": "This assessment has not started yet."}, status=403)

    submission_mode_val = "time_expired" if status_key == "expired" else "submitted"

    try:
        data = json.loads(request.body or "{}")
        device_token = data.get("device_token")
        device_hints = data.get("device_hints")
        device_meta = parse_device_info(request, client_hints=device_hints)
        answers = data.get("answers", [])

        # Issue 1 & 4: Lock ONLY candidate's individual attempt row and claim evaluation atomically
        with transaction.atomic():
            result = _get_candidate_exam_query(candidate, pre_exam).select_for_update().order_by("-submitted_at", "-id").first()

            # Issue 6: Check if already genuinely evaluated (not just having autosaved answers)
            if _is_result_evaluated(result):
                return JsonResponse({
                    "status": "success", 
                    "result_id": result.id,
                    "redirect_url": reverse('pre_assessment_thank_you', kwargs={'code': pre_exam.code})
                })

            # Issue 4: Prevent concurrent double-evaluation if already being evaluated by another request
            if result and result.submission_status == "evaluating":
                eval_time = getattr(result, "last_active_at", None)
                if eval_time and (now - eval_time).total_seconds() < 60:
                    return JsonResponse({
                        "status": "evaluating",
                        "message": "Submission is being evaluated. Please wait...",
                        "redirect_url": reverse('pre_assessment_thank_you', kwargs={'code': pre_exam.code})
                    })

            # Time calculations
            total_seconds = 0
            post_qmap = data.get("question_time_map") or {}
            if isinstance(post_qmap, str):
                try:
                    post_qmap = json.loads(post_qmap)
                except Exception:
                    post_qmap = {}
            if isinstance(post_qmap, dict) and post_qmap:
                for k, v in post_qmap.items():
                    try:
                        total_seconds += int(float(v or 0))
                    except (ValueError, TypeError):
                        pass

            if total_seconds <= 0 and result and isinstance(getattr(result, "question_time_map", None), dict):
                for k, v in result.question_time_map.items():
                    try:
                        total_seconds += int(float(v or 0))
                    except (ValueError, TypeError):
                        pass

            now_dt = timezone.now()
            if total_seconds > 0:
                time_taken = timedelta(seconds=total_seconds)
            elif result and result.submitted_at:
                time_taken = now_dt - result.submitted_at
            else:
                time_taken = timedelta(seconds=0)

            # Issue 3 & 4: Claim evaluation atomically
            if result is None:
                if status_key != "active":
                    return JsonResponse({"error": f"Assessment is {status_display.lower()}."}, status=403)
                try:
                    with transaction.atomic():
                        result = ExamResult.objects.create(
                            student=None,
                            exam=pre_exam.exam,
                            pre_assessment=pre_exam,
                            candidate_name=candidate['name'],
                            candidate_email=(candidate.get('email') or "").strip().lower(),
                            candidate_usn=(candidate.get('usn') or "").strip(),
                            candidate_college=candidate.get('college', ''),
                            candidate_course=candidate.get('course', ''),
                            candidate_year=candidate.get('year'),
                            candidate_sem=candidate.get('sem'),
                            candidate_phone=candidate.get('phone', ''),
                            candidate_custom_data=candidate.get('custom_data', {}),
                            exam_title=pre_exam.exam.title if pre_exam.exam else 'Untitled Exam',
                            total_marks=0,
                            marks_obtained=0,
                            attempted_questions=0,
                            correct_answers=0,
                            wrong_answers=0,
                            question_wise_breakdown=[],
                            submission_status="evaluating",  # Claimed for evaluation (Issue 4)
                            live_status="submitting",
                            last_active_at=now_dt,
                            time_taken=time_taken,
                            device_session_token=device_token,
                            device_type=device_meta.get('device_type', 'Laptop / Desktop'),
                            os_name=device_meta.get('os_name', 'Unknown OS'),
                            browser_name=device_meta.get('browser_name', 'Unknown Browser'),
                            ip_address=device_meta.get('ip_address', ''),
                            user_agent=device_meta.get('user_agent', ''),
                            device_info=device_meta.get('device_info', ''),
                        )
                except IntegrityError:
                    result = _get_candidate_exam_query(candidate, pre_exam).select_for_update().first()
            else:
                result.time_taken = time_taken
                result.submission_status = "evaluating"  # Claimed for evaluation (Issue 4)
                result.live_status = "submitting"
                result.last_active_at = now_dt
                if candidate.get('phone') and not result.candidate_phone:
                    result.candidate_phone = candidate.get('phone', '')
                if candidate.get('custom_data') and not result.candidate_custom_data:
                    result.candidate_custom_data = candidate.get('custom_data', {})
                if device_token:
                    result.device_session_token = device_token
                if device_meta.get('device_info'):
                    result.device_info = device_meta['device_info']
                    result.device_type = device_meta['device_type']
                    result.os_name = device_meta['os_name']
                    result.browser_name = device_meta['browser_name']
                    result.ip_address = device_meta['ip_address']
                    result.user_agent = device_meta['user_agent']
                result.save()

        reason_param = data.get("reason", "")
        tab_cnt = int(data.get("tab_switch_count") or (result.tab_switch_count if result else 0) or 0)
        tab_limit = int(pre_exam.allowed_tab_switches or 3)
        is_tab_exceeded = (reason_param == "tab_switch_exceeded" or tab_cnt >= tab_limit)

        if is_tab_exceeded:
            submission_mode_val = "accidental_submit"
        elif reason_param == "time_expired" or status_key == "expired":
            submission_mode_val = "time_expired"
        else:
            submission_mode_val = "submitted"

        # Run evaluation and finalize attempt (Issue 1, 3, 5)
        try:
            evaluate_and_finalize_pre_assessment_result(
                result, 
                exam_obj=pre_exam.exam, 
                answers_override=answers, 
                submission_mode_val=submission_mode_val
            )
        except Exception as eval_err:
            # Revert to active on failure so client can retry
            logger.exception("Evaluation failed in api_submit")
            result.submission_status = "active"
            result.live_status = "active"
            result.save(update_fields=['submission_status', 'live_status'])
            raise eval_err

        # Clean the candidate session safely
        request.session.pop('pre_assessment_candidate', None)

        redirect_target = reverse('pre_assessment_thank_you', kwargs={'code': pre_exam.code})
        if is_tab_exceeded:
            redirect_target += '?reason=tab_switch_exceeded'
        elif submission_mode_val == "time_expired":
            redirect_target += '?reason=time_expired'

        return JsonResponse({
            "status": "success", 
            "result_id": result.id if result else None,
            "redirect_url": redirect_target
        })
    except Exception as e:
        logger.exception("Error in api_submit")
        return JsonResponse({"error": str(e)}, status=500)
