from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import JsonResponse, HttpResponse
from django.db.models import Avg, Q, Count
from django.utils import timezone
import json
import random
from student.models import StudentProfile
from .models import Company, CompanyQuestionPaper, CompanyAptitudeQuestion, CompanyTechnicalQuestion, StudentCompanyProgress, StudentPrepAttempt, AIInterviewAttempt
from .seeding import seed_company_prep
from college.models import College, Course, Section

# Roles
def is_student(user):
    return user.is_authenticated and (user.role == 'student' or user.role == 'admin')

def is_tpo(user):
    return user.is_authenticated and (user.role == 'tpo' or user.role == 'admin')

# Automatically seed data if empty when visiting listing
def ensure_seeded():
    pass

@login_required
@user_passes_test(is_student)
@login_required
@user_passes_test(is_student)
def company_list(request):
    if request.GET.get('reseed') == 'true':
        Company.objects.all().delete()
        CompanyAptitudeQuestion.objects.all().delete()
        CompanyTechnicalQuestion.objects.all().delete()
        seed_company_prep()
    else:
        ensure_seeded()
    
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return render(request, 'no_profile.html')

    query = request.GET.get('q', '').strip()
    
    if not request.user.role == 'admin':
        # For students, only show published companies
        companies = Company.objects.filter(is_published=True).order_by('name', '-year')
        
        # Filter by college/course/semester/section if they are configured
        if student:
            q_filter = Q(college__isnull=True)
            if student.college:
                q_filter |= Q(college=student.college)
            companies = companies.filter(q_filter)
            
            q_course = Q(course__isnull=True)
            if student.course:
                q_course |= Q(course=student.course)
            companies = companies.filter(q_course)
            
            companies = companies.filter(Q(semester__isnull=True) | Q(semester=student.semester))
            
            q_sec = Q(section__isnull=True)
            if student.section:
                q_sec |= Q(section=student.section)
            companies = companies.filter(q_sec)
    else:
        companies = Company.objects.all().order_by('name', '-year')

    if query:
        companies = companies.filter(name__icontains=query)

    # Group by name
    from collections import defaultdict
    grouped = defaultdict(list)
    for c in companies:
        grouped[c.name].append(c)

    companies_list = []
    for name, company_instances in grouped.items():
        main_c = company_instances[0]
        papers = []
        for inst in company_instances:
            resume_score = calculate_mock_resume_match(student, inst)[0]
            progress, created = StudentCompanyProgress.objects.get_or_create(
                student=student,
                company=inst,
                defaults={
                    'overall_progress': 0,
                    'resume_match': resume_score,
                    'placement_readiness': 0,
                    'aptitude_score': 0,
                    'technical_score': 0,
                    'communication_score': 0,
                    'mock_interview_score': 0
                }
            )
            
            # Recalculate progress using only Aptitude, Technical and Resume match
            aptitude_attempts = StudentPrepAttempt.objects.filter(student=student, company=inst, round_type='Aptitude').order_by('-created_at')
            technical_attempts = StudentPrepAttempt.objects.filter(student=student, company=inst, round_type='Technical').order_by('-created_at')
            last_apt = aptitude_attempts.first()
            last_tech = technical_attempts.first()
            
            if last_apt:
                progress.aptitude_score = last_apt.score
            if last_tech:
                progress.technical_score = last_tech.score
            progress.resume_match = resume_score

            overall = 0
            if last_apt:
                overall += 50
            if last_tech:
                overall += 50
            progress.overall_progress = min(overall, 100)

            scores_to_avg = [progress.aptitude_score, progress.technical_score]
            active_scores = [s for s in scores_to_avg if s > 0]
            if active_scores:
                progress.placement_readiness = int(sum(active_scores) / len(active_scores))
            else:
                progress.placement_readiness = 0
            progress.save()

            now = timezone.now()
            schedule_status = "active"
            if inst.start_datetime and now < inst.start_datetime:
                schedule_status = "future"
            elif inst.end_datetime and now > inst.end_datetime:
                schedule_status = "expired"

            papers.append({
                'company_id': inst.id,
                'year': inst.year,
                'progress': progress,
                'schedule_status': schedule_status,
                'start_datetime': inst.start_datetime,
                'end_datetime': inst.end_datetime,
                'college': inst.college
            })

        papers.sort(key=lambda x: x['year'], reverse=True)

        companies_list.append({
            'name': name,
            'logo': main_c.logo,
            'package': main_c.package,
            'job_role': main_c.job_role,
            'skills_required': main_c.skills_required,
            'papers': papers,
            'latest_paper_id': papers[0]['company_id'] if papers else None,
            'latest_progress': papers[0]['progress'] if papers else None
        })

    return render(request, 'company_list.html', {
        'companies': companies_list,
        'q': query,
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'student_base.html'
    })

@login_required
@user_passes_test(is_student)
def company_dashboard(request, company_id):
    ensure_seeded()
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return render(request, 'no_profile.html')

    company = get_object_or_404(Company, id=company_id)
    
    # Schedule check
    now = timezone.now()
    schedule_status = "active"
    if company.start_datetime and now < company.start_datetime:
        schedule_status = "future"
    elif company.end_datetime and now > company.end_datetime:
        schedule_status = "expired"

    # Enforce target audience bounds & publish status
    is_eligible = True
    if not request.user.role == 'admin':
        # Check eligibility for this specific paper
        specific_eligible = True
        if not company.is_published:
            specific_eligible = False
        if company.college and (not student or company.college != student.college):
            specific_eligible = False
        if company.course and (not student or company.course != student.course):
            specific_eligible = False
        if company.semester and (not student or company.semester != student.semester):
            specific_eligible = False
        if company.section and (not student or company.section != student.section):
            specific_eligible = False

        # If not eligible for this specific paper, check if eligible for any other paper of the same company
        if not specific_eligible:
            other_papers_for_name = Company.objects.filter(name=company.name)
            any_eligible = False
            for p in other_papers_for_name:
                p_eligible = True
                if not p.is_published:
                    p_eligible = False
                if p.college and (not student or p.college != student.college):
                    p_eligible = False
                if p.course and (not student or p.course != student.course):
                    p_eligible = False
                if p.semester and (not student or p.semester != student.semester):
                    p_eligible = False
                if p.section and (not student or p.section != student.section):
                    p_eligible = False
                
                if p_eligible:
                    any_eligible = True
                    break
            
            if not any_eligible:
                is_eligible = False
            else:
                # Override to let them take historical papers for practice
                schedule_status = "active"
            
    if not is_eligible:
        return redirect('company_prep:company_list')
        
    # Calculate resume matching and missing skills
    resume_score, missing_skills = calculate_mock_resume_match(student, company)

    # Get student progress
    progress, created = StudentCompanyProgress.objects.get_or_create(
        student=student,
        company=company,
        defaults={
            'resume_match': resume_score,
        }
    )
    if progress.resume_match != resume_score:
        progress.resume_match = resume_score
        progress.save()

    branch = map_student_course_to_branch(student)

    # Get historical attempts
    aptitude_attempts = StudentPrepAttempt.objects.filter(student=student, company=company, round_type='Aptitude').order_by('-created_at')
    technical_attempts = StudentPrepAttempt.objects.filter(student=student, company=company, round_type='Technical').order_by('-created_at')

    last_aptitude = aptitude_attempts.first()
    last_technical = technical_attempts.first()
    last_interview = None

    # Set score progress
    if last_aptitude:
        progress.aptitude_score = last_aptitude.score
    if last_technical:
        progress.technical_score = last_technical.score
    progress.mock_interview_score = 0
    progress.communication_score = 0

    # Determine enabled rounds
    has_aptitude = company.round1_active
    has_technical = company.round2_active

    aptitude_attempts_count = aptitude_attempts.count()
    technical_attempts_count = technical_attempts.count()

    # Calculate overall progress and readiness
    overall = 0
    if has_aptitude and last_aptitude:
        overall += 100 if not has_technical else 50
    if has_technical and last_technical:
        overall += 100 if not has_aptitude else 50
    
    scores_to_avg = []
    if has_aptitude and progress.aptitude_score > 0:
        scores_to_avg.append(progress.aptitude_score)
    if has_technical and progress.technical_score > 0:
        scores_to_avg.append(progress.technical_score)
    
    progress.overall_progress = min(overall, 100)

    # Placement Readiness: Average of active scores
    if scores_to_avg:
        progress.placement_readiness = int(sum(scores_to_avg) / len(scores_to_avg))
    elif has_aptitude and last_aptitude:
        progress.placement_readiness = progress.aptitude_score
    elif has_technical and last_technical:
        progress.placement_readiness = progress.technical_score
    else:
        progress.placement_readiness = 0
    progress.save()

    # Get custom learning path
    learning_path = get_learning_path(company.name)

    # Expected interview date representation
    if company.expected_interview_date:
        days_left = max((company.expected_interview_date - timezone.localdate()).days, 0)
    else:
        days_left = 30

    other_papers = Company.objects.filter(name=company.name).order_by('-year')

    return render(request, 'company_dashboard.html', {
        'company': company,
        'progress': progress,
        'branch': branch,
        'missing_skills': missing_skills,
        'learning_path': learning_path,
        'days_left': days_left,
        'last_aptitude': last_aptitude,
        'last_technical': last_technical,
        'last_interview': last_interview,
        'other_papers': other_papers,
        'has_aptitude': has_aptitude,
        'has_technical': has_technical,
        'schedule_status': schedule_status,
        'is_eligible': is_eligible,
        'aptitude_attempts_count': aptitude_attempts_count,
        'technical_attempts_count': technical_attempts_count,
        'max_attempts': company.max_attempts,
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'student_base.html'
    })

