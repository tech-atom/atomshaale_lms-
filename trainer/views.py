from django.contrib.auth import login
from django.contrib.auth.decorators import login_required, user_passes_test
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse, HttpResponseForbidden, HttpResponseBadRequest
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.core.exceptions import ValidationError
import json
import openpyxl
from openpyxl.utils import get_column_letter
from trainer.models import TrainerProfile, AttendanceRecord, TrainerSessionReport
from admin_panel.models import SessionSchedule 
from student.models import StudentProfile
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import JsonResponse
import base64, uuid
from django.core.files.base import ContentFile
from material.models import Domain, SubDomain
from college.models import College, Course, Section
from trainer.models import TrainerSessionReport 
import json, base64, uuid, logging
from django.core.files.base import ContentFile


def is_trainer(user):
    return user.is_authenticated and user.role == 'trainer'
def is_admin(user):
    return user.is_authenticated and user.role == 'admin'


@login_required
@user_passes_test(is_trainer)
def trainer_dashboard(request):
    trainer_profile = TrainerProfile.objects.get(user=request.user)
    
    # Fetch all schedules of this trainer
    schedules = SessionSchedule.objects.filter(trainer=trainer_profile)
    
    # 1. Total Classes Conducted (marked as done or has attendance records)
    marked_session_ids = set(
        AttendanceRecord.objects.filter(session__in=schedules)
        .values_list('session_id', flat=True)
    )
    conducted_count = len(marked_session_ids)
    
    # 2. Reports submitted
    reports_submitted = TrainerSessionReport.objects.filter(trainer=trainer_profile).count()
    
    # 3. Pending Reports (marked sessions that do not have a report)
    existing_reports = TrainerSessionReport.objects.filter(trainer=trainer_profile)
    reported_keys = set()
    for r in existing_reports:
        key = (
            r.date,
            r.college_id,
            r.course_id,
            r.semester,
            r.year,
            r.section_id,
            r.domain_id,
            r.subdomain_id
        )
        reported_keys.add(key)
        
    pending_reports_count = 0
    for s in schedules:
        if s.id in marked_session_ids:
            report_key = (
                s.date,
                s.college_id,
                s.course_id,
                s.semester,
                s.year,
                s.section_id,
                s.domain_id,
                s.subdomain_id
            )
            if report_key not in reported_keys:
                pending_reports_count += 1
                
    # 4. Average Attendance Rate
    total_attendance_records = AttendanceRecord.objects.filter(session__in=schedules)
    total_count = total_attendance_records.count()
    present_count = total_attendance_records.filter(status='Present').count()
    attendance_rate = int((present_count / total_count * 100)) if total_count > 0 else 100
    
    # 5. Upcoming Schedule (Next 3 upcoming sessions starting from today)
    today = timezone.localtime(timezone.now()).date()
    upcoming_sessions = SessionSchedule.objects.filter(
        trainer=trainer_profile,
        date__gte=today
    ).select_related('college', 'course', 'section', 'domain', 'subdomain').order_by('date', 'slot_no')[:3]
    
    upcoming_list = []
    for s in upcoming_sessions:
        upcoming_list.append({
            'date': s.date.strftime('%d-%m-%Y'),
            'slot': s.slot_no,
            'college': s.college.name,
            'course': s.course.name,
            'section': s.section.name if s.section else '-',
            'domain': s.domain.domain_name,
            'is_marked': s.id in marked_session_ids
        })
        
    # 6. Recent Reports (Last 3 submitted reports)
    recent_reports = TrainerSessionReport.objects.filter(
        trainer=trainer_profile
    ).select_related('college', 'course', 'domain').order_by('-submitted_at')[:3]
    
    recent_reports_list = []
    for r in recent_reports:
        recent_reports_list.append({
            'date': r.date.strftime('%d-%m-%Y'),
            'college': r.college.name,
            'course': r.course.name,
            'domain': r.domain.domain_name,
            'module': r.module,
            'present': r.present_students,
            'total': r.total_students,
        })

    context = {
        'conducted_count': conducted_count,
        'reports_submitted': reports_submitted,
        'pending_reports_count': pending_reports_count,
        'attendance_rate': attendance_rate,
        'upcoming_sessions': upcoming_list,
        'recent_reports': recent_reports_list,
    }
    
    return render(request, 'trainer_dashboard.html', context)

@login_required
@user_passes_test(is_trainer)
def trainer_profile_page(request):
    return render(request, 'Profile.html')

