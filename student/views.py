# student/views.py
from django.contrib.auth.decorators import login_required, user_passes_test
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.db.models import Avg, Count
from datetime import timedelta
from django.utils import timezone
from datetime import datetime
from django.contrib import messages
from django.contrib.auth import authenticate, login
from django.urls import reverse
from django.shortcuts import redirect
from django.shortcuts import render, get_object_or_404
from django.forms import formset_factory
from django.db import models
import openpyxl
from django.conf import settings
from openpyxl.utils import get_column_letter
from django.db import transaction
from material.models import Domain, Module, ScheduledMaterial
from exam.models import (ExamResult, ScheduledExam)
from student.models import StudentProfile, StudentFeedback, SessionTrainerFeedback
from admin_panel.models import SessionSchedule
from student.forms import StudentFeedbackForm, SessionTrainerFeedbackForm, StudentProfileUpdateForm
from practicetest.models import PracticeResult, ScheduledPracticeTest
from material.models import ScheduledMaterial
from student import views as student_views
from trainer.models import AttendanceRecord



def is_student(user):
    return user.is_authenticated and user.role == 'student'

def role_based_redirect(request):
    user = request.user
    if user.is_authenticated:
        if user.role == 'student':
            return redirect('student_home_page')
        elif user.role == 'trainer':
            return redirect('trainer_dashboard')
        elif user.role == 'admin':
            return redirect('admin_dashboard')
    return redirect('login')


@login_required
@user_passes_test(is_student)
def student_redirect_to_home(request):
    return redirect('student_home_page')  # OK Correct

@login_required
@user_passes_test(is_student)
def student_dashboard(request):
    return render(request, 'student_base.html')


@login_required
@user_passes_test(is_student)
def student_home_page(request):
    return render(request, 'student_home.html')



@login_required
@user_passes_test(is_student)
def materials_page(request):
    return render(request, 'materials.html')

@login_required
@user_passes_test(is_student)
def exam_page(request):
    return render(request, 'exam.html')

@login_required
@user_passes_test(is_student)
def practice_test_page(request):
    return render(request, 'practice_test.html')

@login_required
@user_passes_test(is_student)
def performance_page(request):
    return render(request, 'student_performance.html')

@login_required
@user_passes_test(is_student)
def resume_page(request):
    return render(request, 'resume.html')

@login_required
@user_passes_test(is_student)

def feedback_page(request):
    return redirect('give_student_feedback')


#---student home -----#