@login_required
@user_passes_test(is_student)
def aptitude_test(request, company_id, difficulty):
    ensure_seeded()
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return render(request, 'no_profile.html')

    company = get_object_or_404(Company, id=company_id)
    
    # Enforce schedule eligibility check
    now = timezone.now()
    is_eligible = True
    bypass_schedule = False
    if not request.user.role == 'admin':
        specific_eligible = True
        if not company.is_published:
            specific_eligible = False
        if company.college and (not student or company.college != student.college):
            specific_eligible = False
        if company.course and (not student or company.course != student.course):
            specific_eligible = False
        if company.semester and (not student or company.semester != student.semester):
            specific_eligible = False
        if company.section and (not student or company.section != student.section):
            specific_eligible = False

        if not specific_eligible:
            other_papers_for_name = Company.objects.filter(name=company.name)
            any_eligible = False
            for p in other_papers_for_name:
                p_eligible = True
                if not p.is_published:
                    p_eligible = False
                if p.college and (not student or p.college != student.college):
                    p_eligible = False
                if p.course and (not student or p.course != student.course):
                    p_eligible = False
                if p.semester and (not student or p.semester != student.semester):
                    p_eligible = False
                if p.section and (not student or p.section != student.section):
                    p_eligible = False
                
                if p_eligible:
                    any_eligible = True
                    break
            
            if not any_eligible:
                is_eligible = False
            else:
                bypass_schedule = True
            
    if not is_eligible:
        return redirect('company_prep:company_dashboard', company_id=company.id)

    if not bypass_schedule:
        if company.start_datetime and now < company.start_datetime:
            return redirect('company_prep:company_dashboard', company_id=company.id)
        if company.end_datetime and now > company.end_datetime:
            return redirect('company_prep:company_dashboard', company_id=company.id)

    # Enforce max attempts check
    attempts_count = StudentPrepAttempt.objects.filter(student=student, company=company, round_type='Aptitude').count()
    if attempts_count >= company.max_attempts:
        return redirect('company_prep:company_dashboard', company_id=company.id)

    # Initialize/reset session variables for the test
    session_key = f"company_prep_answers_{company.id}_Aptitude"
    tab_key = f"company_prep_tab_switches_{company.id}_Aptitude"
    session_questions_key = f"company_prep_question_ids_{company.id}_Aptitude"
    
    request.session[session_key] = {}
    request.session[tab_key] = 0
    request.session[f"company_prep_start_time_{company.id}_Aptitude"] = timezone.now().isoformat()
    if session_questions_key in request.session:
        del request.session[session_questions_key]
    request.session.modified = True

    return render(request, 'company_prep_take_exam.html', {
        'company': company,
        'test_type': 'Aptitude',
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'student_base.html'
    })

@login_required
@user_passes_test(is_student)
def technical_test(request, company_id):
    ensure_seeded()
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return render(request, 'no_profile.html')

    company = get_object_or_404(Company, id=company_id)
    
    # Enforce schedule eligibility check
    now = timezone.now()
    is_eligible = True
    bypass_schedule = False
    if not request.user.role == 'admin':
        specific_eligible = True
        if not company.is_published:
            specific_eligible = False
        if company.college and (not student or company.college != student.college):
            specific_eligible = False
        if company.course and (not student or company.course != student.course):
            specific_eligible = False
        if company.semester and (not student or company.semester != student.semester):
            specific_eligible = False
        if company.section and (not student or company.section != student.section):
            specific_eligible = False

        if not specific_eligible:
            other_papers_for_name = Company.objects.filter(name=company.name)
            any_eligible = False
            for p in other_papers_for_name:
                p_eligible = True
                if not p.is_published:
                    p_eligible = False
                if p.college and (not student or p.college != student.college):
                    p_eligible = False
                if p.course and (not student or p.course != student.course):
                    p_eligible = False
                if p.semester and (not student or p.semester != student.semester):
                    p_eligible = False
                if p.section and (not student or p.section != student.section):
                    p_eligible = False
                
                if p_eligible:
                    any_eligible = True
                    break
            
            if not any_eligible:
                is_eligible = False
            else:
                bypass_schedule = True
            
    if not is_eligible:
        return redirect('company_prep:company_dashboard', company_id=company.id)

    if not bypass_schedule:
        if company.start_datetime and now < company.start_datetime:
            return redirect('company_prep:company_dashboard', company_id=company.id)
        if company.end_datetime and now > company.end_datetime:
            return redirect('company_prep:company_dashboard', company_id=company.id)

    # Enforce max attempts check
    attempts_count = StudentPrepAttempt.objects.filter(student=student, company=company, round_type='Technical').count()
    if attempts_count >= company.max_attempts:
        return redirect('company_prep:company_dashboard', company_id=company.id)

    # Enforce Round 1 completion first if Round 1 is active
    if company.round1_active:
        aptitude_attempts_count = StudentPrepAttempt.objects.filter(student=student, company=company, round_type='Aptitude').count()
        if aptitude_attempts_count == 0:
            return redirect('company_prep:company_dashboard', company_id=company.id)

    # Initialize/reset session variables for the test
    session_key = f"company_prep_answers_{company.id}_Technical"
    tab_key = f"company_prep_tab_switches_{company.id}_Technical"
    session_questions_key = f"company_prep_question_ids_{company.id}_Technical"
    
    request.session[session_key] = {}
    request.session[tab_key] = 0
    request.session[f"company_prep_start_time_{company.id}_Technical"] = timezone.now().isoformat()
    if session_questions_key in request.session:
        del request.session[session_questions_key]
    request.session.modified = True

    return render(request, 'company_prep_take_exam.html', {
        'company': company,
        'test_type': 'Technical',
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'student_base.html'
    })

@login_required
@user_passes_test(is_student)
def ai_interview(request, company_id):
    ensure_seeded()
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return render(request, 'no_profile.html')

    company = get_object_or_404(Company, id=company_id)
    questions = get_company_specific_interview_questions(company.name)

    return render(request, 'ai_interview.html', {
        'company': company,
        'student': student,
        'questions_json': json.dumps(questions),
        'questions': questions,
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'student_base.html'
    })

@login_required
@user_passes_test(is_student)
def submit_interview(request, company_id):
    if request.method == 'POST':
        student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
        if not student and request.user.role == 'admin':
            student = StudentProfile.objects.first()
        if not student:
            return JsonResponse({'error': 'Student profile not found'}, status=400)

        company = get_object_or_404(Company, id=company_id)
        
        try:
            data = json.loads(request.body)
            feedback_data = data.get('feedback_details', [])
            
            # Scores (Simulated or calculated based on keyword matching)
            confidence = data.get('confidence', random.randint(85, 95))
            communication = data.get('communication', random.randint(80, 93))
            eye_contact = data.get('eye_contact', random.randint(75, 88))
            grammar = data.get('grammar', random.randint(88, 97))
            
            # Overall Score is average of scores
            overall_score = int((confidence + communication + eye_contact + grammar) / 4)
            
            recommendation = "Likely to Clear HR Round" if overall_score >= 80 else "Needs Practice (HR Round)"

            # Save the interview attempt
            attempt = AIInterviewAttempt.objects.create(
                student=student,
                company=company,
                overall_score=overall_score,
                confidence=confidence,
                communication=communication,
                eye_contact=eye_contact,
                grammar=grammar,
                recommendation=recommendation,
                feedback_details=feedback_data
            )

            # Update student overall progress & readiness
            progress = StudentCompanyProgress.objects.filter(student=student, company=company).first()
            if progress:
                progress.mock_interview_score = max(progress.mock_interview_score, overall_score)
                progress.communication_score = max(progress.communication_score, communication)
                progress.save()

            return JsonResponse({
                'status': 'success',
                'attempt_id': str(attempt.id),
                'score': overall_score,
                'recommendation': recommendation
            })
            
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'POST method required'}, status=405)

# Recruiter (TPO) Views
@login_required
@user_passes_test(is_tpo)
def tpo_dashboard(request):
    ensure_seeded()
    companies = Company.objects.all().order_by('name')
    
    companies_data = []
    for c in companies:
        # Count students preparing
        student_count = StudentCompanyProgress.objects.filter(company=c, overall_progress__gt=0).count()
        # Avg Placement readiness score
        avg_readiness = StudentCompanyProgress.objects.filter(company=c, overall_progress__gt=0).aggregate(Avg('placement_readiness'))['placement_readiness__avg'] or 0
        
        companies_data.append({
            'company': c,
            'student_count': student_count,
            'avg_readiness': int(avg_readiness)
        })

    return render(request, 'tpo_company_prep_dashboard.html', {
        'companies': companies_data,
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'tpo_base.html'
    })

@login_required
@user_passes_test(is_tpo)
def tpo_company_detail(request, company_id):
    ensure_seeded()
    company = get_object_or_404(Company, id=company_id)
    
    # Get all student progress entries for this company
    progress_entries = StudentCompanyProgress.objects.filter(company=company).select_related('student', 'student__user', 'student__course')
    
    candidates = []
    recommended = []
    
    for entry in progress_entries:
        cand_info = {
            'student': entry.student,
            'name': entry.student.user.get_full_name() or entry.student.user.email,
            'branch': entry.student.course.name,
            'aptitude': entry.aptitude_score,
            'technical': entry.technical_score,
            'resume_ats': entry.resume_match,
            'readiness': entry.placement_readiness,
            'overall_progress': entry.overall_progress
        }
        candidates.append(cand_info)
        
        # Recommendation logic: placement readiness >= 80%
        if entry.placement_readiness >= 80:
            recommended.append(cand_info)

    return render(request, 'tpo_company_detail.html', {
        'company': company,
        'candidates': candidates,
        'recommended': recommended,
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'tpo_base.html'
    })


