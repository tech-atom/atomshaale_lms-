from django.utils import timezone
import json
import uuid

def is_valid_uuid(val):
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False

from django.contrib.auth import models
from django.db import models as db_models
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db.models import Prefetch
from django.views.decorators.http import require_POST
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import FileResponse, Http404, JsonResponse, HttpResponse
from .models import TpoProfile
from django.db.models import Q
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import FileResponse, Http404
from student.models import StudentProfile
from college.models import Course
from exam.models import ExamResult
from practicetest.models import PracticeResult
from trainer.models import AttendanceRecord
from student.models import StudentFeedback, SessionTrainerFeedback
from trainer.models import TrainerSessionReport
from django.db.models import Count, Avg, Q, F
import io
import os
import pandas as pd
from .models import TpoProfile
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False
from django.db.models import Count, Q
from django.utils.safestring import mark_safe
import json
from django.db.models.functions import Concat
from django.db.models import F, Value
from django.db.models.functions import Coalesce
from django.db.models.functions import TruncMonth


# TPO role check
def is_tpo(user):
    return user.is_authenticated and user.role == "tpo"


#tpo base
@login_required
@user_passes_test(is_tpo)
def tpo_base(request):
    return render(request, "top_base.html")

# 🎯 TPO Dashboard View
@login_required
@user_passes_test(is_tpo)
def tpo_dashboard(request):
    return render(request, "tpo_dashboard.html")

# 📋 Trainer Daily Report View
@login_required
@user_passes_test(is_tpo)
def trainer_daily_report(request):
    return render(request, "trainer_daily_report_tpo.html")

# 💬 Feedback View
@login_required
@user_passes_test(is_tpo)
def tpo_feedback(request):
    return render(request, "feedback.html")

# 🧾 Student Attendance View
@login_required
@user_passes_test(is_tpo)
def tpo_student_attendance(request):
    return render(request, "student_attendance.html")

# CHART Student Performance View
# (Defined below with full analytics implementation)

# 📁 Student Resume View
# (Defined below with dynamic filters implementation)



#---tpo_dashboard view---#


@login_required
@user_passes_test(is_tpo)
def tpo_dashboard(request):
    """Render the TPO Dashboard — all data scoped to registered college."""
    from trainer.models import TrainerProfile
    from admin_panel.models import SessionSchedule
    import datetime

    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    today = datetime.date.today()

    # Active trainers for this college (trainers who have sessions scheduled)
    active_trainer_ids = (
        SessionSchedule.objects.filter(college=college)
        .values_list("trainer", flat=True).distinct()
    )
    total_trainers = active_trainer_ids.count()

    # Total students
    total_students = StudentProfile.objects.filter(college=college, is_current=True).count()

    # Total courses
    courses = Course.objects.filter(studentprofile__college=college).distinct()
    total_courses = courses.count()

    # Sessions today
    sessions_today = SessionSchedule.objects.filter(college=college, date=today).count()

    # Recent feedbacks (last 7 days)
    recent_fb_count = StudentFeedback.objects.filter(
        student__college=college,
        date__gte=today - datetime.timedelta(days=7)
    ).count()

    context = {
        "college": college,
        "total_students": total_students,
        "total_trainers": total_trainers,
        "total_courses": total_courses,
        "sessions_today": sessions_today,
        "recent_fb_count": recent_fb_count,
        "tpo_name": request.user.get_full_name() or request.user.username,
    }
    return render(request, "tpo_dashboard.html", context)



# --- AJAX endpoint for dashboard statistics ---
@login_required
@user_passes_test(is_tpo)
def get_tpo_dashboard_data(request):
    """Return JSON statistics and chart data for TPO Dashboard."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    # --- Students ---
    students = StudentProfile.objects.filter(college=college, is_current=True)
    total_students = students.count()

    # --- Attendance Aggregation ---
    attendance_data = (
        AttendanceRecord.objects.filter(student__college=college)
        .values("student")
        .annotate(
            total_sessions=Count("session", distinct=True),
            present_count=Count("session", filter=Q(status="Present")),
        )
    )
    total_present = sum(a["present_count"] for a in attendance_data)
    total_sessions = sum(a["total_sessions"] for a in attendance_data)
    avg_attendance = round((total_present / total_sessions * 100), 2) if total_sessions else 0

    # --- Performance Data ---
    exam_results = ExamResult.objects.filter(student__college=college)
    practice_results = PracticeResult.objects.filter(student__college=college)

    def calc_avg(qs):
        valid = [r.marks_obtained / r.total_marks * 100 for r in qs if r.total_marks > 0]
        return round(sum(valid) / len(valid), 2) if valid else 0

    avg_exam = calc_avg(exam_results)
    avg_practice = calc_avg(practice_results)
    avg_performance = round((avg_exam + avg_practice) / 2, 2)

    # --- Attendance Trend (last 6 months) ---
    attendance_trend = (
        AttendanceRecord.objects.filter(student__college=college)
        .annotate(month=TruncMonth("session__date"))
        .values("month")
        .annotate(
            total=Count("id"),
            present=Count("id", filter=Q(status="Present")),
        )
        .order_by("month")
    )
    trend_data = [
        {
            "month": a["month"].strftime("%b %Y"),
            "attendance": round(a["present"] / a["total"] * 100, 2) if a["total"] else 0,
        }
        for a in attendance_trend
    ]

    # --- Feedback Summary (Average per field) ---
    feedbacks = StudentFeedback.objects.filter(student__college=college)
    feedback_summary = {
        "content_rating": round(feedbacks.aggregate(Avg("content_rating"))["content_rating__avg"] or 0, 2),
        "objectives_clarity": round(feedbacks.aggregate(Avg("objectives_clarity"))["objectives_clarity__avg"] or 0, 2),
        "structure_logic": round(feedbacks.aggregate(Avg("structure_logic"))["structure_logic__avg"] or 0, 2),
        "satisfaction": round(feedbacks.aggregate(Avg("satisfaction"))["satisfaction__avg"] or 0, 2),
    }

    # --- NEW: Course-wise Performance Data ---
    course_data = []
    courses = Course.objects.filter(studentprofile__college=college).distinct()
    for course in courses:
        course_students = StudentProfile.objects.filter(course=course, college=college, is_current=True)
        exam_qs = ExamResult.objects.filter(student__in=course_students)
        practice_qs = PracticeResult.objects.filter(student__in=course_students)

        avg_exam_course = calc_avg(exam_qs)
        avg_practice_course = calc_avg(practice_qs)
        avg_overall_course = round((avg_exam_course + avg_practice_course) / 2, 2)

        course_data.append({
            "course": course.name,
            "exam_avg": avg_exam_course,
            "practice_avg": avg_practice_course,
            "overall_avg": avg_overall_course,
        })

    # --- Performance Tiers Distribution & Readiness Score ---
    excellent_cnt, good_cnt, avg_cnt, poor_cnt = 0, 0, 0, 0
    students_list = []
    for student in StudentProfile.objects.filter(college=college, is_current=True).select_related('user', 'course'):
        exam_qs = ExamResult.objects.filter(student=student, total_marks__gt=0)
        practice_qs = PracticeResult.objects.filter(student=student, total_marks__gt=0)

        def avg_percent(qs):
            vals = [(r.marks_obtained / r.total_marks * 100) for r in qs if r.total_marks > 0]
            return round(sum(vals) / len(vals), 2) if vals else 0

        avg_exam_stud = avg_percent(exam_qs)
        avg_practice_stud = avg_percent(practice_qs)
        overall = round((avg_exam_stud + avg_practice_stud) / 2, 2)

        if overall >= 85:
            excellent_cnt += 1
        elif overall >= 70:
            good_cnt += 1
        elif overall >= 50:
            avg_cnt += 1
        else:
            poor_cnt += 1

        students_list.append({
            'name': (student.user.get_full_name() if student.user else "") or student.usn or f"Student-{student.id}",
            'usn': student.usn or "—",
            'course': student.course.name if student.course else "—",
            'avg_exam': avg_exam_stud,
            'avg_practice': avg_practice_stud,
            'overall': overall,
        })

    top_students = sorted(students_list, key=lambda x: x['overall'], reverse=True)[:10]

    placement_readiness_score = round(avg_attendance * 0.3 + avg_exam * 0.4 + avg_practice * 0.3, 1)

    # --- Response Base ---
    data = {
        "college": college.name,
        "total_students": total_students,
        "total_courses": courses.count(),
        "avg_attendance": avg_attendance,
        "avg_performance": avg_performance,
        "avg_exam": avg_exam,
        "avg_practice": avg_practice,
        "placement_readiness": placement_readiness_score,
        "performance_tiers": {
            "excellent": excellent_cnt,
            "good": good_cnt,
            "average": avg_cnt,
            "poor": poor_cnt
        },
        "radar_metrics": [
            avg_exam,
            avg_practice,
            avg_attendance,
            round(feedbacks.aggregate(Avg("satisfaction"))["satisfaction__avg"] or 0, 2) * 20,
            avg_performance
        ],
        "attendance_trend": trend_data,
        "feedback_summary": feedback_summary,
        "course_performance": course_data,
        "top_students": top_students,
    }

    # --- NEW: Top Courses (based on overall avg) ---
    try:
        top_courses = sorted(course_data, key=lambda x: x['overall_avg'], reverse=True)[:8]
    except Exception:
        top_courses = course_data[:8]
    data['top_courses'] = top_courses

    # --- NEW: Class-wise Feedback (Year-Semester Satisfaction) ---
    try:
        cf = (
            StudentFeedback.objects.filter(student__college=college)
            .values('student__year', 'student__semester')
            .annotate(
                avg_satisfaction=Avg('satisfaction'),
                avg_content=Avg('content_rating')
            )
            .order_by('student__year', 'student__semester')
        )
        class_feedback = [
            {
                'label': f"Y{c['student__year']}S{c['student__semester']}",
                'avg_satisfaction': round(c['avg_satisfaction'] or 0, 2),
                'avg_content': round(c['avg_content'] or 0, 2),
            }
            for c in cf
        ]
    except Exception:
        class_feedback = []

    data['class_feedback'] = class_feedback

    # --- NEW: Feedback Heatmap (Course vs Feedback Fields) ---
    try:
        heat = (
            StudentFeedback.objects.filter(student__college=college)
            .values('student__course')
            .annotate(
                course_name=F('student__course__name'),
                content=Avg('content_rating'),
                clarity=Avg('objectives_clarity'),
                logic=Avg('structure_logic'),
                satisfaction=Avg('satisfaction'),
            )
            .order_by('student__course')
        )
        feedback_heatmap = [
            {
                'course': h['course_name'] if h.get('course_name') else 'Unknown',
                'content': round(h['content'] or 0, 2),
                'clarity': round(h['clarity'] or 0, 2),
                'logic': round(h['logic'] or 0, 2),
                'satisfaction': round(h['satisfaction'] or 0, 2),
            }
            for h in heat
        ]
    except Exception:
        feedback_heatmap = []

    data['feedback_heatmap'] = feedback_heatmap

    # --- Return JSON Response ---
    return JsonResponse(data)


@login_required
@user_passes_test(is_tpo)
def tpo_resume(request):
    """Show resumes of students from the TPO's college with dynamic filters."""

    # OK Get TPO and their college
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    # OK Fetch all current students from this college
    students = (
        StudentProfile.objects.filter(college=college, is_current=True)
        .select_related("user", "course")
        .order_by("course__name", "year", "semester", "user__first_name")
    )

    # OK Get filter parameters
    selected_course = request.GET.get("course")
    selected_year = request.GET.get("year")
    selected_semester = request.GET.get("semester")

    # OK Build query filters dynamically (no if chains)
    filters = Q()
    filters &= Q(course_id=selected_course) if selected_course else Q()
    filters &= Q(year=selected_year) if selected_year else Q()
    filters &= Q(semester=selected_semester) if selected_semester else Q()

    # OK Apply filters
    students = students.filter(filters)

    # OK Fetch dropdown options dynamically (college specific)
    courses = (
        Course.objects.filter(studentprofile__college=college)
        .distinct()
        .order_by("name")
    )
    years = (
        StudentProfile.objects.filter(college=college)
        .values_list("year", flat=True)
        .distinct()
        .order_by("year")
    )
    semesters = (
        StudentProfile.objects.filter(college=college)
        .values_list("semester", flat=True)
        .distinct()
        .order_by("semester")
    )

    total_cnt = students.count()
    uploaded_cnt = sum(1 for s in students if bool(s.resume))
    pending_cnt = total_cnt - uploaded_cnt
    upload_rate_pct = round((uploaded_cnt / total_cnt * 100), 2) if total_cnt > 0 else 0.0

    context = {
        "students": students,
        "courses": courses,
        "years": years,
        "semesters": semesters,
        "selected_course": selected_course,
        "selected_year": selected_year,
        "selected_semester": selected_semester,
        "tpo_profile": tpo_profile,
        "total_students": total_cnt,
        "uploaded_count": uploaded_cnt,
        "pending_count": pending_cnt,
        "upload_rate": f"{upload_rate_pct:.1f}%",
    }

    return render(request, "tpo_resume.html", context)