@login_required
@user_passes_test(is_student)
def student_dashboard_data(request):
    """Return all dashboard metrics as JSON"""
    student_profile = get_object_or_404(StudentProfile, user=request.user, is_current=True)

    # Attendance
    total_sessions = AttendanceRecord.objects.filter(student=student_profile).count()
    present_sessions = AttendanceRecord.objects.filter(student=student_profile, status="Present").count()
    absent_sessions = total_sessions - present_sessions
    attendance_percent = round((present_sessions / total_sessions) * 100, 2) if total_sessions > 0 else 0.0

    # Helper function to compute monthly averages & trends
    from collections import defaultdict
    
    def get_trend_and_sparkline(records, date_field, val_field, total_field=None, is_attendance=False):
        grouped = defaultdict(list)
        for r in records:
            dt = getattr(r, date_field) if not is_attendance else (r.session.date if r.session else None)
            if dt:
                key = (dt.year, dt.month)
                grouped[key].append(r)
        
        sorted_months = sorted(grouped.keys())
        trend_val = 0.0
        trend_dir = "none"
        
        if len(sorted_months) >= 1:
            latest_month = sorted_months[-1]
            latest_records = grouped[latest_month]
            
            if is_attendance:
                latest_present = sum(1 for r in latest_records if r.status == 'Present')
                latest_pct = (latest_present / len(latest_records)) * 100 if latest_records else 0.0
                
                if len(sorted_months) >= 2:
                    prev_month = sorted_months[-2]
                    prev_records = grouped[prev_month]
                    prev_present = sum(1 for r in prev_records if r.status == 'Present')
                    prev_pct = (prev_present / len(prev_records)) * 100 if prev_records else 0.0
                    trend_val = latest_pct - prev_pct
                else:
                    trend_val = latest_pct
            else:
                latest_pct = sum((getattr(r, val_field) / getattr(r, total_field) * 100) if getattr(r, total_field) else 0.0 for r in latest_records) / len(latest_records) if latest_records else 0.0
                
                if len(sorted_months) >= 2:
                    prev_month = sorted_months[-2]
                    prev_records = grouped[prev_month]
                    prev_pct = sum((getattr(r, val_field) / getattr(r, total_field) * 100) if getattr(r, total_field) else 0.0 for r in prev_records) / len(prev_records) if prev_records else 0.0
                    trend_val = latest_pct - prev_pct
                else:
                    trend_val = latest_pct
        
        trend_val = round(trend_val, 2)
        if trend_val > 0.01:
            trend_dir = "up"
        elif trend_val < -0.01:
            trend_dir = "down"
            
        sparkline = []
        if is_attendance:
            running_present = 0
            for idx, r in enumerate(records):
                if r.status == 'Present':
                    running_present += 1
                sparkline.append(round((running_present / (idx + 1)) * 100, 2))
        else:
            for r in records:
                tot = getattr(r, total_field)
                val = getattr(r, val_field)
                pct = round((val / tot * 100) if tot else 0.0, 2)
                sparkline.append(pct)
                
        sparkline = sparkline[-6:]
        if not sparkline:
            sparkline = [0.0] * 6
            
        return {
            "trend_val": abs(trend_val),
            "trend_dir": trend_dir,
            "sparkline": sparkline
        }

    # Performance
    exam_results = ExamResult.objects.filter(
        student=student_profile,
        submission_status__in=["submitted", "accidental_submit", "retaken"]
    ).order_by("submitted_at")
    practice_results = PracticeResult.objects.filter(student=student_profile).order_by("submitted_at")

    avg_exam = exam_results.aggregate(avg=Avg("marks_obtained"))["avg"] or 0.0
    avg_exam_total = exam_results.aggregate(avg=Avg("total_marks"))["avg"] or 0.0
    
    avg_practice = practice_results.aggregate(avg=Avg("marks_obtained"))["avg"] or 0.0
    avg_practice_total = practice_results.aggregate(avg=Avg("total_marks"))["avg"] or 0.0
    
    overall_avg = (avg_exam + avg_practice) / 2
    overall_avg_total = (avg_exam_total + avg_practice_total) / 2

    # Averages/Trends/Sparklines calculations
    attendance_records = AttendanceRecord.objects.filter(student=student_profile).select_related('session').order_by('session__date')
    att_metrics = get_trend_and_sparkline(attendance_records, None, None, is_attendance=True)
    
    exam_metrics = get_trend_and_sparkline(exam_results, "submitted_at", "marks_obtained", "total_marks")
    practice_metrics = get_trend_and_sparkline(practice_results, "submitted_at", "marks_obtained", "total_marks")

    # Overall Combined Metrics
    combined_results = sorted(list(exam_results) + list(practice_results), key=lambda r: r.submitted_at)
    overall_grouped = defaultdict(list)
    for r in combined_results:
        dt = r.submitted_at
        if dt:
            overall_grouped[(dt.year, dt.month)].append(r)
            
    sorted_overall_months = sorted(overall_grouped.keys())
    overall_trend_val = 0.0
    overall_trend_dir = "none"
    
    if len(sorted_overall_months) >= 1:
        latest_month = sorted_overall_months[-1]
        latest_records = overall_grouped[latest_month]
        latest_pct = sum((r.marks_obtained / r.total_marks * 100) if r.total_marks else 0.0 for r in latest_records) / len(latest_records) if latest_records else 0.0
        
        if len(sorted_overall_months) >= 2:
            prev_month = sorted_overall_months[-2]
            prev_records = overall_grouped[prev_month]
            prev_pct = sum((r.marks_obtained / r.total_marks * 100) if r.total_marks else 0.0 for r in prev_records) / len(prev_records) if prev_records else 0.0
            overall_trend_val = latest_pct - prev_pct
        else:
            overall_trend_val = latest_pct
            
    overall_trend_val = round(overall_trend_val, 2)
    if overall_trend_val > 0.01:
        overall_trend_dir = "up"
    elif overall_trend_val < -0.01:
        overall_trend_dir = "down"
        
    overall_sparkline = []
    for r in combined_results:
        pct = round((r.marks_obtained / r.total_marks * 100) if r.total_marks else 0.0, 2)
        overall_sparkline.append(pct)
    overall_sparkline = overall_sparkline[-6:]
    if not overall_sparkline:
        overall_sparkline = [0.0] * 6

    # Recent performance trend (last 8 scores) - preserved for backwards compatibility
    exam_trend = list(exam_results.values_list("exam_title", "marks_obtained")[:8])
    practice_trend = list(practice_results.values_list("practice_title", "marks_obtained")[:8])
    trend_labels = [x[0] for x in exam_trend] + [x[0] for x in practice_trend]
    trend_scores = [x[1] for x in exam_trend] + [x[1] for x in practice_trend]

    # Subject performance by domain
    subject_scores = {}
    exam_subject_averages = ExamResult.objects.filter(
        student=student_profile,
        exam__isnull=False,
        submission_status__in=["submitted", "accidental_submit", "retaken"]
    ).values('exam__domain__domain_name').annotate(avg_score=Avg('marks_obtained'))
    for entry in exam_subject_averages:
        subject = entry['exam__domain__domain_name'] or 'Unknown'
        subject_scores[subject] = round(entry['avg_score'] or 0, 2)

    practice_subject_averages = PracticeResult.objects.filter(
        student=student_profile,
        practice_test__isnull=False
    ).values('practice_test__domain__domain_name').annotate(avg_score=Avg('marks_obtained'))
    for entry in practice_subject_averages:
        subject = entry['practice_test__domain__domain_name'] or 'Unknown'
        subject_scores[subject] = round(entry['avg_score'] or 0, 2)

    subject_performance = [
        {'subject': name, 'average': avg}
        for name, avg in sorted(subject_scores.items(), key=lambda x: x[1], reverse=True)[:6]
    ]

    # Assigned materials / assignments
    assignment_count = ScheduledMaterial.objects.filter(
        college=student_profile.college,
        course=student_profile.course,
        section=student_profile.section,
        semester=student_profile.semester,
        year=student_profile.year
    ).count()

    # Upcoming exams/practices
    now = timezone.now()
    upcoming_exams = ScheduledExam.objects.filter(
        course=student_profile.course,
        college=student_profile.college,
        semester=student_profile.semester,
        year=student_profile.year,
        start_datetime__gte=now
    ).order_by("start_datetime")[:3]

    upcoming_practices = ScheduledPracticeTest.objects.filter(
        course=student_profile.course,
        college=student_profile.college,
        semester=student_profile.semester,
        year=student_profile.year,
        end_datetime__gte=now
    ).order_by("start_datetime")[:3]

    upcoming_tests = [
        {
            "name": se.exam.title,
            "date": se.start_datetime.strftime("%Y-%m-%d"),
            "duration": f"{(se.end_datetime - se.start_datetime).seconds // 60} min",
            "status": se.status,
        } for se in upcoming_exams
    ] + [
        {
            "name": sp.practice_test.title,
            "date": sp.start_datetime.strftime("%Y-%m-%d"),
            "duration": f"{(sp.end_datetime - sp.start_datetime).seconds // 60} min",
            "status": "Scheduled",
        } for sp in upcoming_practices
    ]

    # Query upcoming scheduled company exams
    from company_prep.models import Company
    from django.db.models import Q
    upcoming_companies = Company.objects.filter(
        is_published=True,
        start_datetime__isnull=False,
        end_datetime__gte=now
    )
    if student_profile.college:
        upcoming_companies = upcoming_companies.filter(Q(college__isnull=True) | Q(college=student_profile.college))
    if student_profile.course:
        upcoming_companies = upcoming_companies.filter(Q(course__isnull=True) | Q(course=student_profile.course))
    upcoming_companies = upcoming_companies.filter(Q(semester__isnull=True) | Q(semester=student_profile.semester))
    if student_profile.section:
        upcoming_companies = upcoming_companies.filter(Q(section__isnull=True) | Q(section=student_profile.section))
    
    upcoming_companies = upcoming_companies.order_by("start_datetime")[:3]
    
    upcoming_tests += [
        {
            "name": f"{c.name} - Placement Prep",
            "date": c.start_datetime.strftime("%Y-%m-%d") if c.start_datetime else "-",
            "duration": f"{c.test_duration_minutes} min",
            "status": "Active" if c.start_datetime <= now else "Scheduled",
        } for c in upcoming_companies
    ]

    # Activity Feed
    activity = []
    if exam_results.exists():
        activity.append(f"Completed exam: {exam_results.last().exam_title}")
    if practice_results.exists():
        activity.append(f"Completed practice: {practice_results.last().practice_title}")
    if total_sessions > 0:
        activity.append(f"Attendance recorded: {present_sessions}/{total_sessions}")

    data = {
        "profile": {
            "name": request.user.get_full_name(),
            "usn": student_profile.usn,
            "course": student_profile.course.name if student_profile.course else None,
            "year": student_profile.year,
            "semester": student_profile.semester,
        },
        "attendance": {
            "present": present_sessions,
            "absent": absent_sessions,
            "percentage": attendance_percent,
            "trend_val": att_metrics["trend_val"],
            "trend_dir": att_metrics["trend_dir"],
            "sparkline": att_metrics["sparkline"],
        },
        "performance": {
            "exam_avg": round(avg_exam, 2),
            "exam_total": round(avg_exam_total, 2),
            "exam_trend_val": exam_metrics["trend_val"],
            "exam_trend_dir": exam_metrics["trend_dir"],
            "exam_sparkline": exam_metrics["sparkline"],
            
            "practice_avg": round(avg_practice, 2),
            "practice_total": round(avg_practice_total, 2),
            "practice_trend_val": practice_metrics["trend_val"],
            "practice_trend_dir": practice_metrics["trend_dir"],
            "practice_sparkline": practice_metrics["sparkline"],
            
            "overall_avg": round(overall_avg, 2),
            "overall_total": round(overall_avg_total, 2),
            "overall_trend_val": abs(overall_trend_val),
            "overall_trend_dir": overall_trend_dir,
            "overall_sparkline": overall_sparkline,
        },
        "counts": {
            "exam_count": exam_results.count(),
            "practice_count": practice_results.count(),
            "assignment_count": assignment_count,
        },
        "trend": {
            "labels": trend_labels,
            "scores": trend_scores,
        },
        "subject_performance": subject_performance,
        "upcoming": upcoming_tests,
        "activity": activity,
    }

    return JsonResponse(data)
    