# Helper Methods
def map_student_course_to_branch(student):
    if not student or not student.course:
        return 'CSE'
    course_name = student.course.name.upper()
    if any(k in course_name for k in ['CSE', 'COMP', 'CS', 'INFO', 'MCA', 'SOFTWARE']):
        return 'CSE'
    if any(k in course_name for k in ['ECE', 'ENTC', 'TELE', 'EEE', 'ELECT', 'SIGNAL', 'PCB']):
        return 'ECE'
    if any(k in course_name for k in ['MECH', 'ME', 'AUTO', 'CAD', 'CNC']):
        return 'Mechanical'
    if any(k in course_name for k in ['CIVIL', 'CV', 'SURVEY', 'STEEL']):
        return 'Civil'
    if any(k in course_name for k in ['MBA', 'MGMT', 'BUSI', 'MARKET', 'FINA', 'HR']):
        return 'MBA'
    return 'CSE'

def calculate_mock_resume_match(student, company):
    """
    Computes a simulated ATS score based on skills matched and branch suitability.
    Returns: (score, list of missing skills)
    """
    if not student:
        return (0, company.skills_required)

    # Base match calculation based on branch matching
    branch = map_student_course_to_branch(student)
    base_match = 50
    
    # Specific branch checks
    if company.name in ['Bosch', 'Mercedes-Benz', 'ABB'] and branch == 'ECE':
        base_match = 65
    elif company.name in ['Google', 'Cisco', 'Siemens'] and branch == 'CSE':
        base_match = 70
    elif company.name in ['Toyota', 'L&T', 'Mahindra'] and branch in ['Mechanical', 'Civil']:
        base_match = 65
    elif company.name in ['Deloitte', 'EY'] and branch == 'MBA':
        base_match = 68

    # Random offset based on student name to keep it consistent per student
    random.seed(str(student.id) + company.name)
    score = base_match + random.randint(10, 25)
    
    # cap score at 95
    score = min(score, 95)

    # Determine missing skills based on score
    skills = company.skills_required
    num_missing = max(1, int(len(skills) * (1 - score / 100.0)))
    missing_skills = random.sample(skills, min(num_missing, len(skills)))

    return (score, missing_skills)

def get_learning_path(company_name):
    paths = {
        'Bosch': [
            {'week': 'Week 1', 'topic': 'Embedded C & Register Configurations'},
            {'week': 'Week 2', 'topic': 'Real-Time Operating Systems (RTOS)'},
            {'week': 'Week 3', 'topic': 'CAN, SPI, and I2C Protocols'},
            {'week': 'Week 4', 'topic': 'Embedded Testing & Mock Interview'}
        ],
        'Google': [
            {'week': 'Week 1', 'topic': 'Advanced Data Structures & Algorithms'},
            {'week': 'Week 2', 'topic': 'Dynamic Programming & Graph Theory'},
            {'week': 'Week 3', 'topic': 'System Design & Distributed Systems'},
            {'week': 'Week 4', 'topic': 'Googliness Mock Interview & Behavior'}
        ],
        'TCS': [
            {'week': 'Week 1', 'topic': 'Programming Foundation (C/C++/Java)'},
            {'week': 'Week 2', 'topic': 'OOPS Concepts & SQL Queries'},
            {'week': 'Week 3', 'topic': 'TCS NQT Previous Year Quantitative Questions'},
            {'week': 'Week 4', 'topic': 'Technical & HR Mock Interview'}
        ],
        'Toyota': [
            {'week': 'Week 1', 'topic': 'Lean Manufacturing & 5S Principles'},
            {'week': 'Week 2', 'topic': 'Kaizen & Six Sigma Quality Control'},
            {'week': 'Week 3', 'topic': 'Mechanical Design & GD&T Basics'},
            {'week': 'Week 4', 'topic': 'Toyota Production System Mock Prep'}
        ],
        'Deloitte': [
            {'week': 'Week 1', 'topic': 'Advanced Excel Formulas & Charting'},
            {'week': 'Week 2', 'topic': 'Power BI Dashboards & SQL Queries'},
            {'week': 'Week 3', 'topic': 'Case Study Analysis & Business Cases'},
            {'week': 'Week 4', 'topic': 'Client Communication & Presentation Mock'}
        ]
    }
    
    # Return matched path, or a generic path
    return paths.get(company_name, [
        {'week': 'Week 1', 'topic': 'Quantitative Aptitude & Logical Reasoning'},
        {'week': 'Week 2', 'topic': 'Core Technical Subjects & SQL'},
        {'week': 'Week 3', 'topic': 'Coding Practise & Projects Walkthrough'},
        {'week': 'Week 4', 'topic': 'AI Video Interview & Behavior Prep'}
    ])

def get_company_specific_interview_questions(company_name):
    # Questions structure: [{'question': str, 'best_answer': str, 'feedback_good': str, 'feedback_bad': str}]
    questions = {
        'TCS': [
            {
                'question': 'Tell me about yourself.',
                'best_answer': 'I am a final year student specializing in technical engineering. I have hands-on experience in building systems using Python and Java, and I am highly passionate about joining TCS because of its learning opportunities.',
                'feedback_good': 'Excellent structured response highlighting background and motivation.',
                'feedback_bad': 'Response was a bit brief and lacked mention of key technical projects.'
            },
            {
                'question': 'What is the difference between a Stack and a Queue?',
                'best_answer': 'A Stack is a LIFO (Last In First Out) structure where insertions and deletions happen from the same end, whereas a Queue is a FIFO (First In First Out) structure where insertion happens at the rear and deletion at the front.',
                'feedback_good': 'Accurate definitions of LIFO and FIFO with operational differences.',
                'feedback_bad': 'Failed to mention where insertions and deletions occur in each structure.'
            },
            {
                'question': 'Explain the concept of Object-Oriented Programming (OOPS).',
                'best_answer': 'OOP is a paradigm centered around objects. Its core pillars are Inheritance (reusability), Polymorphism (multiple forms), Abstraction (hiding details), and Encapsulation (binding data and code).',
                'feedback_good': 'Clearly defined all four pillars of OOPS with simple explanations.',
                'feedback_bad': 'Forgot to mention Abstraction or Polymorphism in detail.'
            },
            {
                'question': 'Why do you want to join TCS?',
                'best_answer': 'TCS is a global IT leader providing a massive learning platform. The Initial Learning Program (ILP) is highly regarded, and working here will allow me to solve large-scale problems.',
                'feedback_good': 'Demonstrates good awareness of TCS culture and training programs.',
                'feedback_bad': 'Lacked enthusiasm and did not connect personal growth to company values.'
            }
        ],
        'Bosch': [
            {
                'question': 'Explain Pulse Width Modulation (PWM).',
                'best_answer': 'PWM is a technique to control analog power using digital signals. By varying the duty cycle (ratio of ON time to total period), we adjust the average voltage delivered to loads like motors or LEDs.',
                'feedback_good': 'Correctly explained duty cycle and how it modifies average voltage.',
                'feedback_bad': 'Did not define duty cycle or mention its application in voltage regulation.'
            },
            {
                'question': 'What is the difference between SPI and I2C protocols?',
                'best_answer': 'SPI is a 4-wire, full-duplex protocol that is faster but uses more pins. I2C is a 2-wire (SDA/SCL), half-duplex protocol that supports multi-masters and uses fewer pins.',
                'feedback_good': 'Accurately compared line counts, duplex capabilities, and masters.',
                'feedback_bad': 'Confused wire counts or did not specify duplex configurations.'
            },
            {
                'question': 'Explain how UART communication works.',
                'best_answer': 'UART is a serial, asynchronous protocol using two wires (TX/RX). It packages bytes with start, data, parity, and stop bits. It relies on pre-configured baud rates instead of a clock line.',
                'feedback_good': 'Highlighted asynchronous nature and packaging (start/stop bits).',
                'feedback_bad': 'Forgot to state that UART is asynchronous and does not require a clock line.'
            },
            {
                'question': 'Why is Embedded C preferred over regular C in microcontroller programming?',
                'best_answer': 'Embedded C includes extensions for hardware access like fixed-point arithmetic, SFR mapping, and direct port manipulation, allowing low-level access while maintaining portability.',
                'feedback_good': 'Accurately identified port mapping and hardware extensions.',
                'feedback_bad': 'Stated generic programming differences without mentioning hardware registers.'
            }
        ],
        'Toyota': [
            {
                'question': 'What do you understand by Lean Manufacturing?',
                'best_answer': 'Lean Manufacturing is a methodology focused on minimizing waste (Muda) within manufacturing systems while maximizing productivity and customer value.',
                'feedback_good': 'Strong definition focusing on waste minimization and value creation.',
                'feedback_bad': 'Did not explain the concept of waste minimization.'
            },
            {
                'question': 'Explain Kaizen and how it benefits manufacturing.',
                'best_answer': 'Kaizen stands for continuous improvement. It involves all employees from CEOs to assembly line workers suggesting small, incremental changes to improve efficiency and reduce defects.',
                'feedback_good': 'Excellent explanation of continuous improvement and employee inclusion.',
                'feedback_bad': 'Described it as a one-time process rather than continuous improvement.'
            },
            {
                'question': 'What are the 5S principles?',
                'best_answer': '5S represents: Sort (Seiri), Set in order (Seiton), Shine (Seiso), Standardize (Seiketsu), and Sustain (Shitsuke). It ensures a clean, organized, and safe workplace.',
                'feedback_good': 'Correctly named and explained the five principles of 5S.',
                'feedback_bad': 'Could not list all five S components correctly.'
            }
        ],
        'Deloitte': [
            {
                'question': 'How do you clean and transform data in Excel before visualization?',
                'best_answer': 'I use Power Query to remove duplicates, handle blank rows, format data types, and merge tables, ensuring the clean source is ready for Excel formulas or Power BI.',
                'feedback_good': 'Correctly identified Power Query and data cleaning procedures.',
                'feedback_bad': 'Failed to mention standard cleaning steps like deduplication and formatting.'
            },
            {
                'question': 'What is a Star Schema in SQL and Power BI?',
                'best_answer': 'A Star Schema is a database layout consisting of a central Fact Table containing metrics, linked to surrounding Dimension Tables containing descriptive attributes.',
                'feedback_good': 'Correctly defined relationship between Fact and Dimension tables.',
                'feedback_bad': 'Confused Fact tables with Dimension tables.'
            },
            {
                'question': 'How do you communicate complex technical findings to a non-technical client?',
                'best_answer': 'I focus on business outcomes and KPIs, use visual charts like Power BI instead of database logs, and explain variables using metaphors instead of technical jargon.',
                'feedback_good': 'Demonstrates consulting mindset, prioritizing business metrics over jargon.',
                'feedback_bad': 'Focuses too much on technical terms instead of business value.'
            }
        ]
    }
    
    return questions.get(company_name, [
        {
            'question': 'Tell me about yourself.',
            'best_answer': 'I am a dedicated student. I have worked on projects in my domain and developed solid team cooperation and problem-solving skills.',
            'feedback_good': 'Clear and polite introduction.',
            'feedback_bad': 'Introduce your specific projects and key contributions.'
        },
        {
            'question': 'What is your greatest strength and weakness?',
            'best_answer': 'My strength is adaptability and analytical skill. My weakness is that I sometimes focus too much on details, but I am learning to manage my time better.',
            'feedback_good': 'Honest reflection with an action plan for the weakness.',
            'feedback_bad': 'Weakness should be structured with how you are actively overcoming it.'
        },
        {
            'question': 'Why should we hire you for this company?',
            'best_answer': 'My technical foundation aligns with your required stack. I am highly motivated and quick to learn, meaning I will start contributing quickly.',
            'feedback_good': 'Assertive response linking skills to company requirements.',
            'feedback_bad': 'Connect your answer to specific goals of the company.'
        }
    ])