@login_required
@user_passes_test(is_tpo)
def download_resume(request, student_id):
    """Allow TPO to download only their college student’s resume."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    student = get_object_or_404(StudentProfile, id=student_id, college=tpo_profile.college)

    if not student.resume:
        return JsonResponse({"error": "No resume uploaded for this student"}, status=404)
    
    # Check if file actually exists on disk
    try:
        resume_path = student.resume.path
        if not os.path.exists(resume_path):
            return JsonResponse({"error": "Resume file not found on server. Please ask the student to re-upload."}, status=404)
    except Exception as e:
        return JsonResponse({"error": f"Error accessing resume: {str(e)}"}, status=500)

    return FileResponse(student.resume.open("rb"), as_attachment=True, filename=student.resume.name.split("/")[-1])


@login_required
@user_passes_test(is_tpo)
def bulk_download_resumes_zip(request):
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    student_ids = request.GET.get("student_ids", "")
    if not student_ids:
        return HttpResponse("No students selected", status=400)

    ids_list = [sid.strip() for sid in student_ids.split(",") if sid.strip()]
    students = StudentProfile.objects.filter(id__in=ids_list, college=tpo_profile.college, resume__isnull=False)

    if not students.exists():
        return HttpResponse("No resumes found for selected students", status=404)

    import zipfile
    from io import BytesIO

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for student in students:
            try:
                with student.resume.open("rb") as f:
                    file_name = f"{student.usn or student.id}_resume.pdf"
                    zip_file.writestr(file_name, f.read())
            except Exception:
                pass

    zip_buffer.seek(0)
    response = HttpResponse(zip_buffer.getvalue(), content_type="application/x-zip-compressed")
    response["Content-Disposition"] = "attachment; filename=student_resumes.zip"
    return response


#---tpo_student_performance view with chart data---#

# OK MAIN VIEW — TPO Performance Dashboard
@login_required
@user_passes_test(is_tpo)
def tpo_student_performance(request):
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    from datetime import timedelta
    selected_course = request.GET.get("course")
    selected_year = request.GET.get("year")
    selected_semester = request.GET.get("semester")
    selected_exam = request.GET.get("exam")
    selected_practice = request.GET.get("practice")
    date_filter = request.GET.get("date_filter", "all")

    students_qs = StudentProfile.objects.filter(college=college, is_current=True).select_related("user", "course").order_by("course__name", "year", "semester", "user__first_name")

    if selected_course:
        students_qs = students_qs.filter(course__id=selected_course)
    if selected_year:
        students_qs = students_qs.filter(year=selected_year)
    if selected_semester:
        students_qs = students_qs.filter(semester=selected_semester)

    # Date range filters for results
    now = timezone.now()
    today_date = now.date()
    yesterday_date = today_date - timedelta(days=1)

    data = []
    exam_avgs_all = []
    practice_avgs_all = []
    overall_avgs_all = []

    for student in students_qs:
        exam_results = ExamResult.objects.filter(student=student)
        practice_results = PracticeResult.objects.filter(student=student)

        # Apply Exam filter safely
        if selected_exam:
            if is_valid_uuid(selected_exam):
                exam_results = exam_results.filter(Q(exam_id=selected_exam) | Q(exam_title=selected_exam))
            else:
                exam_results = exam_results.filter(exam_title=selected_exam)

        # Apply Practice filter safely
        if selected_practice:
            if is_valid_uuid(selected_practice):
                practice_results = practice_results.filter(Q(practice_test_id=selected_practice) | Q(practice_title=selected_practice))
            else:
                practice_results = practice_results.filter(practice_title=selected_practice)

        # Apply Date filter
        if date_filter == "today":
            exam_results = exam_results.filter(submitted_at__date=today_date)
            practice_results = practice_results.filter(submitted_at__date=today_date)
        elif date_filter == "yesterday":
            exam_results = exam_results.filter(submitted_at__date=yesterday_date)
            practice_results = practice_results.filter(submitted_at__date=yesterday_date)
        elif date_filter == "this_week":
            start_week = today_date - timedelta(days=7)
            exam_results = exam_results.filter(submitted_at__date__gte=start_week)
            practice_results = practice_results.filter(submitted_at__date__gte=start_week)
        elif date_filter == "this_month":
            start_month = today_date - timedelta(days=30)
            exam_results = exam_results.filter(submitted_at__date__gte=start_month)
            practice_results = practice_results.filter(submitted_at__date__gte=start_month)

        exam_avg = (
            sum(r.marks_obtained / r.total_marks * 100 for r in exam_results if r.total_marks > 0) / exam_results.count()
            if exam_results.exists() else None
        )
        practice_avg = (
            sum(r.marks_obtained / r.total_marks * 100 for r in practice_results if r.total_marks > 0) / practice_results.count()
            if practice_results.exists() else None
        )

        latest_exam_rec = exam_results.order_by("-submitted_at").first()
        latest_practice_rec = practice_results.order_by("-submitted_at").first()

        valid_scores = [s for s in [exam_avg, practice_avg] if s is not None]
        overall_avg = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else None

        if exam_avg is not None:
            exam_avgs_all.append(exam_avg)
        if practice_avg is not None:
            practice_avgs_all.append(practice_avg)
        if overall_avg is not None:
            overall_avgs_all.append(overall_avg)

        # Performance Tier Level
        if overall_avg is not None:
            if overall_avg >= 85:
                status_text, status_class = "Excellent", "excellent"
            elif overall_avg >= 70:
                status_text, status_class = "Good", "good"
            elif overall_avg >= 50:
                status_text, status_class = "Average", "average"
            else:
                status_text, status_class = "Needs Focus", "poor"
        else:
            status_text, status_class = "No Tests", "pending"

        st_name = (student.user.get_full_name() if student.user else "") or (student.user.username if student.user else "") or f"Student-{student.id}"

        data.append({
            "student_id": str(student.id),
            "student": student,
            "name": st_name,
            "usn": student.usn or "—",
            "course_name": student.course.name if student.course else "—",
            "year": student.year or "—",
            "semester": student.semester or "—",
            "exam_avg": round(exam_avg, 2) if exam_avg is not None else None,
            "practice_avg": round(practice_avg, 2) if practice_avg is not None else None,
            "overall_avg": overall_avg,
            "status_text": status_text,
            "status_class": status_class,
            "latest_exam_title": latest_exam_rec.exam_title if latest_exam_rec else "None Taken",
            "latest_exam_score": f"{latest_exam_rec.marks_obtained}/{latest_exam_rec.total_marks} ({round(latest_exam_rec.marks_obtained/latest_exam_rec.total_marks*100, 1)}%)" if (latest_exam_rec and latest_exam_rec.total_marks > 0) else "—",
            "latest_exam_date": latest_exam_rec.submitted_at.strftime("%d %b %Y, %I:%M %p") if latest_exam_rec else "—",
            "latest_practice_title": latest_practice_rec.practice_title if latest_practice_rec else "None Taken",
            "latest_practice_score": f"{latest_practice_rec.marks_obtained}/{latest_practice_rec.total_marks} ({round(latest_practice_rec.marks_obtained/latest_practice_rec.total_marks*100, 1)}%)" if (latest_practice_rec and latest_practice_rec.total_marks > 0) else "—",
            "latest_practice_date": latest_practice_rec.submitted_at.strftime("%d %b %Y, %I:%M %p") if latest_practice_rec else "—",
        })

    # Summary Metrics
    total_students_cnt = len(data)
    overall_exam_avg_val = round(sum(exam_avgs_all) / len(exam_avgs_all), 1) if exam_avgs_all else 0.0
    overall_practice_avg_val = round(sum(practice_avgs_all) / len(practice_avgs_all), 1) if practice_avgs_all else 0.0

    # Top Performer
    students_with_scores = [d for d in data if d["overall_avg"] is not None]
    top_performer = max(students_with_scores, key=lambda x: x["overall_avg"]) if students_with_scores else None

    # Chart Data for Top 15 Students
    top_chart_students = data[:15]
    chart_data = {
        "labels": [s["name"].split()[0] if s["name"] else "Student" for s in top_chart_students],
        "exam_avg": [s["exam_avg"] or 0 for s in top_chart_students],
        "practice_avg": [s["practice_avg"] or 0 for s in top_chart_students],
        "overall_avg": [s["overall_avg"] or 0 for s in top_chart_students],
    }
    chart_data_json = json.dumps(chart_data)

    # -------------------------------------------------------------
    # DYNAMICAL DATABASE CALCULATIONS FOR NEW DASHBOARD GRID
    # -------------------------------------------------------------
    from exam.models import ExamQuestion
    from practicetest.models import PracticeQuestion

    all_overall_scores = [s["overall_avg"] for s in data if s["overall_avg"] is not None]
    cohort_avg_score = round(sum(all_overall_scores) / len(all_overall_scores), 1) if all_overall_scores else 0.0

    excellent_count = sum(1 for s in data if s["overall_avg"] is not None and s["overall_avg"] >= 90)
    good_count = sum(1 for s in data if s["overall_avg"] is not None and s["overall_avg"] >= 75 and s["overall_avg"] < 90)
    average_count = sum(1 for s in data if s["overall_avg"] is not None and s["overall_avg"] >= 50 and s["overall_avg"] < 75)
    poor_count = sum(1 for s in data if s["overall_avg"] is not None and s["overall_avg"] >= 25 and s["overall_avg"] < 50)
    very_poor_count = sum(1 for s in data if s["overall_avg"] is not None and s["overall_avg"] < 25)

    total_scored = len(all_overall_scores)
    excellent_pct = round(excellent_count / total_scored * 100, 1) if total_scored else 0.0
    good_pct = round(good_count / total_scored * 100, 1) if total_scored else 0.0
    average_pct = round(average_count / total_scored * 100, 1) if total_scored else 0.0
    poor_pct = round(poor_count / total_scored * 100, 1) if total_scored else 0.0
    very_poor_pct = round(very_poor_count / total_scored * 100, 1) if total_scored else 0.0

    # Scoped exam/practice results
    exam_results_all = ExamResult.objects.filter(student__in=students_qs)
    practice_results_all = PracticeResult.objects.filter(student__in=students_qs)

    if selected_exam:
        if is_valid_uuid(selected_exam):
            exam_results_all = exam_results_all.filter(Q(exam_id=selected_exam) | Q(exam_title=selected_exam))
        else:
            exam_results_all = exam_results_all.filter(exam_title=selected_exam)

    if selected_practice:
        if is_valid_uuid(selected_practice):
            practice_results_all = practice_results_all.filter(Q(practice_test_id=selected_practice) | Q(practice_title=selected_practice))
        else:
            practice_results_all = practice_results_all.filter(practice_title=selected_practice)

    if date_filter == "today":
        exam_results_all = exam_results_all.filter(submitted_at__date=today_date)
        practice_results_all = practice_results_all.filter(submitted_at__date=today_date)
    elif date_filter == "yesterday":
        exam_results_all = exam_results_all.filter(submitted_at__date=yesterday_date)
        practice_results_all = practice_results_all.filter(submitted_at__date=yesterday_date)
    elif date_filter == "this_week":
        start_week = today_date - timedelta(days=7)
        exam_results_all = exam_results_all.filter(submitted_at__date__gte=start_week)
        practice_results_all = practice_results_all.filter(submitted_at__date__gte=start_week)
    elif date_filter == "this_month":
        start_month = today_date - timedelta(days=30)
        exam_results_all = exam_results_all.filter(submitted_at__date__gte=start_month)
        practice_results_all = practice_results_all.filter(submitted_at__date__gte=start_month)

    exam_ids = list(exam_results_all.values_list("exam_id", flat=True).distinct())
    practice_ids = list(practice_results_all.values_list("practice_test_id", flat=True).distinct())

    exam_questions_map = {}
    if exam_ids:
        exam_questions_map = {
            item['exam_id']: item['count']
            for item in ExamQuestion.objects.filter(exam_id__in=exam_ids).values('exam_id').annotate(count=Count('id'))
        }
    practice_questions_map = {}
    if practice_ids:
        practice_questions_map = {
            item['practice_test_id']: item['count']
            for item in PracticeQuestion.objects.filter(practice_test_id__in=practice_ids).values('practice_test_id').annotate(count=Count('id'))
        }

    total_questions_list = []
    total_marks_list = []
    duration_list = []

    for eid in exam_ids:
        if not eid:
            continue
        q_count = exam_questions_map.get(eid, 0)
        total_questions_list.append(q_count)
        ex = exam_results_all.filter(exam_id=eid).select_related("exam").first()
        if ex and ex.exam:
            total_marks_list.append(ex.exam.max_marks)
            duration_list.append(ex.exam.duration_minutes)

    for pid in practice_ids:
        if not pid:
            continue
        q_count = practice_questions_map.get(pid, 0)
        total_questions_list.append(q_count)
        pr = practice_results_all.filter(practice_test_id=pid).select_related("practice_test").first()
        if pr and pr.practice_test:
            total_marks_list.append(pr.practice_test.max_marks)
            duration_list.append(pr.practice_test.duration_minutes)

    summary_total_questions = round(sum(total_questions_list) / len(total_questions_list), 1) if total_questions_list else 0
    if isinstance(summary_total_questions, float) and summary_total_questions.is_integer():
        summary_total_questions = int(summary_total_questions)

    summary_total_marks = round(sum(total_marks_list) / len(total_marks_list), 1) if total_marks_list else 0
    if isinstance(summary_total_marks, float) and summary_total_marks.is_integer():
        summary_total_marks = int(summary_total_marks)

    summary_duration = round(sum(duration_list) / len(duration_list), 1) if duration_list else 0
    if isinstance(summary_duration, float) and summary_duration.is_integer():
        summary_duration = int(summary_duration)

    has_negative_marking = False
    if exam_ids:
        if ExamQuestion.objects.filter(exam_id__in=exam_ids, negative_mark__gt=0).exists():
            has_negative_marking = True
    if not has_negative_marking and practice_ids:
        if PracticeQuestion.objects.filter(practice_test_id__in=practice_ids, negative_mark__gt=0).exists():
            has_negative_marking = True

    attempted_counts = []
    unattempted_counts = []
    for r in exam_results_all:
        att = r.attempted_questions or 0
        attempted_counts.append(att)
        q_count = exam_questions_map.get(r.exam_id, 0)
        unattempted_counts.append(max(0, q_count - att))

    for r in practice_results_all:
        att = r.attempted_questions or 0
        attempted_counts.append(att)
        q_count = practice_questions_map.get(r.practice_test_id, 0)
        unattempted_counts.append(max(0, q_count - att))

    summary_attempted = round(sum(attempted_counts) / len(attempted_counts), 1) if attempted_counts else 0.0
    summary_unattempted = round(sum(unattempted_counts) / len(unattempted_counts), 1) if unattempted_counts else 0.0

    durations = []
    for r in exam_results_all:
        if r.time_taken:
            durations.append(r.time_taken.total_seconds())
    for r in practice_results_all:
        if r.time_taken:
            durations.append(r.time_taken.total_seconds())

    avg_duration_sec = sum(durations) / len(durations) if durations else 0
    avg_minutes = int(avg_duration_sec // 60)
    avg_seconds = int(avg_duration_sec % 60)
    avg_time_taken_formatted = f"{avg_minutes}:{avg_seconds:02d}" if durations else "00:00"

    students_need_improvement = sum(1 for s in data if s["overall_avg"] is not None and s["overall_avg"] < 50)
    improvement_pct = round(students_need_improvement / total_scored * 100, 1) if total_scored else 0.0

    top_performers = sorted(students_with_scores, key=lambda x: x["overall_avg"], reverse=True)[:3]
    needs_improvement_students = sorted(students_with_scores, key=lambda x: x["overall_avg"])[:3]

    # Strictly College-Scoped Dropdowns
    courses = Course.objects.filter(studentprofile__college=college).distinct().order_by("name")
    years = StudentProfile.objects.filter(college=college).values_list("year", flat=True).distinct().order_by("year")
    semesters = StudentProfile.objects.filter(college=college).values_list("semester", flat=True).distinct().order_by("semester")

    # Distinct Exam & Practice Titles for filters
    available_exams = (
        ExamResult.objects.filter(student__college=college)
        .values("exam_id", "exam_title")
        .distinct()
        .order_by("exam_title")
    )
    available_practice_tests = (
        PracticeResult.objects.filter(student__college=college)
        .values("practice_test_id", "practice_title")
        .distinct()
        .order_by("practice_title")
    )

    context = {
        "college": college,
        "students": data,
        "courses": courses,
        "years": years,
        "semesters": semesters,
        "available_exams": available_exams,
        "available_practice_tests": available_practice_tests,
        "selected_course": selected_course,
        "selected_year": selected_year,
        "selected_semester": selected_semester,
        "selected_exam": selected_exam,
        "selected_practice": selected_practice,
        "date_filter": date_filter,
        "total_students": total_students_cnt,
        "overall_exam_avg": f"{overall_exam_avg_val:.1f}%",
        "overall_practice_avg": f"{overall_practice_avg_val:.1f}%",
        "top_performer": top_performer,
        "chart_data_json": chart_data_json,

        "cohort_avg_score": cohort_avg_score,
        "excellent_count": excellent_count,
        "excellent_pct": excellent_pct,
        "good_count": good_count,
        "good_pct": good_pct,
        "average_count": average_count,
        "average_pct": average_pct,
        "poor_count": poor_count,
        "poor_pct": poor_pct,
        "very_poor_count": very_poor_count,
        "very_poor_pct": very_poor_pct,

        "summary_total_questions": summary_total_questions,
        "summary_attempted": summary_attempted,
        "summary_unattempted": summary_unattempted,
        "summary_total_marks": summary_total_marks,
        "summary_negative_marking": "Yes" if has_negative_marking else "No",
        "summary_duration": summary_duration,

        "improvement_pct": improvement_pct,
        "avg_time_taken_formatted": avg_time_taken_formatted,
        "top_performers": top_performers,
        "needs_improvement_students": needs_improvement_students,
    }

    return render(request, "tpo_student_performance.html", context)


# -------------------------------------------------------------
# AJAX API: Detailed Student Attempt History
# -------------------------------------------------------------
@login_required
@user_passes_test(is_tpo)
def get_student_performance_detail_api(request, student_id):
    """Returns all exam & practice test attempt logs for a specific student."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    student = get_object_or_404(StudentProfile, id=student_id, college=tpo_profile.college)

    st_name = (student.user.get_full_name() if student.user else "") or (student.user.username if student.user else "") or f"Student-{student.id}"

    # Main Exams
    exam_logs = []
    for r in ExamResult.objects.filter(student=student).order_by("-submitted_at"):
        pct = round((r.marks_obtained / r.total_marks * 100), 2) if r.total_marks > 0 else 0.0
        exam_logs.append({
            "result_id": str(r.id),
            "title": r.exam_title,
            "type": "Main Exam",
            "marks": f"{r.marks_obtained} / {r.total_marks}",
            "pct": f"{pct:.1f}%",
            "pct_val": pct,
            "status": "Passed" if pct >= 50 else "Failed",
            "date": r.submitted_at.strftime("%d %b %Y, %I:%M %p"),
            "device_info": r.device_info or "-",
            "device_type": r.device_type or "-",
            "os_name": r.os_name or "-",
            "browser_name": r.browser_name or "-",
            "ip_address": r.ip_address or "-",
        })

    # Practice Tests
    practice_logs = []
    for r in PracticeResult.objects.filter(student=student).order_by("-submitted_at"):
        pct = round((r.marks_obtained / r.total_marks * 100), 2) if r.total_marks > 0 else 0.0
        practice_logs.append({
            "result_id": str(r.id),
            "title": r.practice_title,
            "type": "Practice Test",
            "marks": f"{r.marks_obtained} / {r.total_marks}",
            "pct": f"{pct:.1f}%",
            "pct_val": pct,
            "status": "Passed" if pct >= 50 else "Failed",
            "date": r.submitted_at.strftime("%d %b %Y, %I:%M %p"),
        })

    return JsonResponse({
        "student_name": st_name,
        "usn": student.usn or "—",
        "course": student.course.name if student.course else "—",
        "year": student.year,
        "semester": student.semester,
        "exam_logs": exam_logs,
        "practice_logs": practice_logs,
    })