@login_required
@user_passes_test(is_trainer)
def trainer_attendance_page(request):
    return render(request, 'trainer_attendance.html', {
        'csrf_token': get_token(request)  # Auto-included in base.html usually
    })

@login_required
@user_passes_test(is_trainer)
def trainer_report(request):
    return render(request, 'report.html')


@login_required
@user_passes_test(is_trainer)
def trainer_schedule(request):
    return render(request, 'schedule.html')

# ------------------ API Views ------------------

@login_required
@user_passes_test(is_trainer)
def get_colleges(request):
    try:
        trainer = request.user
        trainer_profile = trainer.trainerprofile

        # Look for colleges via session schedule
        sessions = SessionSchedule.objects.filter(trainer=trainer_profile)
        college_qs = {s.college.id: s.college.name for s in sessions if s.college}
        colleges = [{"id": k, "name": v} for k, v in college_qs.items()]

    except TrainerProfile.DoesNotExist:
        colleges = []

    return JsonResponse(colleges, safe=False)



@login_required
@user_passes_test(is_trainer)
@require_GET
def api_courses(request):
    data = list(Course.objects.values('id', 'name'))
    return JsonResponse(data, safe=False)

@login_required
@user_passes_test(is_trainer)
@require_GET
@login_required
def api_semesters(request):
    semesters = [{'id': i, 'name': f'Semester {i}'} for i in range(1, 13)]
    return JsonResponse({'semesters': semesters})


@require_GET
@login_required
def api_domains(request):
    data = list(Domain.objects.values('id', 'domain_name'))
    for item in data:
        item['name'] = item.pop('domain_name')
    return JsonResponse(data, safe=False)


@login_required
@user_passes_test(is_trainer)
def get_students(request):
    college_id = request.GET.get('collegeId')
    batch_id = request.GET.get('batchId')
    slot_id = request.GET.get('slotId')
    students = StudentProfile.objects.filter(
        college_id=college_id,
        batch_id=batch_id,
        session__slot_id=slot_id
    ).values('usn', 'user__full_name')

    formatted = [
        {'usn': s['usn'], 'name': s['user__full_name']} for s in students
    ]
    return JsonResponse(formatted, safe=True)

 # Use token manually in AJAX for production

@login_required
@user_passes_test(is_admin)
def export_attendance_excel(request):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance"

    headers = ['Date', 'Student USN', 'Student Name', 'Slot', 'Status']
    ws.append(headers)

    attendance_records = AttendanceRecord.objects.select_related('student__user', 'slot').all().order_by('date')

    for record in attendance_records:
        ws.append([
            record.date.strftime("%Y-%m-%d"),
            record.student.usn,
            record.student.user.full_name,
            record.slot.name,
            record.status
        ])

    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column
        for cell in col:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
        ws.column_dimensions[get_column_letter(column)].width = max_length + 2

    response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response['Content-Disposition'] = 'attachment; filename=attendance_report.xlsx'
    wb.save(response)
    return response

# OK API view to fetch schedule for logged-in trainer
# trainer/views.py
@require_GET
@login_required
@user_passes_test(is_trainer)
def get_students_for_session(request, session_id):
    session = get_object_or_404(SessionSchedule, id=session_id)

    if session.trainer != request.user.trainerprofile:
        return HttpResponseForbidden("You are not assigned to this session.")

    students = StudentProfile.objects.filter(
        section=session.section,
        course=session.course,
        semester=session.semester,
        college=session.college
    ).select_related("user")

    # Map student ID to status string ("Present"/"Absent")
    attendance_map = {
        record.student_id: record.status
        for record in AttendanceRecord.objects.filter(session=session)
    }

    data = [{
        "id": str(student.id),
        "user__full_name": student.user.get_full_name(),
        "roll_number": student.usn,  # OK use 'usn' as 'roll_number'
        "existing_status": attendance_map.get(student.id, "")  # OK JS expects this exact key
    } for student in students]

    return JsonResponse(data, safe=False)



@login_required
@user_passes_test(is_trainer)
def trainer_attendance_view(request):
    sessions = SessionSchedule.objects.filter(trainer=request.user.trainerprofile).order_by('-date')
    return render(request, 'trainer_attendance.html', {
        'sessions': sessions,
        'csp_nonce': request.csp_nonce,
    })