@login_required
@user_passes_test(is_tpo)
def admin_placement(request):
    ensure_seeded()
    all_companies = Company.objects.all().order_by('name', '-year')
    
    # Group by name
    grouped = {}
    for comp in all_companies:
        name = comp.name
        if name not in grouped:
            grouped[name] = {
                'name': name,
                'logo': comp.logo,
                'papers': []
            }
        grouped[name]['papers'].append(comp)
        
    grouped_companies = list(grouped.values())
    grouped_companies.sort(key=lambda x: x['name'].lower())
    
    aptitude_count = CompanyAptitudeQuestion.objects.count()
    technical_count = CompanyTechnicalQuestion.objects.count()
    total_papers = all_companies.count()
    
    colleges = College.objects.filter(is_active=True).order_by('name')
    courses = Course.objects.all().order_by('name')
    sections = Section.objects.all().order_by('name')

    return render(request, 'admin_placement.html', {
        'grouped_companies': grouped_companies,
        'aptitude_count': aptitude_count,
        'technical_count': technical_count,
        'total_papers': total_papers,
        'colleges': colleges,
        'courses': courses,
        'sections': sections
    })

def _parse_company_excel_questions(company, excel_file):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(excel_file)
        sheet = wb.active
        for row_idx, row in enumerate(sheet.iter_rows(values_only=True), start=1):
            if row_idx == 1 or not row or not any(row):
                continue
            
            # Simple pattern: Question | Option A | Option B | Option C | Option D | Correct Answer
            # Handle both 6-column simple pattern and legacy 10-column pattern
            first_cell = str(row[0] or "").strip()
            if not first_cell:
                continue

            if first_cell.lower() in ["aptitude", "technical", "round type"]:
                # Legacy 10-column row
                round_type = first_cell
                topic = str(row[1] or "General").strip()
                diff_or_branch = str(row[2] or "Medium").strip()
                question_text = str(row[3] or "").strip()
                if not question_text:
                    continue
                opt_a = str(row[4] or "").strip() if len(row) > 4 else ""
                opt_b = str(row[5] or "").strip() if len(row) > 5 else ""
                opt_c = str(row[6] or "").strip() if len(row) > 6 else ""
                opt_d = str(row[7] or "").strip() if len(row) > 7 else ""
                options = [opt for opt in [opt_a, opt_b, opt_c, opt_d] if opt]
                correct_ans = str(row[8] or (options[0] if options else "")).strip() if len(row) > 8 else (options[0] if options else "")
                explanation = str(row[9] or "").strip() if len(row) > 9 else ""
            else:
                # Clean 6-column pattern: Question | Option A | Option B | Option C | Option D | Correct Answer
                question_text = first_cell
                opt_a = str(row[1] or "").strip() if len(row) > 1 else ""
                opt_b = str(row[2] or "").strip() if len(row) > 2 else ""
                opt_c = str(row[3] or "").strip() if len(row) > 3 else ""
                opt_d = str(row[4] or "").strip() if len(row) > 4 else ""
                options = [opt for opt in [opt_a, opt_b, opt_c, opt_d] if opt]
                correct_ans = str(row[5] or (options[0] if options else "")).strip() if len(row) > 5 else (options[0] if options else "")
                explanation = ""

            # Save to Aptitude question bank for this company
            CompanyAptitudeQuestion.objects.create(
                company=company,
                topic='Quantitative Aptitude',
                difficulty='Medium',
                question_text=question_text,
                options=options,
                correct_answer=correct_ans,
                explanation=explanation
            )
            # Save to Technical question bank for this company
            CompanyTechnicalQuestion.objects.create(
                company=company,
                branch='CSE',
                topic='Technical Domain',
                type='MCQ',
                question_text=question_text,
                options=options,
                correct_answer=correct_ans,
                explanation=explanation
            )
    except Exception as e:
        print(f"Error parsing question excel: {e}")

@login_required
@user_passes_test(is_tpo)
def download_sample_excel(request):
    try:
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sample Questions"
        
        headers = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer"]
        ws.append(headers)
        
        ws.append(["What is the average of first 5 natural numbers?", "2", "3", "4", "5", "3"])
        ws.append(["Find the next in series: 2, 4, 6, 8, ?", "9", "10", "11", "12", "10"])
        ws.append(["What is the worst-case time complexity of QuickSort?", "O(N)", "O(N log N)", "O(N^2)", "O(1)", "O(N^2)"])
        
        response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response['Content-Disposition'] = 'attachment; filename="Company_Questions_Sample.xlsx"'
        wb.save(response)
        return response
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@login_required
@user_passes_test(is_tpo)
@login_required
@user_passes_test(is_tpo)
def admin_company_create(request):
    colleges = College.objects.all().order_by('name')
    if request.method == 'POST':
        name = request.POST.get('name')
        logo = request.FILES.get('logo')
        
        # Check if year is provided, if not default to None (Simple Step 1 Add)
        year_val = request.POST.get('year')
        year = int(year_val) if year_val else None
        
        # Default other fields
        technical_round_format = request.POST.get('technical_round_format', 'MCQ')
        test_duration_minutes = int(request.POST.get('test_duration_minutes', 15)) if request.POST.get('test_duration_minutes') else 15
        
        job_role = request.POST.get('job_role', 'General')
        package = request.POST.get('package', 'N/A')
        place = request.POST.get('place', 'N/A')

        # Schedule & Access Control
        college_id = request.POST.get('target_college')
        college = College.objects.filter(id=college_id).first() if college_id else None
        start_datetime = request.POST.get('start_datetime')
        end_datetime = request.POST.get('end_datetime')
        
        # Build selection process from checkboxes
        stages = []
        if 'stage_aptitude' in request.POST or request.POST.get('round1_active') == 'true':
            stages.append("Round 1: Aptitude")
        if 'stage_technical' in request.POST or request.POST.get('round2_active') == 'true':
            stages.append("Round 2: Technical & Coding")
        selection_process = " -> ".join(stages) if stages else "Direct Interview"
        
        # Check if a company with this name and year=None exists (Step 2 year update)
        existing_none_year = Company.objects.filter(name__iexact=name, year__isnull=True).first()
        if existing_none_year and year:
            existing_none_year.year = year
            existing_none_year.test_duration_minutes = test_duration_minutes
            existing_none_year.job_role = job_role
            existing_none_year.package = package
            existing_none_year.place = place
            if logo:
                existing_none_year.logo = logo
            existing_none_year.save()
            company = existing_none_year
        else:
            # If we are adding a year paper, and the company already has a logo elsewhere, let's copy the logo!
            final_logo = logo
            if not final_logo:
                sibling = Company.objects.filter(name__iexact=name).exclude(logo='').first()
                if sibling:
                    final_logo = sibling.logo

            company = Company.objects.create(
                name=name,
                logo=final_logo,
                year=year,
                technical_round_format=technical_round_format,
                test_duration_minutes=test_duration_minutes,
                selection_process=selection_process,
                college=college,
                start_datetime=start_datetime if start_datetime else None,
                end_datetime=end_datetime if end_datetime else None,
                job_role=job_role,
                package=package,
                place=place
            )

        if 'question_excel' in request.FILES and request.FILES['question_excel']:
            _parse_company_excel_questions(company, request.FILES['question_excel'])
        if 'technical_question_excel' in request.FILES and request.FILES['technical_question_excel']:
            _parse_company_excel_questions(company, request.FILES['technical_question_excel'])

        # Save multiple year question papers
        multi_years = request.POST.getlist('multi_paper_year')
        multi_files = request.FILES.getlist('multi_paper_file')
        multi_formats = request.POST.getlist('multi_technical_round_format')
        
        for idx, (py, pf) in enumerate(zip(multi_years, multi_files)):
            if py and pf:
                try:
                    fmt = multi_formats[idx] if idx < len(multi_formats) else 'MCQ'
                    paper_obj = CompanyQuestionPaper.objects.create(
                        company=company,
                        year=int(py),
                        selection_process="Round 1: Aptitude -> Round 2: Technical & Coding",
                        technical_round_format=fmt,
                        paper_file=pf
                    )
                    if pf.name.endswith('.xlsx') or pf.name.endswith('.xls'):
                        _parse_company_excel_questions(company, pf)
                except Exception as e:
                    print(f"Error saving question paper: {e}")

        if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.POST.get('ajax') == 'true':
            return JsonResponse({'status': 'success', 'message': 'Company created successfully!', 'company_id': str(company.id)})
        return redirect('company_prep:admin_placement')
    
    prefilled_name = request.GET.get('name', '')
    return render(request, 'admin_company_form.html', {
        'title': 'Add Company Paper',
        'company': None,
        'colleges': colleges,
        'has_aptitude': True,
        'has_technical': True,
        'has_hr': False,
        'prefilled_name': prefilled_name
    })