# OK JSON DATA ENDPOINT — for Chart.js updates
@login_required
@user_passes_test(is_tpo)
def get_performance_data(request):
    """Returns performance data as JSON for Chart.js graph."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    course_id = request.GET.get("course")
    year = request.GET.get("year")
    semester = request.GET.get("semester")

    students = StudentProfile.objects.filter(college=college, is_current=True).select_related("user", "course")
    if course_id:
        students = students.filter(course_id=course_id)
    if year:
        students = students.filter(year=year)
    if semester:
        students = students.filter(semester=semester)

    chart_data = []
    for student in students:
        exam_results = ExamResult.objects.filter(student=student)
        practice_results = PracticeResult.objects.filter(student=student)

        exam_avg = (
            sum([r.marks_obtained / r.total_marks * 100 for r in exam_results if r.total_marks > 0]) / len(exam_results)
            if exam_results else 0
        )
        practice_avg = (
            sum([r.marks_obtained / r.total_marks * 100 for r in practice_results if r.total_marks > 0]) / len(practice_results)
            if practice_results else 0
        )

        chart_data.append({
            "name": student.user.get_full_name(),
            "exam_avg": round(exam_avg, 2),
            "practice_avg": round(practice_avg, 2),
        })

    return JsonResponse({"data": chart_data})


@login_required
@user_passes_test(is_tpo)
def download_performance_excel(request):
    """Download Student Performance Excel with properly aligned logo, banner, and table."""

    import io, pandas as pd, openpyxl
    from django.http import FileResponse
    from django.shortcuts import get_object_or_404
    from openpyxl.drawing.image import Image
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from tpo.models import TpoProfile
    from student.models import StudentProfile
    from exam.models import ExamResult
    from practicetest.models import PracticeResult
    from college.models import Course

    # ---------- Identify TPO ----------
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    # ---------- Filters ----------
    course_id = request.GET.get("course")
    year = request.GET.get("year")
    semester = request.GET.get("semester")

    course_id = course_id if course_id and course_id != "None" else None
    year = year if year and year != "None" else None
    semester = semester if semester and semester != "None" else None

    students = StudentProfile.objects.filter(college=college, is_current=True).select_related("user", "course")
    if course_id:
        students = students.filter(course_id=int(course_id))
    if year:
        students = students.filter(year=int(year))
    if semester:
        students = students.filter(semester=int(semester))

    # ---------- Build Dataset ----------
    data = []
    for student in students:
        exam_results = ExamResult.objects.filter(student=student)
        practice_results = PracticeResult.objects.filter(student=student)

        exam_avg = (
            sum([r.marks_obtained / r.total_marks * 100 for r in exam_results if r.total_marks > 0]) / len(exam_results)
            if exam_results else 0
        )
        practice_avg = (
            sum([r.marks_obtained / r.total_marks * 100 for r in practice_results if r.total_marks > 0]) / len(practice_results)
            if practice_results else 0
        )

        overall_avg = round((exam_avg + practice_avg) / 2, 2) if (exam_avg or practice_avg) else 0

        data.append({
            "Student": student.user.get_full_name(),
            "USN": student.usn,
            "Course": student.course.name if student.course else "—",
            "Year": student.year,
            "Semester": student.semester,
            "Exam Avg (%)": round(exam_avg, 2),
            "Practice Avg (%)": round(practice_avg, 2),
            "Overall Avg (%)": overall_avg,
        })

    if not data:
        data = [{
            "Student": "No Data Found",
            "USN": "-",
            "Course": "-",
            "Year": "-",
            "Semester": "-",
            "Exam Avg (%)": "-",
            "Practice Avg (%)": "-",
            "Overall Avg (%)": "-"
        }]

    df = pd.DataFrame(data)

    # ---------- Create Workbook ----------
    buffer = io.BytesIO()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Performance Analytics"

    # ---------- Styles ----------
    green_fill = PatternFill(start_color="008037", end_color="008037", fill_type="solid")
    center = Alignment(horizontal="center", vertical="center")
    thin_border = Border(left=Side(style="thin"), right=Side(style="thin"),
                         top=Side(style="thin"), bottom=Side(style="thin"))

    # ---------- Logo ----------
    logo_path = "static/images/atomshaalelogo.png"
    try:
        img = Image(logo_path)
        img.width, img.height = 160, 70
        ws.add_image(img, "A1")
    except Exception as e:
        print("Logo load failed:", e)

    # ---------- Banner ----------
    ws.merge_cells("C1:O3")
    ws["C1"] = "STUDENT PERFORMANCE ANALYTICS"
    ws["C1"].font = Font(size=22, bold=True, color="FFFFFF", name="Calibri")
    ws["C1"].alignment = center
    for row in ws["C1:O3"]:
        for cell in row:
            cell.fill = green_fill

    # ---------- Table Header (Row 7) ----------
    start_row = 7
    headers = list(df.columns)
    for i, header in enumerate(headers, start=1):
        c = ws.cell(row=start_row, column=i, value=header)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = green_fill
        c.alignment = center
        c.border = thin_border

    # ---------- Table Data (From Row 8) ----------
    for r_idx, row in enumerate(df.itertuples(index=False), start=start_row + 1):
        for c_idx, value in enumerate(row, start=1):
            cell = ws.cell(row=r_idx, column=c_idx, value=value)
            cell.alignment = center
            cell.border = thin_border

    # ---------- Auto-fit Columns ----------
    for i, column_cells in enumerate(ws.columns, start=1):
        max_length = max(len(str(cell.value)) if cell.value else 0 for cell in column_cells)
        ws.column_dimensions[get_column_letter(i)].width = min(max(max_length + 3, 12), 40)

    # ---------- Footer ----------
    footer_row = ws.max_row + 3
    ws.merge_cells(f"A{footer_row}:O{footer_row}")
    footer = ws[f"A{footer_row}"]
    footer.value = "Atomshaale — Powered by ATOM"
    footer.font = Font(italic=True, color="808080", size=10)
    footer.alignment = center

    # ---------- Save ----------
    wb.save(buffer)
    buffer.seek(0)

    filename = f"Student_Performance_{college.name.replace(' ', '_')}.xlsx"
    return FileResponse(buffer, as_attachment=True, filename=filename)
#---tpo_student_attendance view with chart data---#

# CHART Attendance Dashboard
@login_required
@user_passes_test(is_tpo)
def tpo_student_attendance(request):
    """
    Comprehensive TPO Student Attendance Dashboard matching mockup UI.
    Fetches 100% dynamic data from database.
    """
    from datetime import datetime, timedelta
    from django.utils import timezone
    from django.utils.dateparse import parse_date
    from django.db.models import Q

    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    # Filter Params
    selected_course = request.GET.get("course", "").strip()
    selected_year = request.GET.get("year", "").strip()
    selected_semester = request.GET.get("semester", "").strip()
    start_date_str = request.GET.get("start_date", "").strip()
    end_date_str = request.GET.get("end_date", "").strip()
    slot_no_str = request.GET.get("slot_no", "").strip()
    quick_filter = request.GET.get("quick_filter", "").strip()
    search_q = request.GET.get("search", "").strip()

    # Apply Quick Date Filter presets if provided
    today = timezone.now().date()
    if quick_filter == "today":
        start_date = today
        end_date = today
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
    elif quick_filter == "yesterday":
        start_date = today - timedelta(days=1)
        end_date = today - timedelta(days=1)
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
    elif quick_filter == "this_week":
        start_date = today - timedelta(days=today.weekday())
        end_date = today
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
    elif quick_filter == "this_month":
        start_date = today.replace(day=1)
        end_date = today
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
    else:
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else None

    # Base Student Queryset for TPO College
    students_qs = StudentProfile.objects.filter(college=college, is_current=True).select_related("user", "course")

    if selected_course:
        students_qs = students_qs.filter(course_id=selected_course)
    if selected_year:
        students_qs = students_qs.filter(year=selected_year)
    if selected_semester:
        students_qs = students_qs.filter(semester=selected_semester)
    if search_q:
        students_qs = students_qs.filter(
            Q(user__first_name__icontains=search_q) |
            Q(user__last_name__icontains=search_q) |
            Q(usn__icontains=search_q)
        )

    # Base Attendance Queryset
    att_qs = AttendanceRecord.objects.filter(student__college=college)
    if start_date:
        att_qs = att_qs.filter(session__date__gte=start_date)
    if end_date:
        att_qs = att_qs.filter(session__date__lte=end_date)
    if slot_no_str and slot_no_str != "all":
        try:
            att_qs = att_qs.filter(session__slot_no=int(slot_no_str))
        except ValueError:
            pass

    # Build per-student stats
    students_data = []
    total_present_overall = 0
    total_absent_overall = 0
    student_percents = []

    # Distribution Counters
    excellent_count = 0  # >= 90%
    good_count = 0       # 75 - 89%
    average_count = 0    # 50 - 74%
    poor_count = 0       # < 50%

    for student in students_qs:
        st_att = att_qs.filter(student=student)
        p_cnt = st_att.filter(status="Present").count()
        a_cnt = st_att.filter(status="Absent").count()
        t_cnt = p_cnt + a_cnt
        pct = round((p_cnt / t_cnt) * 100, 2) if t_cnt > 0 else 0.0

        total_present_overall += p_cnt
        total_absent_overall += a_cnt
        if t_cnt > 0:
            student_percents.append(pct)

        # Status Badge
        if pct >= 90:
            status_text = "Excellent"
            status_class = "excellent"
            excellent_count += 1
        elif pct >= 75:
            status_text = "Good"
            status_class = "good"
            good_count += 1
        elif pct >= 50:
            status_text = "Average"
            status_class = "average"
            average_count += 1
        else:
            status_text = "Poor"
            status_class = "poor"
            poor_count += 1

        # Latest session info
        latest_rec = st_att.order_by("-session__date").first()
        latest_date = latest_rec.session.date.strftime("%d %b %Y") if (latest_rec and latest_rec.session) else "—"
        latest_slot = f"09:00 AM - 10:30 AM" if (latest_rec and latest_rec.session and latest_rec.session.slot_no == 1) else (f"Slot {latest_rec.session.slot_no}" if (latest_rec and latest_rec.session) else "09:00 AM - 10:30 AM")

        st_name = (student.user.get_full_name() if student.user else "") or (student.user.username if student.user else "") or f"Student-{student.id}"
        st_name = st_name.strip() if st_name else "Student"

        students_data.append({
            "student_id": str(student.id),
            "name": st_name,
            "usn": student.usn or "—",
            "course": student.course.name if student.course else "—",
            "year": student.year or "—",
            "semester": student.semester or "—",
            "date": latest_date,
            "slot": latest_slot,
            "present": p_cnt,
            "absent": a_cnt,
            "total": t_cnt,
            "pct": pct,
            "pct_str": f"{pct:.2f}%",
            "status_text": status_text,
            "status_class": status_class,
        })

    total_students_cnt = len(students_data)
    total_expected_overall = total_present_overall + total_absent_overall
    avg_attendance_pct = round((total_present_overall / total_expected_overall) * 100, 2) if total_expected_overall > 0 else 0.0

    highest_pct = max(student_percents) if student_percents else 0.0
    highest_cnt = sum(1 for p in student_percents if p == highest_pct) if student_percents else 0

    lowest_pct = min(student_percents) if student_percents else 0.0
    lowest_cnt = sum(1 for p in student_percents if p == lowest_pct) if student_percents else 0

    # Top 5 Students
    top_5_students = sorted(students_data, key=lambda x: x["pct"], reverse=True)[:5]

    # Course-wise Attendance for Chart
    courses = Course.objects.filter(studentprofile__college=college).distinct().order_by("name")
    course_chart_labels = []
    course_chart_values = []
    for c in courses:
        c_students = [s for s in students_data if s["course"] == c.name]
        c_pcts = [s["pct"] for s in c_students if s["total"] > 0]
        c_avg = round(sum(c_pcts) / len(c_pcts), 2) if c_pcts else 0.0
        course_chart_labels.append(c.name)
        course_chart_values.append(c_avg)

    # Student-wise Attendance for Chart (Null-safe split)
    student_chart_labels = [s["name"].split()[0] if (s.get("name") and isinstance(s["name"], str) and s["name"].split()) else "Student" for s in students_data[:15]]
    student_chart_values = [s["pct"] for s in students_data[:15]]

    # Distribution percentages
    dist_total = total_students_cnt or 1
    dist_percentages = {
        "excellent_cnt": excellent_count,
        "excellent_pct": round((excellent_count / dist_total) * 100, 2),
        "good_cnt": good_count,
        "good_pct": round((good_count / dist_total) * 100, 2),
        "average_cnt": average_count,
        "average_pct": round((average_count / dist_total) * 100, 2),
        "poor_cnt": poor_count,
        "poor_pct": round((poor_count / dist_total) * 100, 2),
    }

    years = StudentProfile.objects.filter(college=college, is_current=True).values_list("year", flat=True).distinct().order_by("year")
    semesters = StudentProfile.objects.filter(college=college, is_current=True).values_list("semester", flat=True).distinct().order_by("semester")

    context = {
        "college": college,
        "courses": courses,
        "years": years,
        "semesters": semesters,
        "selected_course": selected_course,
        "selected_year": selected_year,
        "selected_semester": selected_semester,
        "start_date": start_date_str,
        "end_date": end_date_str,
        "slot_no": slot_no_str,
        "quick_filter": quick_filter,
        "search_q": search_q,
        
        # Stat Cards
        "total_students": total_students_cnt,
        "avg_attendance": f"{avg_attendance_pct:.2f}%",
        "highest_attendance": f"{highest_pct:.2f}%",
        "highest_students_cnt": highest_cnt,
        "lowest_attendance": f"{lowest_pct:.2f}%",
        "lowest_students_cnt": lowest_cnt,
        "total_present": f"{total_present_overall:,}",
        "total_absent": f"{total_absent_overall:,}",
        "total_expected": f"{total_expected_overall:,}",
        
        # Chart Data
        "chart_student_labels": json.dumps(student_chart_labels),
        "chart_student_values": json.dumps(student_chart_values),
        "chart_course_labels": json.dumps(course_chart_labels),
        "chart_course_values": json.dumps(course_chart_values),
        
        # Distribution
        "dist": dist_percentages,
        "dist_chart_values": json.dumps([excellent_count, good_count, average_count, poor_count]),
        
        # Top 5
        "top_5": top_5_students,
        
        # Student Table List
        "students": students_data,
    }
    return render(request, "tpo_student_attendance.html", context)


@login_required
@user_passes_test(is_tpo)
def get_student_attendance_detail_api(request, student_id):
    """Returns date-wise attendance records for a specific student."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    student = get_object_or_404(StudentProfile, id=student_id, college=tpo_profile.college)

    records = AttendanceRecord.objects.filter(student=student).select_related('session', 'session__domain', 'session__trainer', 'session__trainer__user').order_by('-session__date')
    log = []
    for r in records:
        log.append({
            "date": r.session.date.strftime("%d %b %Y") if r.session else "—",
            "slot": f"Slot {r.session.slot_no}" if r.session else "—",
            "domain": r.session.domain.domain_name if (r.session and r.session.domain) else "—",
            "trainer": r.session.trainer.user.get_full_name() if (r.session and r.session.trainer and r.session.trainer.user) else "—",
            "status": r.status
        })
    return JsonResponse({
        "student_name": student.user.get_full_name(),
        "usn": student.usn,
        "records": log
    })