#--resume---#
@login_required
@user_passes_test(is_student)
def get_uploaded_resumes(request):
    student = StudentProfile.objects.get(user=request.user, is_current=True)
    return JsonResponse({
        'resume_url': student.resume.url if student.resume else ''
    })

@login_required
@user_passes_test(is_student)
def get_domains(request):
    domains = Domain.objects.all().values('id', 'domain_name')
    return JsonResponse(list(domains))


@login_required
@user_passes_test(is_student)
def get_modules(request):
    domain_id = request.GET.get('domain_id')
    modules = Module.objects.filter(domain_id=domain_id).values('id', 'module_name')
    return JsonResponse(list(modules))

@login_required
@user_passes_test(is_student)
def get_materials(request):
    domain_id = request.GET.get('domain')
    module_id = request.GET.get('module')
    materials = ScheduledMaterial.objects.filter(domain_id=domain_id, module_id=module_id).values(
        'id', 'title', 'uploaded_at', 'file_url')
    return JsonResponse(list(materials))

@login_required
@require_POST
@user_passes_test(is_student)
def upload_resume(request):
    resume_file = request.FILES.get('resume')
    if not resume_file:
        return JsonResponse({'status': 'error', 'message': 'No file received'}, status=400)

    profile = StudentProfile.objects.filter(user=request.user, is_current =True).first()
    if not profile:
        return JsonResponse({'status': 'error', 'message': 'StudentProfile not found'}, status=404)

    profile.resume.save(resume_file.name, resume_file)
    profile.save()

    return JsonResponse({'status': 'success'})