@login_required
@user_passes_test(is_tpo)
def admin_company_edit(request, company_id):
    company = get_object_or_404(Company, id=company_id)
    colleges = College.objects.all().order_by('name')
    
    if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.GET.get('json') == 'true':
        if request.method == 'GET':
            has_aptitude = "Aptitude" in company.selection_process or "Round 1" in company.selection_process
            has_technical = "Technical" in company.selection_process or "Coding" in company.selection_process or "Round 2" in company.selection_process
            return JsonResponse({
                'status': 'success',
                'company': {
                    'id': str(company.id),
                    'name': company.name,
                    'year': company.year,
                    'technical_round_format': company.technical_round_format,
                    'test_duration_minutes': company.test_duration_minutes,
                    'college_id': str(company.college.id) if company.college else '',
                    'start_datetime': company.start_datetime.strftime('%Y-%m-%dT%H:%M') if company.start_datetime else '',
                    'end_datetime': company.end_datetime.strftime('%Y-%m-%dT%H:%M') if company.end_datetime else '',
                    'has_aptitude': has_aptitude,
                    'has_technical': has_technical,
                    'logo_url': company.logo.url if company.logo else '',
                    'job_role': company.job_role,
                    'package': company.package,
                    'place': company.place
                }
            })
            
    if request.method == 'POST':
        company.name = request.POST.get('name')
        
        if 'logo' in request.FILES:
            company.logo = request.FILES['logo']
            
        if request.POST.get('year'):
            company.year = int(request.POST.get('year'))
        company.technical_round_format = request.POST.get('technical_round_format', 'MCQ')
        if request.POST.get('test_duration_minutes'):
            company.test_duration_minutes = int(request.POST.get('test_duration_minutes'))
            
        company.job_role = request.POST.get('job_role', 'General')
        company.package = request.POST.get('package', 'N/A')
        company.place = request.POST.get('place', 'N/A')

        # Schedule & Access Control
        college_id = request.POST.get('target_college')
        company.college = College.objects.filter(id=college_id).first() if college_id else None
        start_datetime = request.POST.get('start_datetime')
        end_datetime = request.POST.get('end_datetime')
        company.start_datetime = start_datetime if start_datetime else None
        company.end_datetime = end_datetime if end_datetime else None
        
        # Build selection process from checkboxes
        stages = []
        if 'stage_aptitude' in request.POST:
            stages.append("Round 1: Aptitude")
        if 'stage_technical' in request.POST:
            stages.append("Round 2: Technical & Coding")
        company.selection_process = " -> ".join(stages) if stages else "Direct Interview"
        company.save()

        if 'question_excel' in request.FILES and request.FILES['question_excel']:
            _parse_company_excel_questions(company, request.FILES['question_excel'])
        if 'technical_question_excel' in request.FILES and request.FILES['technical_question_excel']:
            _parse_company_excel_questions(company, request.FILES['technical_question_excel'])

        # Delete existing question paper if requested
        delete_paper_id = request.POST.get('delete_paper_id')
        if delete_paper_id:
            CompanyQuestionPaper.objects.filter(id=delete_paper_id, company=company).delete()

        # Save multiple year question papers
        multi_years = request.POST.getlist('multi_paper_year')
        multi_files = request.FILES.getlist('multi_paper_file')
        multi_formats = request.POST.getlist('multi_technical_round_format')
        
        for idx, (py, pf) in enumerate(zip(multi_years, multi_files)):
            if py and pf:
                try:
                    fmt = multi_formats[idx] if idx < len(multi_formats) else 'MCQ'
                    paper_obj = CompanyQuestionPaper.objects.create(
                        company=company,
                        year=int(py),
                        selection_process="Round 1: Aptitude -> Round 2: Technical & Coding",
                        technical_round_format=fmt,
                        paper_file=pf
                    )
                    if pf.name.endswith('.xlsx') or pf.name.endswith('.xls'):
                        _parse_company_excel_questions(company, pf)
                except Exception as e:
                    print(f"Error saving question paper: {e}")

        if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.POST.get('ajax') == 'true':
            return JsonResponse({'status': 'success', 'message': 'Company paper settings updated successfully!'})
        return redirect('company_prep:admin_placement')
        
    has_aptitude = "Aptitude" in company.selection_process or "Round 1" in company.selection_process
    has_technical = "Technical" in company.selection_process or "Coding" in company.selection_process or "Round 2" in company.selection_process
    
    return render(request, 'admin_company_form.html', {
        'title': f'Edit Company Paper: {company.name}',
        'company': company,
        'colleges': colleges,
        'existing_papers': company.question_papers.all(),
        'has_aptitude': has_aptitude,
        'has_technical': has_technical,
        'has_hr': False
    })

@login_required
@user_passes_test(is_tpo)
def admin_company_delete(request, company_id):
    company = get_object_or_404(Company, id=company_id)
    company.delete()
    if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.POST.get('ajax') == 'true' or request.GET.get('ajax') == 'true':
        return JsonResponse({'status': 'success', 'message': 'Company paper deleted successfully!'})
    return redirect('company_prep:admin_placement')

@login_required
@user_passes_test(is_tpo)
def admin_question_create(request, q_type):
    companies = Company.objects.all().order_by('name')
    if request.method == 'POST':
        company_id = request.POST.get('company')
        company = Company.objects.filter(id=company_id).first() if company_id else None
        
        topic = request.POST.get('topic')
        question_text = request.POST.get('question_text')
        correct_answer = request.POST.get('correct_answer')
        explanation = request.POST.get('explanation')
        q_mode = request.POST.get('type', 'MCQ')
        image = request.FILES.get('image')
        
        opts = [
            request.POST.get('option_0', '').strip(),
            request.POST.get('option_1', '').strip(),
            request.POST.get('option_2', '').strip(),
            request.POST.get('option_3', '').strip()
        ]
        opts = [o for o in opts if o]
        
        if q_mode == 'TF':
            opts = ['True', 'False']

        if q_type == 'aptitude':
            difficulty = request.POST.get('difficulty', 'Medium')
            CompanyAptitudeQuestion.objects.create(
                company=company,
                topic=topic,
                difficulty=difficulty,
                question_text=question_text,
                options=opts if q_mode == 'MCQ' else (['True', 'False'] if q_mode == 'TF' else []),
                correct_answer=correct_answer,
                explanation=explanation,
                type=q_mode,
                image=image
            )
        else:
            branch = request.POST.get('branch')
            CompanyTechnicalQuestion.objects.create(
                company=company,
                branch=branch,
                topic=topic,
                type=q_mode,
                question_text=question_text,
                options=opts if q_mode == 'MCQ' else (['True', 'False'] if q_mode == 'TF' else []),
                correct_answer=correct_answer,
                explanation=explanation,
                image=image
            )
        return redirect('company_prep:admin_placement')
        
    return render(request, 'admin_question_form.html', {
        'title': f'Add {q_type.title()} Question',
        'q_type': q_type,
        'companies': companies,
        'question': None
    })

@login_required
@user_passes_test(is_tpo)
def admin_question_edit(request, q_type, q_id):
    companies = Company.objects.all().order_by('name')
    if q_type == 'aptitude':
        question = get_object_or_404(CompanyAptitudeQuestion, id=q_id)
    else:
        question = get_object_or_404(CompanyTechnicalQuestion, id=q_id)
        
    if request.method == 'POST':
        company_id = request.POST.get('company')
        question.company = Company.objects.filter(id=company_id).first() if company_id else None
        
        question.topic = request.POST.get('topic')
        question.question_text = request.POST.get('question_text')
        question.correct_answer = request.POST.get('correct_answer')
        question.explanation = request.POST.get('explanation')
        q_mode = request.POST.get('type', 'MCQ')
        question.type = q_mode
        
        # Handle Image
        if request.POST.get('delete_image') == 'true':
            if question.image:
                question.image.delete(save=False)
            question.image = None
        if request.FILES.get('image'):
            question.image = request.FILES.get('image')

        opts = [
            request.POST.get('option_0', '').strip(),
            request.POST.get('option_1', '').strip(),
            request.POST.get('option_2', '').strip(),
            request.POST.get('option_3', '').strip()
        ]
        opts = [o for o in opts if o]
        
        if q_mode == 'TF':
            opts = ['True', 'False']
        
        if q_type == 'aptitude':
            question.difficulty = request.POST.get('difficulty', 'Medium')
            question.options = opts if q_mode == 'MCQ' else (['True', 'False'] if q_mode == 'TF' else [])
        else:
            question.branch = request.POST.get('branch')
            question.options = opts if q_mode == 'MCQ' else (['True', 'False'] if q_mode == 'TF' else [])
            
        question.save()
        return redirect('company_prep:admin_placement')
        
    opt_0 = question.options[0] if len(question.options) > 0 else ""
    opt_1 = question.options[1] if len(question.options) > 1 else ""
    opt_2 = question.options[2] if len(question.options) > 2 else ""
    opt_3 = question.options[3] if len(question.options) > 3 else ""
    
    return render(request, 'admin_question_form.html', {
        'title': f'Edit {q_type.title()} Question',
        'q_type': q_type,
        'companies': companies,
        'question': question,
        'opt_0': opt_0,
        'opt_1': opt_1,
        'opt_2': opt_2,
        'opt_3': opt_3
    })