@require_POST
@login_required
@user_passes_test(is_trainer)
def submit_attendance(request):
    try:
        session_id = request.POST.get("session_id")
        if not session_id:
            return HttpResponseBadRequest("Missing session ID.")

        # Ensure session exists and belongs to this trainer
        session = SessionSchedule.objects.get(id=session_id, trainer=request.user.trainerprofile)

        # Load students of that session (matching session college, course, semester, section)
        students = StudentProfile.objects.filter(
            section=session.section,
            course=session.course,
            semester=session.semester,
            college=session.college
        )

        updated = 0
        for student in students:
            status_key = f"status_{student.id}"
            status = request.POST.get(status_key)

            if status not in ["Present", "Absent"]:
                continue  # skip if invalid or missing

            AttendanceRecord.objects.update_or_create(
                session=session,
                student=student,
                defaults={"status": status}
            )
            updated += 1

        # Mark the session as done
        session.done = True
        session.save()

        return JsonResponse({"success": True, "updated": updated})

    except SessionSchedule.DoesNotExist:
        return HttpResponseForbidden("You are not assigned to this session.")
    except Exception as e:
        return HttpResponseBadRequest(f"Unexpected error: {str(e)}")


    
#--------------TRAINER PROFILE------------#
@require_POST
@login_required
@user_passes_test(is_trainer)
def upload_trainer_profile(request):
    pdf_file = request.FILES.get('profile_pdf')
    if not pdf_file:
        return JsonResponse({'success': False, 'errors': 'No PDF uploaded'}, status=400)

    try:
        filename = f'trainer_profile_{uuid.uuid4().hex}.pdf'
        profile, _ = TrainerProfile.objects.get_or_create(user=request.user)
        profile.profile_pdf.save(filename, pdf_file, save=True)
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'errors': str(e)}, status=500)

@require_POST
@login_required
@user_passes_test(is_trainer)
def save_trainer_pdf(request):
    try:
        pdf_file = request.FILES.get("profile_pdf")

        if not pdf_file:
            return JsonResponse({
                "success": False,
                "error": "No PDF uploaded"
            }, status=400)

        profile = TrainerProfile.objects.get(user=request.user)

        filename = f"trainer_profile_{request.user.id}.pdf"

        profile.profile_pdf.save(
            filename,
            pdf_file,
            save=True
        )

        return JsonResponse({
            "success": True,
            "file_url": profile.profile_pdf.url
        })

    except Exception as e:
        return JsonResponse({
            "success": False,
            "error": str(e)
        }, status=500)




@require_GET
@login_required
@user_passes_test(is_trainer)
def trainer_schedule_api(request):
    try:
        trainer_profile = TrainerProfile.objects.get(user=request.user)
    except TrainerProfile.DoesNotExist:
        return JsonResponse({"error": "Trainer profile not found."}, status=404)

    # Fetch all sessions assigned to this trainer
    sessions = SessionSchedule.objects.filter(trainer=trainer_profile).select_related(
        'college', 'section', 'course', 'domain', 'subdomain'
    ).order_by('date', 'slot_no')

    # Optimize attendance check
    attended_ids = set(
        AttendanceRecord.objects.filter(session__in=sessions)
        .values_list('session_id', flat=True)
    )

    # Optimize report check
    existing_reports = TrainerSessionReport.objects.filter(trainer=trainer_profile)
    reported_keys = set()
    for r in existing_reports:
        key = (
            r.date,
            r.college_id,
            r.course_id,
            r.semester,
            r.year,
            r.section_id,
            r.domain_id,
            r.subdomain_id
        )
        reported_keys.add(key)

    schedule_data = []
    for session in sessions:
        report_key = (
            session.date,
            session.college_id,
            session.course_id,
            session.semester,
            session.year,
            session.section_id,
            session.domain_id,
            session.subdomain_id
        )
        schedule_data.append({
            "session_id": str(session.id),
            "date": session.date.strftime("%Y-%m-%d"),
            "collegeName": session.college.name if session.college else "—",
            "batch": session.section.name if session.section else "—",
            "session": f"Slot {session.slot_no}",
            "slotNo": session.slot_no,
            "is_attendance_marked": session.id in attended_ids,
            "has_report": report_key in reported_keys
        })

    return JsonResponse({"schedule": schedule_data})


################## Trainer Daily Report #######################