# 📤 Excel Export
@login_required
@user_passes_test(is_tpo)
def download_attendance_excel(request):
    """
    Download attendance analytics Excel file with:
    - Top-left Atomshaale logo
    - Green styled banner: 'ATTENDANCE ANALYTICS'
    - Auto-fit table columns
    - Attendance bar chart
    - Footer: 'Atomshaale — Powered by ATOM'
    """

    import io, openpyxl
    import pandas as pd
    from django.http import FileResponse
    from django.shortcuts import get_object_or_404
    from openpyxl.drawing.image import Image
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.chart import BarChart, Reference
    from tpo.models import TpoProfile
    from student.models import StudentProfile
    # 🔹 Import your actual attendance model
    from trainer.models import AttendanceRecord  # adjust this if in another app

    # ---------- TPO & Filters ----------
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    course_id = request.GET.get("course")
    year = request.GET.get("year")
    semester = request.GET.get("semester")

    # OK Convert invalid strings to None
    if not course_id or course_id == "None":
        course_id = None
    if not year or year == "None":
        year = None
    if not semester or semester == "None":
        semester = None

    # ---------- Student Filtering ----------
    students = StudentProfile.objects.filter(college=college, is_current=True)
    if course_id:
        students = students.filter(course_id=int(course_id))
    if year:
        students = students.filter(year=int(year))
    if semester:
        students = students.filter(semester=int(semester))

    # ---------- Data Preparation ----------
    data = []
    for student in students:
        total_sessions = AttendanceRecord.objects.filter(student=student).count()
        present_sessions = AttendanceRecord.objects.filter(student=student, status="Present").count()
        attendance_percent = round((present_sessions / total_sessions) * 100, 2) if total_sessions > 0 else 0

        data.append({
            "Student": student.user.get_full_name(),
            "USN": student.usn,
            "Course": student.course.name if student.course else "—",
            "Year": student.year,
            "Semester": student.semester,
            "Present Sessions": present_sessions,
            "Total Sessions": total_sessions,
            "Attendance (%)": attendance_percent,
        })

    if not data:
        data = [{
            "Student": "No Data Found",
            "USN": "-",
            "Course": "-",
            "Year": "-",
            "Semester": "-",
            "Present Sessions": "-",
            "Total Sessions": "-",
            "Attendance (%)": "-"
        }]

    # ---------- Workbook Setup ----------
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Analytics"

    # ---------- Styles ----------
    green_fill = PatternFill(start_color="008037", end_color="008037", fill_type="solid")
    center = Alignment(horizontal="center", vertical="center")
    thin_border = Border(left=Side(style="thin"), right=Side(style="thin"),
                         top=Side(style="thin"), bottom=Side(style="thin"))

    # ---------- Logo ----------
    logo_path = "static/images/atomshaalelogo.png"
    try:
        img = Image(logo_path)
        img.width, img.height = 160, 70
        ws.add_image(img, "A1")
    except Exception as e:
        print("Logo load failed:", e)

    # ---------- Banner ----------
    ws.merge_cells("C1:O3")
    ws["C1"] = "ATTENDANCE ANALYTICS"
    ws["C1"].font = Font(size=22, bold=True, color="FFFFFF", name="Calibri")
    ws["C1"].alignment = center
    for row in ws["C1:O3"]:
        for cell in row:
            cell.fill = green_fill

    # ---------- Table Header ----------
    start_row = 6
    headers = list(data[0].keys())
    for i, header in enumerate(headers, start=1):
        c = ws.cell(row=start_row, column=i, value=header)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = green_fill
        c.alignment = center
        c.border = thin_border

    # ---------- Table Data ----------
    for row in data:
        start_row += 1
        for col_index, key in enumerate(headers, start=1):
            cell = ws.cell(row=start_row, column=col_index, value=row[key])
            cell.alignment = center
            cell.border = thin_border

    # ---------- Auto-Fit Columns ----------
    for i, column_cells in enumerate(ws.columns, start=1):
        max_length = 0
        for cell in column_cells:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
        ws.column_dimensions[get_column_letter(i)].width = min(max(max_length + 3, 12), 40)

    # ---------- Chart ----------
    if not (len(data) == 1 and data[0]["Student"] == "No Data Found"):
        chart = BarChart()
        chart.title = f"Attendance Overview — {college.name}"
        chart.y_axis.title = "Attendance (%)"
        chart.x_axis.title = "Student"

        data_ref = Reference(ws, min_col=headers.index("Attendance (%)") + 1, min_row=6, max_row=5 + len(data))
        cats_ref = Reference(ws, min_col=headers.index("Student") + 1, min_row=7, max_row=5 + len(data))
        chart.add_data(data_ref, titles_from_data=True)
        chart.set_categories(cats_ref)
        ws.add_chart(chart, "J3")

    # ---------- Footer ----------
    footer_row = ws.max_row + 3
    ws.merge_cells(f"A{footer_row}:O{footer_row}")
    footer = ws[f"A{footer_row}"]
    footer.value = "Atomshaale — Powered by ATOM"
    footer.font = Font(italic=True, color="808080", size=10)
    footer.alignment = center

    # ---------- Export ----------
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"Attendance_Analytics_{college.name.replace(' ', '_')}.xlsx"
    return FileResponse(buffer, as_attachment=True, filename=filename)