@login_required
@user_passes_test(is_tpo)
def admin_question_delete(request, q_type, q_id):
    if q_type == 'aptitude':
        question = get_object_or_404(CompanyAptitudeQuestion, id=q_id)
    else:
        question = get_object_or_404(CompanyTechnicalQuestion, id=q_id)
    question.delete()
    return redirect('company_prep:admin_placement')

@login_required
@user_passes_test(is_tpo)
def admin_bulk_upload(request):
    if request.method == 'POST':
        company_id = request.POST.get('company')
        category = request.POST.get('category')
        file = request.FILES.get('file')
        
        if not file:
            return JsonResponse({'status': 'error', 'message': 'No file uploaded.'})
            
        company = Company.objects.filter(id=company_id).first() if company_id else None
        if not company:
            return JsonResponse({'status': 'error', 'message': 'Invalid company specified.'})
            
        name = file.name.lower()
        rows = []
        
        try:
            if name.endswith('.xlsx') or name.endswith('.xls'):
                import openpyxl
                wb = openpyxl.load_workbook(file)
                ws = wb.active
                headers = [str(c.value).strip().lower() if c.value is not None else "" for c in next(ws.iter_rows(min_row=1, max_row=1))]
                for r in ws.iter_rows(min_row=2, values_only=True):
                    row = {headers[i]: ("" if r[i] is None else str(r[i]).strip()) for i in range(len(headers)) if i < len(headers)}
                    rows.append(row)
            elif name.endswith('.csv'):
                import csv, io
                text = file.read().decode('utf-8-sig')
                reader = csv.DictReader(io.StringIO(text))
                for r in reader:
                    row = {k.strip().lower(): v.strip() for k, v in r.items()}
                    rows.append(row)
            
            uploaded_count = 0
            for row in rows:
                topic = row.get('topic', 'General')
                q_text = row.get('question_text', '')
                if not q_text:
                    continue
                    
                correct = row.get('correct_answer', '')
                explanation = row.get('explanation', '')
                
                # Extract options
                opts = []
                for key in ['option_a', 'option_b', 'option_c', 'option_d', 'option a', 'option b', 'option c', 'option d']:
                    if key in row and row[key]:
                        opts.append(row[key])
                
                if category == 'aptitude':
                    diff = row.get('difficulty', 'Medium').title()
                    if diff not in ['Easy', 'Medium', 'Hard']:
                        diff = 'Medium'
                    CompanyAptitudeQuestion.objects.create(
                        company=company,
                        topic=topic,
                        difficulty=diff,
                        question_text=q_text,
                        options=opts,
                        correct_answer=correct,
                        explanation=explanation
                    )
                    uploaded_count += 1
                else:
                    branch = row.get('branch', 'CSE').upper()
                    q_mode = row.get('type', 'MCQ').upper()
                    if q_mode not in ['MCQ', 'CODE']:
                        q_mode = 'MCQ'
                    CompanyTechnicalQuestion.objects.create(
                        company=company,
                        branch=branch if branch in ['CSE', 'ECE', 'MECHANICAL', 'CIVIL', 'MBA'] else 'CSE',
                        topic=topic,
                        type=q_mode,
                        question_text=q_text,
                        options=opts if q_mode == 'MCQ' else [],
                        correct_answer=correct,
                        explanation=explanation
                    )
                    uploaded_count += 1
            return JsonResponse({'status': 'success', 'message': f'Successfully uploaded {uploaded_count} questions!'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'Error parsing file: {str(e)}'})
            
    return JsonResponse({'status': 'error', 'message': 'Invalid request method.'})


# =====================================================================
# Placement/Company Prep Exam Console APIs
# =====================================================================
import datetime
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt
from exam.views import evaluate_code_with_test_cases

@login_required
@user_passes_test(is_student)
@login_required
@user_passes_test(is_student)
def api_get_test_meta(request, company_id, test_type):
    company = get_object_or_404(Company, id=company_id)
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
        
    fake_start = timezone.now()
    fake_end = fake_start + datetime.timedelta(days=365)
    
    if test_type == 'Aptitude':
        duration = company.round1_duration
        passing_pct = company.round1_passing_pct
    else:
        duration = company.round2_duration
        passing_pct = company.round2_passing_pct
        
    attempts_count = StudentPrepAttempt.objects.filter(student=student, company=company, round_type=test_type).count() if student else 0
    
    exam_data = [{
        "scheduled_exam_id": str(company.id),
        "exam_id": str(company.id),
        "title": f"{company.name} - {test_type} Practice",
        "duration": duration,
        "allowed_tab_switches": 3,
        "start": fake_start.isoformat(),
        "end": fake_end.isoformat(),
        "start_display": fake_start.strftime("%d-%m-%Y"),
        "start_time_display": fake_start.strftime("%I:%M %p"),
        "end_display": fake_end.strftime("%d-%m-%Y"),
        "end_time_display": fake_end.strftime("%I:%M %p"),
        "max_marks": 100.0,
        "passing_marks": float(passing_pct),
        "already_attempted": attempts_count >= company.max_attempts,
    }]
    return JsonResponse({"exams": exam_data})

@login_required
@user_passes_test(is_student)
def api_get_test_questions(request, company_id, test_type):
    company = get_object_or_404(Company, id=company_id)
    session_questions_key = f"company_prep_question_ids_{company.id}_{test_type}"
    question_ids = request.session.get(session_questions_key)
    
    if question_ids:
        if test_type == 'Aptitude':
            q_map = {str(q.id): q for q in CompanyAptitudeQuestion.objects.filter(id__in=question_ids)}
            questions = [q_map[str(qid)] for qid in question_ids if str(qid) in q_map]
        else:
            q_map = {str(q.id): q for q in CompanyTechnicalQuestion.objects.filter(id__in=question_ids)}
            questions = [q_map[str(qid)] for qid in question_ids if str(qid) in q_map]
    else:
        if test_type == 'Aptitude':
            company_qs = list(CompanyAptitudeQuestion.objects.filter(company=company))
            target_count = company.round1_questions
            # If no company-specific questions exist, fall back to general questions
            if len(company_qs) == 0:
                general_qs = list(CompanyAptitudeQuestion.objects.filter(company__isnull=True))
                company_qs.extend(random.sample(general_qs, min(len(general_qs), target_count)))
            
            questions = company_qs
            if company.shuffle_questions:
                random.shuffle(questions)
            questions = questions[:target_count]
        else:
            student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
            if not student and request.user.role == 'admin':
                student = StudentProfile.objects.first()
            branch = map_student_course_to_branch(student)
            target_count = company.round2_questions
            
            fmt = company.round2_technical_format # 'MCQ', 'Coding', 'MCQ_Coding'
            
            company_qs = CompanyTechnicalQuestion.objects.filter(company=company)
            if fmt == 'MCQ':
                company_qs = company_qs.filter(type='MCQ')
            elif fmt == 'Coding':
                company_qs = company_qs.filter(type='Code')
            company_qs = list(company_qs)
            
            # If no company-specific questions exist, fall back to general questions
            if len(company_qs) == 0:
                general_qs = CompanyTechnicalQuestion.objects.filter(company__isnull=True)
                if fmt == 'MCQ':
                    general_qs = general_qs.filter(type='MCQ')
                elif fmt == 'Coding':
                    general_qs = general_qs.filter(type='Code')
                general_qs = list(general_qs)
                company_qs.extend(random.sample(general_qs, min(len(general_qs), target_count)))
                
            questions = company_qs
            if company.shuffle_questions:
                random.shuffle(questions)
            questions = questions[:target_count]
                
        request.session[session_questions_key] = [str(q.id) for q in questions]
        request.session.modified = True
        
    question_data = []
    for q in questions:
        q_type = getattr(q, 'type', 'MCQ')
        if q_type == 'CODE' or q_type == 'Code':
            q_type = 'Code'
        elif q_type == 'TF' or q_type == 'TrueFalse':
            q_type = 'TF'
        else:
            q_type = 'MCQ'
            
        negative_val = 0.0
        if company.negative_marking:
            negative_val = -1.0 if q_type == "Code" else -0.25
            
        item = {
            "id": str(q.id),
            "text": q.question_text,
            "type": q_type,
            "section_tag": getattr(q, "topic", "General"),
            "marks": 5.0 if q_type == "Code" else 1.0,
            "negative": negative_val,
            "image_url": q.image.url if getattr(q, "image", None) else None,
        }
        
        if q_type in ["MCQ", "TF"]:
            if q_type == "TF":
                item["options"] = ["True", "False"]
            else:
                options = list(q.options) if q.options else []
                if company.shuffle_options:
                    random.shuffle(options)
                item["options"] = options
                
        if q_type == "Code":
            item["input_example"] = getattr(q, 'input_example', '') or ''
            item["expected_output"] = getattr(q, 'expected_output', '') or ''
            item["test_cases"] = getattr(q, 'test_cases', []) or []
            
        question_data.append(item)
        
    session_answers_key = f"company_prep_answers_{company.id}_{test_type}"
    saved_answers = request.session.get(session_answers_key, {})
    
    return JsonResponse({
        "exam_id": str(company.id),
        "exam_title": f"{company.name} - {test_type} Practice",
        "duration_minutes": company.test_duration_minutes,
        "allowed_tab_switches": 3,
        "questions": question_data,
        "saved_answers": saved_answers
    })

@csrf_exempt
@require_POST
@login_required
@user_passes_test(is_student)
def api_live_update(request, company_id, test_type):
    try:
        data = json.loads(request.body or "{}")
        tab_switch_count = int(data.get("tab_switch_count", 0))
        temp_answers_list = data.get("temp_answers", [])
        
        answers_map = {}
        for item in temp_answers_list:
            q_id = str(item.get("question_id") or "")
            ans = item.get("answer") or item.get("student_answer")
            if q_id:
                answers_map[q_id] = ans
                
        session_answers_key = f"company_prep_answers_{company_id}_{test_type}"
        tab_key = f"company_prep_tab_switches_{company_id}_{test_type}"
        
        request.session[session_answers_key] = answers_map
        request.session[tab_key] = tab_switch_count
        request.session.modified = True
        
        return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