@require_POST
@login_required
@user_passes_test(is_trainer)
def submit_trainer_report(request):
    try:
        data = json.loads(request.body)
        trainer_profile = TrainerProfile.objects.get(user=request.user)

        report = TrainerSessionReport.objects.create(
            trainer=trainer_profile,
            date=data["date"],
            college_id=data["college"],
            course_id=data["course"],
            semester=int(data["semester"]),
            year=int(data["year"]),
            section_id=data.get("section") or None,
            domain_id=data["domain"],
            subdomain_id=data.get("subdomain") or None,
            module=data["module"],
            total_students=int(data["total_students"]),
            present_students=int(data["present_students"]),
            absent_students=int(data["absent_students"]),
            exercises_solved=data["exercises_solved"],
            materials_shared=data["materials_shared"],
            assignments_given=data["assignments_given"],

            summary=data["summary"],
        )

        return JsonResponse({"success": True, "message": "Report submitted successfully!"})

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=400)


@require_GET
@login_required
@user_passes_test(is_trainer)
def trainer_report_list(request):
    trainer_profile = TrainerProfile.objects.get(user=request.user)
    reports = TrainerSessionReport.objects.filter(trainer=trainer_profile).order_by('-date')

    data = [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "college": r.college.name,
            "course": r.course.name,
            "semester": r.semester,
            "domain": r.domain.domain_name,
            "module": r.module,
            "total_students": r.total_students,
            "present_students": r.present_students,
            "absent_students": r.absent_students,
            "materials_shared": r.materials_shared,
            "assignments_given": r.assignments_given,
        }
        for r in reports
    ]

    return JsonResponse({"reports": data})

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_colleges(request):
    """Fetch all colleges for the trainer."""
    try:
        trainer_profile = request.user.trainerprofile
        sessions = SessionSchedule.objects.filter(trainer=trainer_profile).select_related('college')
        college_dict = {s.college.id: s.college.name for s in sessions if s.college}
        colleges = [{"id": k, "name": v} for k, v in college_dict.items()]
        return JsonResponse(colleges, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_courses(request):
    """Fetch all available courses."""
    data = list(Course.objects.values('id', 'name'))
    return JsonResponse(data, safe=False)

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_semesters(request):
    """Fetch semesters (1–12)."""
    semesters = [{'id': i, 'name': f'Semester {i}'} for i in range(1, 13)]
    return JsonResponse({'semesters': semesters})

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_years(request):
    """Fetch years (1–5)."""
    years = [{'id': i, 'name': f'Year {i}'} for i in range(1, 6)]
    return JsonResponse({'years': years})

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_sections(request):
    """Fetch all sections."""
    data = list(Section.objects.values('name'))
    for item in data:
        item['id'] = item['name']
        item['name'] = item['name']
    return JsonResponse(data, safe=False)

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_domains(request):
    """Fetch all domains."""
    data = list(Domain.objects.values('id', 'domain_name'))
    for item in data:
        item['name'] = item.pop('domain_name')
    return JsonResponse(data, safe=False)

@login_required
@user_passes_test(is_trainer)
@require_GET
def api_subdomains(request):
    """Fetch subdomains, filtered by domain if provided."""
    domain_id = request.GET.get('domain_id')
    if domain_id:
        data = list(SubDomain.objects.filter(domain_id=domain_id).values('id', 'subdomain_name'))
    else:
        data = list(SubDomain.objects.values('id', 'subdomain_name'))
    for item in data:
        item['name'] = item.pop('subdomain_name')
    return JsonResponse(data, safe=False)



@login_required
@user_passes_test(is_trainer)
def update_trainer_report(request, report_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Invalid method"})

    try:
        data = json.loads(request.body)

        report = TrainerSessionReport.objects.get(id=report_id)

        report.summary = data.get("sessionSummary")
        report.present_students = data.get("presentStudents")
        report.absent_students = data.get("absentStudents")
        report.materials_shared = data.get("notesShared")
        report.assignments_given = data.get("assignmentsGiven")

        report.save()

        return JsonResponse({"success": True})

    except TrainerSessionReport.DoesNotExist:
        return JsonResponse({"success": False, "error": "Report not found"})

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


# =============== TRAINER EXAM MONITORING VIEWS ===============

@login_required
@user_passes_test(is_trainer)
def trainer_exam_monitor(request):
    """Display exam monitoring page for trainer"""
    return render(request, 'trainer_exam_monitor.html')

@login_required
@user_passes_test(is_trainer)
@require_GET
def trainer_exam_monitor_list(request):
    """Get list of exams assigned to this trainer for monitoring"""
    try:
        from exam.models import ScheduledExam
        from exam.views import check_and_update_scheduled_exams
        check_and_update_scheduled_exams()
        trainer_profile = TrainerProfile.objects.get(user=request.user)
        
        # Get exams where this trainer is assigned for monitoring
        exams = ScheduledExam.objects.filter(
            monitor_trainers=trainer_profile,
            live_exam_monitor=True,
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
        logging.exception("Error fetching trainer exam monitor list")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@login_required
@user_passes_test(is_trainer)
@require_GET
def trainer_exam_monitor_detail(request, schedule_id):
    """Get detailed live monitoring data for a specific exam."""
    try:
        from exam.models import ScheduledExam
        from exam.views import _build_live_monitor_payload
        trainer_profile = TrainerProfile.objects.get(user=request.user)
        
        # Verify this trainer has access to monitor this exam
        schedule = ScheduledExam.objects.get(
            id=schedule_id,
            monitor_trainers=trainer_profile,
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
        logging.exception("Error fetching exam monitor detail")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_trainer)
@require_GET
def get_marked_sessions_for_reports(request):
    """Fetch marked session schedules with metrics for auto-population"""
    try:
        from admin_panel.models import SessionSchedule
        from trainer.models import AttendanceRecord, TrainerSessionReport
        
        trainer_profile = TrainerProfile.objects.get(user=request.user)
        
        # Get all sessions of this trainer
        sessions = SessionSchedule.objects.filter(
            trainer=trainer_profile
        ).select_related('college', 'course', 'section', 'domain', 'subdomain', 'module').order_by('-date')
        
        # A session has attendance marked if there is at least one AttendanceRecord for it
        marked_session_ids = set(
            AttendanceRecord.objects.filter(session__in=sessions)
            .values_list('session_id', flat=True)
        )
        
        # Get existing reports for this trainer
        existing_reports = TrainerSessionReport.objects.filter(trainer=trainer_profile)
        reported_keys = set()
        for r in existing_reports:
            key = (
                r.date,
                r.college_id,
                r.course_id,
                r.semester,
                r.year,
                r.section_id,
                r.domain_id,
                r.subdomain_id
            )
            reported_keys.add(key)
            
        data = []
        for s in sessions:
            if s.id not in marked_session_ids:
                continue
                
            report_key = (
                s.date,
                s.college_id,
                s.course_id,
                s.semester,
                s.year,
                s.section_id,
                s.domain_id,
                s.subdomain_id
            )
            if report_key in reported_keys:
                continue
                
            records = AttendanceRecord.objects.filter(session=s)
            total_students = records.count()
            present_students = records.filter(status='Present').count()
            absent_students = total_students - present_students
            
            if total_students == 0:
                from student.models import StudentProfile
                total_students = StudentProfile.objects.filter(
                    college=s.college,
                    course=s.course,
                    section=s.section,
                    semester=s.semester
                ).count()
                present_students = 0
                absent_students = total_students
                
            data.append({
                "session_id": str(s.id),
                "date": s.date.strftime("%Y-%m-%d"),
                "slot_no": s.slot_no,
                "college_id": str(s.college_id),
                "college_name": s.college.name,
                "course_id": s.course_id,
                "course_name": s.course.name,
                "year": s.year,
                "semester": s.semester,
                "section_id": s.section_id,
                "section_name": s.section.name if s.section else "-",
                "domain_id": s.domain_id,
                "domain_name": s.domain.domain_name,
                "subdomain_id": s.subdomain_id,
                "subdomain_name": s.subdomain.subdomain_name if s.subdomain else "-",
                "module_id": str(s.module_id) if s.module_id else "",
                "module_name": s.module.module_name if s.module else "",
                "total_students": total_students,
                "present_students": present_students,
                "absent_students": absent_students,
                "label": f"Slot {s.slot_no} | {s.date.strftime('%d-%m-%Y')} | {s.college.name} | {s.course.name} (Sec {s.section.name if s.section else '-'})"
            })
            
        return JsonResponse({"sessions": data})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@user_passes_test(is_trainer)
@require_GET
def api_modules(request):
    """Fetch all modules based on domain and optional subdomain for trainer Daily Report"""
    try:
        from material.models import Module
        domain_id = request.GET.get('domain_id')
        subdomain_id = request.GET.get('subdomain_id')
        
        filters = {}
        if domain_id:
            filters['domain_id'] = domain_id
        if subdomain_id:
            filters['subdomain_id'] = subdomain_id
            
        modules = Module.objects.filter(**filters).values('id', 'module_name')
        data = [{'id': str(m['id']), 'name': m['module_name']} for m in modules]
        return JsonResponse(data, safe=False)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