#----tpofeedback view----#


@login_required
@user_passes_test(is_tpo)
def tpo_feedback(request):
    """Main Feedback Dashboard for TPO — scoped strictly to TPO's registered college."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    selected_course = request.GET.get("course")
    selected_year = request.GET.get("year")
    selected_semester = request.GET.get("semester")
    date_from = request.GET.get("date_from", "")
    date_to = request.GET.get("date_to", "")

    students = StudentProfile.objects.filter(college=college, is_current=True)
    if selected_course:
        students = students.filter(course_id=selected_course)
    if selected_year:
        students = students.filter(year=selected_year)
    if selected_semester:
        students = students.filter(semester=selected_semester)

    feedbacks = StudentFeedback.objects.filter(student__in=students).select_related(
        "student", "student__user", "student__course"
    ).order_by("-date")

    if date_from:
        try:
            feedbacks = feedbacks.filter(date__gte=date_from)
        except Exception:
            pass
    if date_to:
        try:
            feedbacks = feedbacks.filter(date__lte=date_to)
        except Exception:
            pass

    # Aggregate avg ratings
    avg_data = feedbacks.aggregate(
        avg_content=Avg("content_rating"),
        avg_clarity=Avg("objectives_clarity"),
        avg_logic=Avg("structure_logic"),
        avg_satisfaction=Avg("satisfaction"),
    )

    # Round for safe display
    def r(v):
        return round(v or 0, 1)

    avg_content = r(avg_data.get("avg_content"))
    avg_clarity = r(avg_data.get("avg_clarity"))
    avg_logic = r(avg_data.get("avg_logic"))
    avg_satisfaction = r(avg_data.get("avg_satisfaction"))
    overall_avg = round((avg_content + avg_clarity + avg_logic + avg_satisfaction) / 4, 1) if feedbacks.exists() else 0.0

    # Session engagement distribution
    engagement_dist = dict(
        feedbacks.values("session_engagement")
        .annotate(cnt=Count("id"))
        .values_list("session_engagement", "cnt")
    )

    # Future interest distribution
    interest_dist = dict(
        feedbacks.values("future_interest")
        .annotate(cnt=Count("id"))
        .values_list("future_interest", "cnt")
    )

    # Rating breakdowns per metric (1-5 stars count)
    def rating_dist(field):
        dist = {i: 0 for i in range(1, 6)}
        for item in feedbacks.values(field).annotate(cnt=Count("id")):
            dist[item[field]] = item["cnt"]
        return [dist[i] for i in range(1, 6)]

    content_dist = rating_dist("content_rating")
    clarity_dist = rating_dist("objectives_clarity")
    logic_dist = rating_dist("structure_logic")
    satisfaction_dist = rating_dist("satisfaction")

    courses = Course.objects.filter(studentprofile__college=college).distinct()
    all_students_base = StudentProfile.objects.filter(college=college, is_current=True)
    years = all_students_base.values_list("year", flat=True).distinct().order_by("year")
    semesters = all_students_base.values_list("semester", flat=True).distinct().order_by("semester")

    # --- Trainer-level Feedback Aggregation ---
    # Get all SessionTrainerFeedback records for feedbacks of this college
    trainer_feedback_qs = SessionTrainerFeedback.objects.filter(
        feedback__in=feedbacks
    ).select_related(
        "trainer", "trainer__user",
        "session",
        "feedback__student", "feedback__student__user"
    ).order_by("trainer__user__first_name")

    # Per-trainer aggregate summary
    # TrainerProfile PK is 'user' (OneToOneField) — use trainer__user_id not trainer__id
    trainer_avg_qs = (
        SessionTrainerFeedback.objects.filter(feedback__in=feedbacks)
        .values("trainer__user_id", "trainer__user__first_name", "trainer__user__last_name")
        .annotate(
            feedback_count=Count("pk"),
            avg_pace=Avg("pace_rating"),
            avg_knowledge=Avg("knowledge_rating"),
            avg_queries=Avg("queries_rating"),
        )
        .order_by("-avg_knowledge")
    )

    trainer_summary = []
    for t in trainer_avg_qs:
        first = t["trainer__user__first_name"] or ""
        last  = t["trainer__user__last_name"] or ""
        trainer_name = f"{first} {last}".strip() or f"Trainer-{t['trainer__user_id']}"
        avg_overall = round(
            ((t["avg_pace"] or 0) + (t["avg_knowledge"] or 0) + (t["avg_queries"] or 0)) / 3, 1
        )
        trainer_summary.append({
            "trainer_id": str(t["trainer__user_id"]),
            "name": trainer_name,
            "feedback_count": t["feedback_count"],
            "avg_pace": round(t["avg_pace"] or 0, 1),
            "avg_knowledge": round(t["avg_knowledge"] or 0, 1),
            "avg_queries": round(t["avg_queries"] or 0, 1),
            "avg_overall": avg_overall,
        })

    # Trainer avg for chart
    trainer_chart_data = {
        "labels": [t["name"] for t in trainer_summary],
        "knowledge": [t["avg_knowledge"] for t in trainer_summary],
        "pace": [t["avg_pace"] for t in trainer_summary],
        "queries": [t["avg_queries"] for t in trainer_summary],
    }

    context = {
        "college": college,
        "feedbacks": feedbacks,
        "total_feedback": feedbacks.count(),
        "total_students": students.count(),
        "courses": courses,
        "years": years,
        "semesters": semesters,
        "selected_course": selected_course,
        "selected_year": selected_year,
        "selected_semester": selected_semester,
        "date_from": date_from,
        "date_to": date_to,
        "avg_data": avg_data,
        "avg_content": avg_content,
        "avg_clarity": avg_clarity,
        "avg_logic": avg_logic,
        "avg_satisfaction": avg_satisfaction,
        "overall_avg": overall_avg,
        "engagement_dist": engagement_dist,
        "interest_dist": interest_dist,
        "content_dist": json.dumps(content_dist),
        "clarity_dist": json.dumps(clarity_dist),
        "logic_dist": json.dumps(logic_dist),
        "satisfaction_dist": json.dumps(satisfaction_dist),
        "engagement_dist_json": json.dumps(engagement_dist),
        "interest_dist_json": json.dumps(interest_dist),
        "trainer_feedback_qs": trainer_feedback_qs,
        "trainer_summary": trainer_summary,
        "trainer_chart_data_json": json.dumps(trainer_chart_data),
        "total_trainers": len(trainer_summary),
    }

    return render(request, "tpo_feedback.html", context)


@login_required
@user_passes_test(is_tpo)
def get_feedback_chart_data(request):
    """Return JSON for feedback chart."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    students = StudentProfile.objects.filter(college=college, is_current=True)
    feedbacks = StudentFeedback.objects.filter(student__in=students)

    avg_data = feedbacks.aggregate(
        content=Avg("content_rating"),
        clarity=Avg("objectives_clarity"),
        logic=Avg("structure_logic"),
        satisfaction=Avg("satisfaction"),
    )

    return JsonResponse({"avg_data": avg_data})