@csrf_exempt
@require_POST
@login_required
@user_passes_test(is_student)
def api_submit(request, company_id, test_type):
    company = get_object_or_404(Company, id=company_id)
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return JsonResponse({"error": "Student profile not found"}, status=400)

    try:
        data = json.loads(request.body or "{}")
        answers = data.get("answers", [])
        
        answers_map = {}
        for entry in answers:
            q_id = str(entry.get("question_id") or "")
            answers_map[q_id] = entry.get("answer")

        session_questions_key = f"company_prep_question_ids_{company.id}_{test_type}"
        question_ids = request.session.get(session_questions_key)
        
        if not question_ids:
            return JsonResponse({"error": "No active test session found"}, status=400)
            
        if test_type == 'Aptitude':
            questions = list(CompanyAptitudeQuestion.objects.filter(id__in=question_ids))
        else:
            questions = list(CompanyTechnicalQuestion.objects.filter(id__in=question_ids))
            
        score_count = 0
        total_questions = len(questions)
        wrong_areas = []
        
        for q in questions:
            q_id_str = str(q.id)
            q_type = getattr(q, 'type', 'MCQ')
            if q_type == 'CODE' or q_type == 'Code':
                q_type = 'Code'
            elif q_type == 'TF' or q_type == 'TrueFalse':
                q_type = 'TF'
            else:
                q_type = 'MCQ'

            student_ans = answers_map.get(q_id_str)
            if not student_ans:
                wrong_areas.append(q.topic)
                continue
                
            if q_type == 'Code':
                code_text = ""
                language = "python"
                if isinstance(student_ans, str):
                    try:
                        parsed = json.loads(student_ans)
                        if isinstance(parsed, dict):
                            code_text = parsed.get("code", "")
                            language = parsed.get("language", "python")
                        else:
                            code_text = student_ans
                    except Exception:
                        code_text = student_ans
                else:
                    code_text = str(student_ans or "")
                
                if not code_text.strip():
                    wrong_areas.append(q.topic)
                    continue

                sample_cases = []
                hidden_cases = []
                
                if getattr(q, 'input_example', None) or getattr(q, 'expected_output', None):
                    sample_cases.append({
                        "input": q.input_example or "",
                        "output": q.expected_output or ""
                    })
                else:
                    sample_cases.append({
                        "input": "",
                        "output": q.correct_answer or ""
                    })
                
                if getattr(q, 'test_cases', None):
                    hidden_cases = q.test_cases
                
                judge_payload = {
                    "sample_test_cases": sample_cases,
                    "hidden_test_cases": hidden_cases
                }
                
                try:
                    judge_result = evaluate_code_with_test_cases(code_text, language, judge_payload)
                    if judge_result.get('verdict') == 'Accepted':
                        score_count += 1
                    else:
                        wrong_areas.append(q.topic)
                except Exception:
                    wrong_areas.append(q.topic)
            else:
                if str(student_ans).strip() == str(q.correct_answer).strip():
                    score_count += 1
                else:
                    wrong_areas.append(q.topic)

        # Calculate time taken
        start_time_str = request.session.get(f"company_prep_start_time_{company.id}_{test_type}")
        time_taken_seconds = 0
        if start_time_str:
            try:
                from django.utils import dateparse
                start_time = dateparse.parse_datetime(start_time_str)
                if start_time:
                    time_taken_seconds = int((timezone.now() - start_time).total_seconds())
            except Exception:
                pass

        # Compile detailed question answers report
        questions_report = []
        for q in questions:
            q_id_str = str(q.id)
            student_ans = answers_map.get(q_id_str)
            
            # Formulate friendly student answer representation
            student_ans_clean = student_ans
            if student_ans_clean is None:
                student_ans_clean = "Not Attempted"
            else:
                q_type_normal = getattr(q, 'type', 'MCQ')
                if q_type_normal == 'CODE' or q_type_normal == 'Code':
                    try:
                        parsed = json.loads(student_ans_clean)
                        if isinstance(parsed, dict):
                            student_ans_clean = parsed.get("code", "")
                    except Exception:
                        pass
            
            is_correct = False
            if q_id_str not in wrong_areas and student_ans is not None:
                is_correct = True
                
            questions_report.append({
                'question_text': q.question_text,
                'student_answer': student_ans_clean,
                'correct_answer': q.correct_answer,
                'is_correct': is_correct
            })

        weak_areas = list(set(wrong_areas))
        score_pct = int((score_count / total_questions) * 100) if total_questions > 0 else 0

        # Save Attempt
        attempt = StudentPrepAttempt.objects.create(
            student=student,
            company=company,
            round_type=test_type,
            score=score_pct,
            details={
                'weak_areas': weak_areas or ["None! Outstanding work!"],
                'correct_count': score_count,
                'total_count': total_questions,
                'test_type': test_type,
                'time_taken_seconds': time_taken_seconds,
                'questions': questions_report
            }
        )

        # Update Progress Score
        progress, created = StudentCompanyProgress.objects.get_or_create(
            student=student,
            company=company
        )
        if test_type == 'Aptitude':
            progress.aptitude_score = max(progress.aptitude_score, score_pct)
        else:
            progress.technical_score = max(progress.technical_score, score_pct)
        progress.save()

        # Clear session vars
        session_answers_key = f"company_prep_answers_{company.id}_{test_type}"
        tab_key = f"company_prep_tab_switches_{company.id}_{test_type}"
        start_time_key = f"company_prep_start_time_{company.id}_{test_type}"
        if session_answers_key in request.session:
            del request.session[session_answers_key]
        if tab_key in request.session:
            del request.session[tab_key]
        if start_time_key in request.session:
            del request.session[start_time_key]
        if session_questions_key in request.session:
            del request.session[session_questions_key]
        request.session.modified = True

        return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)

@login_required
@user_passes_test(is_student)
def test_result_page(request, company_id, test_type):
    company = get_object_or_404(Company, id=company_id)
    student = StudentProfile.objects.filter(user=request.user, is_current=True).first()
    if not student and request.user.role == 'admin':
        student = StudentProfile.objects.first()
    if not student:
        return render(request, 'no_profile.html')

    attempt = StudentPrepAttempt.objects.filter(
        student=student,
        company=company,
        round_type=test_type
    ).order_by('-created_at').first()

    if not attempt:
        return redirect('company_prep:company_dashboard', company_id=company.id)

    return render(request, 'test_result.html', {
        'company': company,
        'attempt': attempt,
        'round_name': f"{test_type} Round",
        'base_template': 'admin_base.html' if request.user.role == 'admin' else 'student_base.html'
    })


# =====================================================================
# Placement/Company Question Management APIs (AJAX)
# =====================================================================