@login_required
@user_passes_test(is_student)
def give_student_feedback(request):

    # ---------------------------------------------------
    # 1. Identify current student
    # ---------------------------------------------------
    student = StudentProfile.objects.get(user=request.user, is_current=True)
    today = timezone.now().date()

    print(f"\n Student: {student.user.email}")

    # ---------------------------------------------------
    # 2. Get all days student was PRESENT
    # ---------------------------------------------------
    attended_days = AttendanceRecord.objects.filter(
        student=student,
        status="Present"
    ).values_list(
        "session__date",
        flat=True
    ).distinct()

    attended_days = sorted(set(attended_days))

    # ---------------------------------------------------
    # 3. Find already submitted feedback dates
    # ---------------------------------------------------
    submitted_days = StudentFeedback.objects.filter(
        student=student
    ).values_list("date", flat=True)

    pending_days = [d for d in attended_days if d not in submitted_days]

    print(" Pending Days:", pending_days)

    # ---------------------------------------------------
    # 4. Determine selected feedback day
    # ---------------------------------------------------
    day_str = request.GET.get("day") or request.POST.get("day")

    if day_str:
        try:
            selected_day = datetime.strptime(day_str, "%Y-%m-%d").date()
        except ValueError:
            selected_day = None
    else:
        selected_day = pending_days[0] if pending_days else today

    print("Selected Day:", selected_day)

    # ---------------------------------------------------
    # Prevent URL tampering
    # ---------------------------------------------------
    if selected_day not in attended_days:
        return render(request, "student_feedback.html", {
            "message": " Feedback is allowed only for sessions where you were marked Present.",
            "message_class": "warning",
            "pending_days": pending_days,
            "selected_day": selected_day
        })

    # ---------------------------------------------------
    # 5. Get attended sessions for that day
    # ---------------------------------------------------
    present_records = AttendanceRecord.objects.filter(
        student=student,
        status="Present",
        session__date=selected_day
    ).select_related(
        "session",
        "session__trainer",
        "session__trainer__user"
    )

    sessions_for_feedback = [rec.session for rec in present_records]

    print("Sessions for Feedback:", [
        (s.date, s.slot_no, s.trainer.user.first_name if s.trainer else "None")
        for s in sessions_for_feedback
    ])

    if not sessions_for_feedback:
        return render(request, "student_feedback.html", {
            "message": " No attended sessions found for this day.",
            "message_class": "warning",
            "pending_days": pending_days,
            "selected_day": selected_day
        })

    # ---------------------------------------------------
    # 6. Check if already submitted
    # ---------------------------------------------------
    already_submitted = StudentFeedback.objects.filter(
        student=student,
        date=selected_day
    ).exists()

    if already_submitted:

        next_pending_day = None
        for d in pending_days:
            if d > selected_day:
                next_pending_day = d
                break

        if not next_pending_day and pending_days:
            next_pending_day = pending_days[0]

        if next_pending_day:
            return redirect(
                f"{request.path}?day={next_pending_day.strftime('%Y-%m-%d')}"
            )

        return render(request, "student_feedback.html", {
            "already_submitted": True,
            "selected_day": selected_day,
            "pending_days": pending_days,
            "message": " All feedback submitted successfully.",
            "message_class": "success"
        })

    # ---------------------------------------------------
    # 7. Create Trainer Formset
    # ---------------------------------------------------
    TrainerFormSet = formset_factory(
        SessionTrainerFeedbackForm,
        extra=0
    )

    # ---------------------------------------------------
    # 8. Handle POST submission
    # ---------------------------------------------------
    if request.method == "POST":

        feedback_form = StudentFeedbackForm(
            request.POST,
            prefix="feedback"
        )

        trainer_formset = TrainerFormSet(
            request.POST,
            prefix="form"
        )

        if feedback_form.is_valid() and trainer_formset.is_valid():

            with transaction.atomic():

                # Save general feedback
                feedback = feedback_form.save(commit=False)
                feedback.student = student
                feedback.date = selected_day
                feedback.save()

                # Save trainer feedback
                for form, session in zip(
                        trainer_formset.forms,
                        sessions_for_feedback):

                    if form.cleaned_data:

                        trainer_feedback = form.save(commit=False)
                        trainer_feedback.feedback = feedback
                        trainer_feedback.session = session
                        trainer_feedback.trainer = session.trainer
                        trainer_feedback.save()

            print(" Feedback saved successfully")

            # redirect to next pending
            next_pending_day = None

            for d in pending_days:
                if d > selected_day:
                    next_pending_day = d
                    break

            if not next_pending_day and pending_days:
                next_pending_day = pending_days[0]

            if next_pending_day:
                return redirect(
                    f"{request.path}?day={next_pending_day.strftime('%Y-%m-%d')}"
                )

            return render(request, "student_feedback.html", {
                "already_submitted": True,
                "selected_day": selected_day,
                "pending_days": pending_days,
                "message": " Feedback submitted successfully!",
                "message_class": "success"
            })

    # ---------------------------------------------------
    # 9. Initial GET request
    # ---------------------------------------------------
    else:

        feedback_form = StudentFeedbackForm(prefix="feedback")

        trainer_formset = TrainerFormSet(
            prefix="form",
            initial=[{} for _ in sessions_for_feedback]
        )

    # ---------------------------------------------------
    # 🔟 Attach session object to each form
    # ---------------------------------------------------
    for form, session in zip(trainer_formset.forms, sessions_for_feedback):
        form.session = session

    # ---------------------------------------------------
    # Render template
    # ---------------------------------------------------
    return render(request, "student_feedback.html", {
        "feedback_form": feedback_form,
        "trainer_formset": trainer_formset,
        "pending_days": pending_days,
        "sessions_for_feedback": sessions_for_feedback,
        "selected_day": selected_day,
        "already_submitted": already_submitted,
        "show_form": bool(day_str),
    })