@login_required
@user_passes_test(is_tpo)
def download_feedback_excel(request):
    """
    Download all filtered student feedback in Excel format with:
    - Top-left logo
    - Green styled banner: 'STUDENT FEEDBACK ANALYTICS'
    - Auto-fit table columns
    - Average rating chart
    - Footer: 'Atomshaale — Powered by ATOM'
    """

    import io, pandas as pd, openpyxl
    from django.http import FileResponse
    from django.shortcuts import get_object_or_404
    from openpyxl.drawing.image import Image
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.chart import BarChart, Reference
    from tpo.models import TpoProfile
    from student.models import StudentProfile, StudentFeedback

    # ---------- TPO Profile ----------
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    # ---------- Normalize query params ----------
    selected_course = request.GET.get("course")
    selected_year = request.GET.get("year")
    selected_semester = request.GET.get("semester")

    selected_course = selected_course if selected_course and selected_course != "None" else None
    selected_year = selected_year if selected_year and selected_year != "None" else None
    selected_semester = selected_semester if selected_semester and selected_semester != "None" else None

    students = StudentProfile.objects.filter(college=college, is_current=True)
    if selected_course:
        try:
            students = students.filter(course_id=int(selected_course))
        except (ValueError, TypeError):
            students = students.filter(course_id=selected_course)
    if selected_year:
        try:
            students = students.filter(year=int(selected_year))
        except (ValueError, TypeError):
            students = students.filter(year=selected_year)
    if selected_semester:
        try:
            students = students.filter(semester=int(selected_semester))
        except (ValueError, TypeError):
            students = students.filter(semester=selected_semester)

    feedbacks = StudentFeedback.objects.filter(student__in=students).select_related("student")

    # ---------- Data ----------
    data = [{
        "Student": fb.student.user.get_full_name(),
        "USN": fb.student.usn,
        "Course": fb.student.course.name if fb.student.course else "—",
        "Year": fb.student.year,
        "Semester": fb.student.semester,
        "Content Rating": fb.content_rating,
        "Clarity": fb.objectives_clarity,
        "Logic": fb.structure_logic,
        "Satisfaction": fb.satisfaction,
        "Takeaways": fb.takeaways,
        "Date": fb.date.strftime("%Y-%m-%d"),
    } for fb in feedbacks]

    if not data:
        data = [{
            "Student": "No Feedback Found",
            "USN": "-",
            "Course": "-",
            "Year": "-",
            "Semester": "-",
            "Content Rating": "-",
            "Clarity": "-",
            "Logic": "-",
            "Satisfaction": "-",
            "Takeaways": "-",
            "Date": "-",
        }]

    # ---------- Workbook Setup ----------
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Feedback Analytics"

    # ---------- Styles ----------
    green_fill = PatternFill(start_color="008037", end_color="008037", fill_type="solid")
    center = Alignment(horizontal="center", vertical="center")
    thin_border = Border(left=Side(style="thin"), right=Side(style="thin"),
                         top=Side(style="thin"), bottom=Side(style="thin"))

    # ---------- Logo ----------
    logo_path = "static/images/atomshaalelogo.png"
    try:
        img = Image(logo_path)
        img.width, img.height = 160, 70
        ws.add_image(img, "A1")
    except Exception as e:
        print("Logo load failed:", e)

    # ---------- Header Banner ----------
    ws.merge_cells("C1:O3")
    ws["C1"] = "STUDENT FEEDBACK ANALYTICS"
    ws["C1"].font = Font(size=22, bold=True, color="FFFFFF", name="Calibri")
    ws["C1"].alignment = center
    for row in ws["C1:O3"]:
        for cell in row:
            cell.fill = green_fill

    # ---------- Table Header ----------
    start_row = 6
    headers = list(data[0].keys())
    for i, header in enumerate(headers, start=1):
        c = ws.cell(row=start_row, column=i, value=header)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = green_fill
        c.alignment = center
        c.border = thin_border

    # ---------- Table Data ----------
    for row in data:
        start_row += 1
        for col_index, key in enumerate(headers, start=1):
            cell = ws.cell(row=start_row, column=col_index, value=row[key])
            cell.alignment = center
            cell.border = thin_border

    # ---------- Auto-fit Columns ----------
    for i, column_cells in enumerate(ws.columns, start=1):
        max_length = 0
        for cell in column_cells:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
        ws.column_dimensions[get_column_letter(i)].width = min(max(max_length + 3, 12), 40)

    # ---------- Chart Sheet (average ratings) ----------
    if not (len(data) == 1 and data[0]["Student"] == "No Feedback Found"):
        chart_ws = wb.create_sheet("Charts")
        chart_ws.append(["Metric", "Average Rating"])

        # Calculate averages for numeric columns
        numeric_keys = ["Content Rating", "Clarity", "Logic", "Satisfaction"]
        for key in numeric_keys:
            try:
                avg_val = round(sum(float(r[key]) for r in data if isinstance(r[key], (int, float))) / len(data), 2)
            except Exception:
                avg_val = 0
            chart_ws.append([key, avg_val])

        chart = BarChart()
        chart.title = f"Average Feedback Ratings — {college.name}"
        chart.y_axis.title = "Average Rating"
        chart.x_axis.title = "Metric"

        data_ref = Reference(chart_ws, min_col=2, min_row=1, max_row=len(numeric_keys) + 1)
        cats_ref = Reference(chart_ws, min_col=1, min_row=2, max_row=len(numeric_keys) + 1)
        chart.add_data(data_ref, titles_from_data=True)
        chart.set_categories(cats_ref)
        chart.shape = 4
        chart_ws.add_chart(chart, "E3")

    # ---------- Footer ----------
    footer_row = ws.max_row + 3
    ws.merge_cells(f"A{footer_row}:O{footer_row}")
    footer = ws[f"A{footer_row}"]
    footer.value = "Atomshaale — Powered by ATOM"
    footer.font = Font(italic=True, color="808080", size=10)
    footer.alignment = center

    # ---------- Export ----------
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"TPO_Feedback_{college.name.replace(' ', '_')}.xlsx"
    return FileResponse(buffer, as_attachment=True, filename=filename)