@login_required
@user_passes_test(is_tpo)
def api_get_company_questions(request, company_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        aptitude = CompanyAptitudeQuestion.objects.filter(company=company)
        technical = CompanyTechnicalQuestion.objects.filter(company=company)
        
        q_list = []
        for q in aptitude:
            q_list.append({
                'id': str(q.id),
                'category': 'aptitude',
                'question_text': q.question_text,
                'type': q.type,
                'topic': q.topic,
                'difficulty': q.difficulty,
                'branch': '',
                'options': q.options or [],
                'correct_answer': q.correct_answer,
                'explanation': q.explanation or '',
                'image_url': q.image.url if q.image else None,
            })
        for q in technical:
            q_list.append({
                'id': str(q.id),
                'category': 'technical',
                'question_text': q.question_text,
                'type': q.type,
                'topic': q.topic,
                'difficulty': '',
                'branch': q.branch,
                'options': q.options or [],
                'correct_answer': q.correct_answer,
                'explanation': q.explanation or '',
                'image_url': q.image.url if q.image else None,
                'input_example': getattr(q, 'input_example', '') or '',
                'expected_output': getattr(q, 'expected_output', '') or '',
                'test_cases': getattr(q, 'test_cases', []) or [],
            })
        return JsonResponse({'status': 'success', 'questions': q_list})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
@require_POST
def api_add_company_question(request, company_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        
        if request.content_type.startswith('multipart/form-data'):
            category = request.POST.get('category')
            q_type = request.POST.get('type', 'MCQ')
            topic = request.POST.get('topic')
            question_text = request.POST.get('question_text')
            correct_answer = request.POST.get('correct_answer')
            explanation = request.POST.get('explanation')
            raw_options = request.POST.get('options')
            options = json.loads(raw_options) if raw_options else []
            difficulty = request.POST.get('difficulty', 'Medium')
            branch = request.POST.get('branch', 'CSE')
            image = request.FILES.get('image')
            
            input_example = request.POST.get('input_example', '')
            expected_output = request.POST.get('expected_output', '')
            raw_test_cases = request.POST.get('test_cases')
            test_cases = json.loads(raw_test_cases) if raw_test_cases else []
        else:
            data = json.loads(request.body)
            category = data.get('category')
            q_type = data.get('type', 'MCQ')
            topic = data.get('topic')
            question_text = data.get('question_text')
            correct_answer = data.get('correct_answer')
            explanation = data.get('explanation')
            options = data.get('options') or []
            difficulty = data.get('difficulty', 'Medium')
            branch = data.get('branch', 'CSE')
            image = None
            
            input_example = data.get('input_example', '')
            expected_output = data.get('expected_output', '')
            test_cases = data.get('test_cases') or []

        if q_type == 'TF':
            options = ['True', 'False']

        if category == 'aptitude':
            CompanyAptitudeQuestion.objects.create(
                company=company,
                topic=topic,
                difficulty=difficulty,
                question_text=question_text,
                options=options,
                correct_answer=correct_answer,
                explanation=explanation,
                type=q_type,
                image=image
            )
        else:
            CompanyTechnicalQuestion.objects.create(
                company=company,
                branch=branch,
                topic=topic,
                type=q_type,
                question_text=question_text,
                options=options,
                correct_answer=correct_answer,
                explanation=explanation,
                image=image,
                input_example=input_example,
                expected_output=expected_output,
                test_cases=test_cases
            )
        return JsonResponse({'status': 'success', 'message': 'Question added successfully'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
@require_POST
def api_update_company_question(request, company_id, q_type, question_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        if q_type == 'aptitude':
            question = get_object_or_404(CompanyAptitudeQuestion, id=question_id, company=company)
        else:
            question = get_object_or_404(CompanyTechnicalQuestion, id=question_id, company=company)
            
        if request.content_type.startswith('multipart/form-data'):
            topic = request.POST.get('topic')
            question_text = request.POST.get('question_text')
            correct_answer = request.POST.get('correct_answer')
            explanation = request.POST.get('explanation')
            raw_options = request.POST.get('options')
            options = json.loads(raw_options) if raw_options else []
            difficulty = request.POST.get('difficulty')
            branch = request.POST.get('branch')
            delete_image = request.POST.get('delete_image') == 'true'
            image = request.FILES.get('image')
            new_type = request.POST.get('type')
            
            input_example = request.POST.get('input_example', '')
            expected_output = request.POST.get('expected_output', '')
            raw_test_cases = request.POST.get('test_cases')
            test_cases = json.loads(raw_test_cases) if raw_test_cases else []
        else:
            data = json.loads(request.body)
            topic = data.get('topic')
            question_text = data.get('question_text')
            correct_answer = data.get('correct_answer')
            explanation = data.get('explanation')
            options = data.get('options') or []
            difficulty = data.get('difficulty')
            branch = data.get('branch')
            delete_image = data.get('delete_image') == True
            image = None
            new_type = data.get('type')
            
            input_example = data.get('input_example', '')
            expected_output = data.get('expected_output', '')
            test_cases = data.get('test_cases') or []

        if new_type == 'TF':
            options = ['True', 'False']

        question.topic = topic
        question.question_text = question_text
        question.correct_answer = correct_answer
        question.explanation = explanation
        question.options = options
        if new_type:
            question.type = new_type

        if q_type == 'aptitude':
            if difficulty:
                question.difficulty = difficulty
        else:
            if branch:
                question.branch = branch
            question.input_example = input_example
            question.expected_output = expected_output
            question.test_cases = test_cases

        if delete_image:
            if question.image:
                question.image.delete(save=False)
            question.image = None
        if image:
            question.image = image

        question.save()
        return JsonResponse({'status': 'success', 'message': 'Question updated successfully'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
@require_POST
def api_delete_company_question(request, company_id, q_type, question_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        if q_type == 'aptitude':
            question = get_object_or_404(CompanyAptitudeQuestion, id=question_id, company=company)
        else:
            question = get_object_or_404(CompanyTechnicalQuestion, id=question_id, company=company)
        
        question.delete()
        return JsonResponse({'status': 'success', 'message': 'Question deleted successfully'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
def api_get_general_questions(request, company_id, category):
    company = get_object_or_404(Company, id=company_id)
    
    if category == 'aptitude':
        # Exclude questions already in this company's pool
        existing_ids = CompanyAptitudeQuestion.objects.filter(company=company).values_list('id', flat=True)
        questions = CompanyAptitudeQuestion.objects.filter(company__isnull=True).exclude(id__in=existing_ids)
        q_list = [{
            'id': str(q.id),
            'topic': q.topic,
            'difficulty': q.difficulty,
            'question_text': q.question_text[:80] + '...' if len(q.question_text) > 80 else q.question_text,
            'type': q.type
        } for q in questions]
    else:
        existing_ids = CompanyTechnicalQuestion.objects.filter(company=company).values_list('id', flat=True)
        questions = CompanyTechnicalQuestion.objects.filter(company__isnull=True).exclude(id__in=existing_ids)
        q_list = [{
            'id': str(q.id),
            'topic': q.topic,
            'branch': q.branch,
            'question_text': q.question_text[:80] + '...' if len(q.question_text) > 80 else q.question_text,
            'type': q.type
        } for q in questions]
        
    return JsonResponse({'status': 'success', 'questions': q_list})


@login_required
@user_passes_test(is_tpo)
@require_POST
def api_import_question_bank(request, company_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        data = json.loads(request.body)
        question_ids = data.get('question_ids', [])
        category = data.get('category')
        
        if not question_ids or not category:
            return JsonResponse({'status': 'error', 'message': 'Missing question IDs or category'}, status=400)
            
        imported_count = 0
        if category == 'aptitude':
            for qid in question_ids:
                orig = CompanyAptitudeQuestion.objects.filter(id=qid).first()
                if orig:
                    # Create a copy for this company
                    CompanyAptitudeQuestion.objects.create(
                        company=company,
                        topic=orig.topic,
                        difficulty=orig.difficulty,
                        question_text=orig.question_text,
                        options=orig.options,
                        correct_answer=orig.correct_answer,
                        explanation=orig.explanation,
                        type=orig.type,
                        image=orig.image
                    )
                    imported_count += 1
        else:
            for qid in question_ids:
                orig = CompanyTechnicalQuestion.objects.filter(id=qid).first()
                if orig:
                    # Create a copy for this company
                    CompanyTechnicalQuestion.objects.create(
                        company=company,
                        branch=orig.branch,
                        topic=orig.topic,
                        type=orig.type,
                        question_text=orig.question_text,
                        options=orig.options,
                        correct_answer=orig.correct_answer,
                        explanation=orig.explanation,
                        image=orig.image,
                        input_example=orig.input_example,
                        expected_output=orig.expected_output,
                        test_cases=orig.test_cases
                    )
                    imported_count += 1
                    
        return JsonResponse({'status': 'success', 'message': f'Successfully imported {imported_count} questions!'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
@require_POST
def api_save_rounds(request, company_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        data = json.loads(request.body)
        
        company.round1_active = data.get('round1_active', True)
        company.round1_name = data.get('round1_name', 'Quantitative, Logical & Verbal Aptitude')
        company.round1_duration = int(data.get('round1_duration', 30))
        company.round1_questions = int(data.get('round1_questions', 30))
        company.round1_passing_pct = int(data.get('round1_passing_pct', 60))
        
        company.round2_active = data.get('round2_active', True)
        company.round2_name = data.get('round2_name', 'Technical Assessment')
        company.round2_technical_format = data.get('round2_technical_format', 'MCQ')
        company.round2_duration = int(data.get('round2_duration', 60))
        company.round2_questions = int(data.get('round2_questions', 40))
        company.round2_passing_pct = int(data.get('round2_passing_pct', 60))
        
        # Synchronize selection_process text field for backward compatibility
        stages = []
        if company.round1_active:
            stages.append("Round 1: Aptitude")
        if company.round2_active:
            stages.append("Round 2: Technical & Coding")
        company.selection_process = " -> ".join(stages) if stages else "Direct Interview"
        
        company.save()
        return JsonResponse({'status': 'success', 'message': 'Rounds configured successfully!'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
@require_POST
def api_schedule_assessment(request, company_id):
    try:
        company = get_object_or_404(Company, id=company_id)
        data = json.loads(request.body)
        
        college_id = data.get('college')
        course_id = data.get('course')
        semester = data.get('semester')
        section_name = data.get('section')
        year = data.get('year')
        
        if year:
            company.year = int(year)
            
        # Check that required fields are present if scheduling
        if not college_id or not course_id or not semester:
            return JsonResponse({'status': 'error', 'message': 'College, Course, and Semester are required.'}, status=400)
            
        company.college = get_object_or_404(College, id=college_id)
        company.course = get_object_or_404(Course, id=course_id)
        company.semester = int(semester)
        
        if section_name and section_name != 'all':
            company.section = get_object_or_404(Section, name=section_name)
        else:
            company.section = None
            
        start_dt = data.get('start_datetime')
        end_dt = data.get('end_datetime')
        company.start_datetime = start_dt if start_dt else None
        company.end_datetime = end_dt if end_dt else None
        
        company.max_attempts = int(data.get('max_attempts', 1))
        company.shuffle_questions = data.get('shuffle_questions', False)
        company.shuffle_options = data.get('shuffle_options', False)
        company.negative_marking = data.get('negative_marking', False)
        company.is_published = data.get('is_published', False)
        
        company.save()
        return JsonResponse({'status': 'success', 'message': 'Assessment scheduled successfully!'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_tpo)
def api_student_attempts(request, student_id, company_id):
    company = get_object_or_404(Company, id=company_id)
    student = get_object_or_404(StudentProfile, id=student_id)
    attempts = StudentPrepAttempt.objects.filter(student=student, company=company).order_by('-created_at')
    
    attempts_data = []
    for a in attempts:
        time_taken_seconds = a.details.get('time_taken_seconds', 0)
        minutes = time_taken_seconds // 60
        seconds = time_taken_seconds % 60
        time_taken_str = f"{minutes}m {seconds}s" if time_taken_seconds > 0 else "N/A"
        
        attempts_data.append({
            'id': str(a.id),
            'round_type': a.round_type,
            'score': a.score,
            'created_at': a.created_at.strftime("%d-%m-%Y %I:%M %p"),
            'time_taken': time_taken_str,
            'correct_count': a.details.get('correct_count', 0),
            'total_count': a.details.get('total_count', 0),
            'weak_areas': a.details.get('weak_areas', []),
            'questions': a.details.get('questions', [])
        })
        
    return JsonResponse({
        'student_name': student.user.get_full_name() or student.user.email,
        'attempts': attempts_data
    })