#---- performance dashboard api ---#

@login_required
@user_passes_test(is_student)
def dashboard_api(request):
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student:
        return JsonResponse({"error": "Student profile not found"}, status=404)

    results = ExamResult.objects.filter(
        student=student,
        submission_status__in=["submitted", "accidental_submit", "retaken"]
    )

    total_tests = results.count()

    # OK FIXED: use marks_obtained instead of score
    avg_score = round(results.aggregate(Avg('marks_obtained'))['marks_obtained__avg'] or 0, 2)

    completed_modules = results.values('exam__module').distinct().count()

    now = timezone.now()
    upcoming_qs = (
        ExamResult.objects.filter(student=student, exam__scheduled_date__gte=now)
        .select_related('exam')
        .order_by('exam__scheduled_date')[:5]
    )
    upcoming = []
    for u in upcoming_qs:
        upcoming.append({
            "name": u.exam.title,
            "date": u.exam.scheduled_date.strftime("%Y-%m-%d"),
            "duration": f"{getattr(u.exam, 'duration', '—')} min",
            "status": "Scheduled"
        })

    activity = [f"Scored {r.marks_obtained}/{r.total_marks} in {r.exam.title}" for r in results.order_by('-exam__scheduled_date')[:3]]

    materials_qs = ScheduledMaterial.objects.filter(domain=student.domain).order_by('-uploaded_at')[:3].values('title', 'file_url')
    materials = [{"title": m["title"], "type": m["file_url"].split('.')[-1]} for m in materials_qs]

    perf_qs = results.order_by('exam__scheduled_date').values_list('marks_obtained', flat=True)
    performance_series = list(perf_qs)[-8:]
    labels = [f"Test {i+1}" for i in range(len(performance_series))]

    data = {
        "totalTests": total_tests,
        "avgScore": avg_score,
        "completedModules": completed_modules,
        "upcoming": len(upcoming),
        "activity": activity,
        "materials": materials,
        "upcomingTests": upcoming,
        "performanceSeries": performance_series,
        "labels": labels
    }

    return JsonResponse(data)



#profile view and edit view
# ====================================================
# Student Profile Views
# ====================================================

@login_required
@user_passes_test(is_student)
def student_profile(request):

    profile = get_object_or_404(
        StudentProfile,
        user=request.user,
        is_current=True
    )

    return render(
        request,
        "student_profile.html",
        {
            "profile": profile
        }
    )


@login_required
@user_passes_test(is_student)
def edit_student_profile(request):

    profile = get_object_or_404(
        StudentProfile,
        user=request.user,
        is_current=True
    )

    if request.method == "POST":

        form = StudentProfileUpdateForm(
            request.POST,
            request.FILES,
            instance=profile
        )

        if form.is_valid():
            form.save()

            messages.success(
                request,
                "Profile updated successfully."
            )

            return redirect("student_profile_page")

    else:

        form = StudentProfileUpdateForm(instance=profile)

    return render(
        request,
        "student_profile_edit.html",
        {
            "form": form,
            "profile": profile
        }
    )