#---trainer_daily_report view---#

@login_required
@user_passes_test(is_tpo)
def trainer_daily_report(request):
    """Render the TPO Trainer Daily Report page."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    trainers = (
    TrainerSessionReport.objects.filter(college=college)
    .select_related("trainer__user")
    .annotate(
        trainer_name=Concat(
            F("trainer__user__first_name"),
            Value(" "),
            F("trainer__user__last_name")
        )
    )
    .values("trainer_id", "trainer_name")
    .distinct()
)

    courses = (
        TrainerSessionReport.objects.filter(college=college)
        .select_related("course")
        .values("course_id", "course__name")
        .distinct()
    )

    years = (
        TrainerSessionReport.objects.filter(college=college)
        .values_list("year", flat=True)
        .distinct()
    )

    semesters = (
        TrainerSessionReport.objects.filter(college=college)
        .values_list("semester", flat=True)
        .distinct()
    )

    from django.db.models import Sum
    reports_qs = TrainerSessionReport.objects.filter(college=college)
    total_reports_cnt = reports_qs.count()
    total_trainers_cnt = len(trainers)
    total_present_cnt = reports_qs.aggregate(s=Sum("present_students"))["s"] or 0

    raw_exercises = reports_qs.values_list("exercises_solved", flat=True)
    total_exercises_cnt = 0
    for ex in raw_exercises:
        if ex:
            try:
                total_exercises_cnt += int(str(ex).strip())
            except ValueError:
                total_exercises_cnt += 1 if str(ex).strip() else 0

    context = {
        "trainers": trainers,
        "courses": courses,
        "years": years,
        "semesters": semesters,
        "college": college,
        "total_reports": total_reports_cnt,
        "total_trainers": total_trainers_cnt,
        "total_present": total_present_cnt,
        "total_exercises": total_exercises_cnt,
    }
    return render(request, "trainer_daily_report_tpo.html", context)


# ------------ API (AJAX) FOR TABLE DATA ------------- #

@login_required
@user_passes_test(is_tpo)
def trainer_daily_report_data(request):
    """Return filtered Trainer Daily Reports for TPO as JSON."""
    tpo_profile = get_object_or_404(TpoProfile, user=request.user)
    college = tpo_profile.college

    reports = TrainerSessionReport.objects.filter(college=college).select_related(
        "trainer__user", "course", "domain", "subdomain", "section"
    )

    # Filters
    trainer_id = request.GET.get("trainer")
    course_id = request.GET.get("course")
    year = request.GET.get("year")
    semester = request.GET.get("semester")
    date = request.GET.get("date")
    search = request.GET.get("search", "").strip()

    if trainer_id:
        reports = reports.filter(trainer_id=trainer_id)
    if course_id:
        reports = reports.filter(course_id=course_id)
    if year:
        reports = reports.filter(year=year)
    if semester:
        reports = reports.filter(semester=semester)
    if date:
        reports = reports.filter(date=date)

    # Search across trainer, module, domain, summary
    if search:
        reports = reports.filter(
            Q(trainer__user__full_name__icontains=search) |
            Q(module__icontains=search) |
            Q(domain__domain_name__icontains=search) |
            Q(summary__icontains=search)
        )

    # Convert to JSON format
    data = [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "trainer": r.trainer.user.get_full_name(),
            "course": r.course.name,
            "year": r.year,
            "semester": r.semester,
            "section": r.section.name if r.section else "-",
            "domain": r.domain.domain_name,
            "subdomain": r.subdomain.subdomain_name if r.subdomain else "-",
            "module": r.module,
            "present": r.present_students,
            "absent": r.absent_students,
            "materials_shared": r.materials_shared,
            "assignments_given": r.assignments_given,
            "exercises_solved": r.exercises_solved,
            "summary": r.summary,
        }
        for r in reports
    ]

    return JsonResponse({"reports": data})


# =============== TPO EXAM MONITORING VIEWS ===============

@login_required
@user_passes_test(is_tpo)
def tpo_exam_monitor(request):
    """Display exam monitoring page for TPO"""
    return render(request, 'tpo_exam_monitor.html')

@login_required
@user_passes_test(is_tpo)
def tpo_exam_monitor_list(request):
    """Get list of exams assigned to this TPO for monitoring"""
    try:
        from exam.models import ScheduledExam
        from exam.views import check_and_update_scheduled_exams
        from django.utils import timezone
        from django.views.decorators.http import require_GET
        
        check_and_update_scheduled_exams()
        tpo_profile = TpoProfile.objects.get(user=request.user)
        
        # Get exams where this TPO is assigned for monitoring in their college
        exams = ScheduledExam.objects.filter(
            monitor_tpos=tpo_profile,
            live_exam_monitor=True,
            college=tpo_profile.college,
            status__in=['pending', 'started']
        ).select_related('exam', 'college', 'course').order_by('-start_datetime')
        
        data = []
        for exam in exams:
            start_local = timezone.localtime(exam.start_datetime) if exam.start_datetime else None
            end_local = timezone.localtime(exam.end_datetime) if exam.end_datetime else None
            data.append({
                'id': str(exam.id),
                'exam_id': str(exam.exam.id),
                'exam_title': exam.exam.title,
                'college_name': exam.college.name,
                'course_name': exam.course.name,
                'semester': exam.semester,
                'year': exam.year,
                'start_datetime': start_local.strftime("%d-%m-%Y %I:%M %p") if start_local else "-",
                'end_datetime': end_local.strftime("%d-%m-%Y %I:%M %p") if end_local else "-",
                'status': exam.status,
            })
        
        return JsonResponse({'status': 'success', 'exams': data})
    except Exception as e:
        import logging
        logging.exception("Error fetching TPO exam monitor list")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@login_required
@user_passes_test(is_tpo)
def tpo_exam_monitor_detail(request, schedule_id):
    """Get detailed live monitoring data for a specific exam."""
    try:
        from exam.models import ScheduledExam
        from exam.views import _build_live_monitor_payload
        
        tpo_profile = TpoProfile.objects.get(user=request.user)
        
        # Verify this TPO has access to monitor this exam in their college
        schedule = ScheduledExam.objects.get(
            id=schedule_id,
            monitor_tpos=tpo_profile,
            college=tpo_profile.college,
            live_exam_monitor=True
        )
        
        payload = _build_live_monitor_payload(schedule)
        
        return JsonResponse({
            'status': 'success',
            'schedule_id': str(schedule.id),
            'exam_title': schedule.exam.title,
            'allowed_tab_switches': schedule.allowed_tab_switches,
            'course_name': schedule.course.name,
            'section_name': schedule.section or '-',
            'students': payload['students'],
            'summary': payload['summary'],
            'total_students': payload['summary']['total'],
        })
    except Exception as e:
        import logging
        logging.exception("Error fetching exam monitor detail")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)