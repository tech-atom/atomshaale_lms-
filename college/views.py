from django.shortcuts import get_object_or_404, render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.db import IntegrityError
from .models import College 
from .forms import CollegeForm , CourseForm
import json
import logging
from .models import College, Course, StudentGroupAccess
from .forms import CollegeForm, CourseForm
from .models import Section
from .forms import SectionForm
import json
import logging
from student.models import StudentProfile
from django.db.models import Count
from django.utils import timezone

logger = logging.getLogger(__name__)


def is_admin(user):
    return user.is_authenticated and user.role == 'admin'

# OK Update College
@login_required
@user_passes_test(is_admin)
@require_POST
def api_update_college(request, pk):
    try:
        data = json.loads(request.body)
    
        college = get_object_or_404(College, pk=pk)
        form = CollegeForm(data, instance=college)

        if form.is_valid():
            try:
                form.save()
                return JsonResponse({'status': 'success', 'message': 'College updated successfully'})
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'A college with this name already exists.'}, status=400)
        else:
            return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON format.'}, status=400)
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Something went wrong. Please try again.'}, status=400)

# OK Delete College
@login_required
@user_passes_test(is_admin)
@require_POST
def delete_college(request, pk):
    try:
        college = get_object_or_404(College, pk=pk)
        college.delete()
        return JsonResponse({'status': 'success', 'message': 'College deleted successfully'})
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Unable to delete college. Please try again.'}, status=400)

# OK Add College
@login_required
@user_passes_test(is_admin)
@require_POST
def add_college(request):
    try:
        data = json.loads(request.body)
        form = CollegeForm(data)

        if form.is_valid():
            try:
                college = form.save()
                return JsonResponse({
                    'status': 'success',
                    'message': 'College added successfully',
                    'college': {
                        'id': college.id,
                        'name': college.name,
                        'contact_email': college.contact_email,
                        'contact_number': str(college.contact_number),
                        'address': college.address
                    }
                })
            except IntegrityError:
                return JsonResponse({
                    'status': 'error',
                    'message': 'A college with this name already exists.'
                }, status=400)
        else:
            return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON format.'}, status=400)
    except Exception:
        return JsonResponse({'status': 'error', 'message': 'Something went wrong. Please try again.'}, status=400)



def get_colleges(request):
    data = list(College.objects.values('id', 'name'))
    return JsonResponse(data, safe=False)

#----------------- Course -------------------#

@login_required
@user_passes_test(is_admin)
@require_POST
def add_course(request):
    try:
        data = json.loads(request.body)
        raw_name = data.get('name', '')
        
        # Split by newline or comma to handle multiple courses
        import re
        names = [n.strip().upper() for n in re.split(r'[\n,]+', raw_name) if n.strip()]

        if not names:
            return JsonResponse({'status': 'error', 'message': 'Course name cannot be empty.'}, status=400)

        created_courses = []
        already_existed = []
        errors = []

        from .models import Course
        for name in names:
            if len(name) > 50:
                errors.append(f"Course '{name}' exceeds 50 characters.")
                continue
            
            try:
                course, created = Course.objects.get_or_create(name=name)
                if created:
                    created_courses.append({'id': course.id, 'name': course.name})
                else:
                    already_existed.append(name)
            except Exception as e:
                errors.append(f"Failed to create '{name}': {str(e)}")

        if errors:
            return JsonResponse({'status': 'error', 'message': '; '.join(errors)}, status=400)

        if not created_courses and already_existed:
            return JsonResponse({'status': 'error', 'message': f"Course(s) already exist: {', '.join(already_existed)}"}, status=400)

        single_course = created_courses[0] if len(created_courses) == 1 else None
        
        return JsonResponse({
            'status': 'success',
            'message': f"Successfully added {len(created_courses)} course(s)." + (f" ({len(already_existed)} already existed)" if already_existed else ""),
            'courses': created_courses,
            'course': single_course
        })

    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception as e:
        logger.exception('Unexpected error adding course')
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def api_update_course(request, pk):
    try:
        data = json.loads(request.body)
        course = get_object_or_404(Course, pk=pk)
        form = CourseForm(data, instance=course)
        if form.is_valid():
            try:
                course = form.save()
                return JsonResponse({
                    'status': 'success',
                    'message': 'Course updated successfully',
                    'course': {
                        'id': course.id,
                        'name': course.name
                    }
                })
            except IntegrityError:
                logger.exception('IntegrityError updating course %s', pk)
                return JsonResponse({'status': 'error', 'message': 'Course with this name already exists.'}, status=400)
        else:
            logger.debug('Course update validation errors: %s', form.errors)
            return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception:
        logger.exception('Unexpected error updating course %s', pk)
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def delete_course(request, pk):
    try:
        course = get_object_or_404(Course, pk=pk)
        course.delete()
        return JsonResponse({'status': 'success', 'message': 'Course deleted successfully'})
    except Exception:
        logger.exception('Unable to delete course %s', pk)
        return JsonResponse({'status': 'error', 'message': 'Unable to delete course.'}, status=400)


def get_courses(request):
    college_id = request.GET.get('college_id')
    if college_id:
        data = list(Course.objects.filter(college_courses__college_id=college_id).values('id', 'name').order_by('name'))
    else:
        data = list(Course.objects.values('id', 'name').order_by('name'))
    return JsonResponse(data, safe=False)



# -------------------- Section -------------------- #

@login_required
@user_passes_test(is_admin)
@require_POST
def add_section(request):
    try:
        data = json.loads(request.body)
        form = SectionForm(data)
        if form.is_valid():
            try:
                section = form.save()
                return JsonResponse({
                    'status': 'success',
                    'message': 'Section added successfully',
                    'section': {
                        'name': section.name
                    }
                })
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'Section already exists.'}, status=400)
        else:
            return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception:
        logger.exception('Error adding section')
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def api_update_section(request, name):
    try:
        data = json.loads(request.body)
        section = get_object_or_404(Section, name=name)
        form = SectionForm(data, instance=section)
        if form.is_valid():
            try:
                section = form.save()
                return JsonResponse({
                    'status': 'success',
                    'message': 'Section updated successfully',
                    'section': {'name': section.name}
                })
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'Section already exists.'}, status=400)
        else:
            return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON.'}, status=400)
    except Exception:
        logger.exception('Error updating section')
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def delete_section(request, name):
    try:
        section = get_object_or_404(Section, name=name)
        section.delete()
        return JsonResponse({'status': 'success', 'message': 'Section deleted successfully'})
    except Exception:
        logger.exception('Unable to delete section')
        return JsonResponse({'status': 'error', 'message': 'Unable to delete section.'}, status=400)


def get_sections(request):
    college_id = request.GET.get('college_id')
    course_id = request.GET.get('course_id')
    if college_id and course_id:
        qs = Section.objects.filter(
            college_course_sections__college_course__college_id=college_id,
            college_course_sections__college_course__course_id=course_id
        ).distinct()
        data = list(qs.values('name').order_by('name'))
    else:
        data = list(Section.objects.values('name').order_by('name'))
    return JsonResponse(data, safe=False)


@login_required
@user_passes_test(is_admin)
def get_college_mappings(request, college_id):
    from .models import CollegeCourse
    college_courses = CollegeCourse.objects.filter(college_id=college_id).select_related('course')
    mappings = []
    for cc in college_courses:
        sections = list(cc.sections.values_list('section_id', flat=True))
        mappings.append({
            'course_id': cc.course.id,
            'course_name': cc.course.name,
            'sections': sections
        })
    return JsonResponse({'status': 'success', 'mappings': mappings})


@login_required
@user_passes_test(is_admin)
@require_POST
def add_college_mapping(request, college_id):
    try:
        data = json.loads(request.body)
        course_ids = data.get('course_ids', [])
        course_id = data.get('course_id')
        section_names = data.get('sections', [])

        if not course_ids and course_id:
            course_ids = [course_id]

        if not course_ids:
            return JsonResponse({'status': 'error', 'message': 'At least one course must be selected.'}, status=400)

        from .models import CollegeCourse, CollegeCourseSection, Course, Section
        for c_id in course_ids:
            course = get_object_or_404(Course, id=c_id)
            college_course, _ = CollegeCourse.objects.get_or_create(college_id=college_id, course=course)

            # Clear existing sections for this mapping
            college_course.sections.all().delete()

            # Add selected sections
            for sec_name in section_names:
                section = get_object_or_404(Section, name=sec_name)
                CollegeCourseSection.objects.create(college_course=college_course, section=section)

        return JsonResponse({'status': 'success', 'message': 'Mapping added/updated successfully.'})
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON format.'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


@login_required
@user_passes_test(is_admin)
@require_POST
def remove_college_mapping(request, college_id):
    try:
        data = json.loads(request.body)
        course_id = data.get('course_id')

        if not course_id:
            return JsonResponse({'status': 'error', 'message': 'Course ID is required.'}, status=400)

        from .models import CollegeCourse
        CollegeCourse.objects.filter(college_id=college_id, course_id=course_id).delete()
        return JsonResponse({'status': 'success', 'message': 'Mapping removed successfully.'})
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON format.'}, status=400)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)



from student.models import StudentProfile
from django.db.models import Count
from django.http import JsonResponse


@login_required
@user_passes_test(is_admin)
def get_college_student_groups(request, college_id):

    groups = (
        StudentProfile.objects
        .filter(college_id=college_id, is_current=True)
        .values(
            "year",
            "semester",
            "section__name",
            "course__name"
        )
        .annotate(count=Count("id"))
        .order_by("year", "semester")
    )

    data = []

    for g in groups:
        data.append({
            "year": g["year"],
            "semester": g["semester"],
            "section": g["section__name"],
            "course": g["course__name"],
            "count": g["count"]
        })

    return JsonResponse({"groups": data})

@login_required
@user_passes_test(is_admin)
def get_students_by_group(request):

    college = request.GET.get("college")
    year = request.GET.get("year")
    semester = request.GET.get("semester")
    section = request.GET.get("section")
    course = request.GET.get("course")

    students = (
        StudentProfile.objects
        .select_related("user", "course", "section")
        .filter(
            college_id=college,
            year=year,
            semester=semester,
            section__name=section,
            course__name=course,
            is_current=True
        )
    )

    data = []

    for s in students:
        data.append({
            "usn": s.usn,
            "name": s.user.get_full_name(),
            "email": s.user.email,
            "course": s.course.name,
            "year": s.year,
            "semester": s.semester,
            "section": s.section.name
        })

    return JsonResponse({"students": data})


@login_required
@user_passes_test(is_admin)
def college_students_page(request, college_id):

    college = get_object_or_404(College, id=college_id)

    raw_groups = (
        StudentProfile.objects
        .filter(college=college, is_current=True)
        .values(
            "year",
            "semester",
            "section__name",
            "course__name",
            "batch_year",
        )
        .distinct()
        .order_by("batch_year", "year", "semester")
    )

    # Annotate each batch-group with its current paused status
    groups = []
    for g in raw_groups:
        try:
            access = StudentGroupAccess.objects.get(
                college=college,
                year=g['year'],
                semester=g['semester'],
                section__name=g['section__name'],
                course__name=g['course__name'],
                batch_year=g['batch_year'],
            )
            is_paused = access.is_paused
        except StudentGroupAccess.DoesNotExist:
            is_paused = False

        groups.append({
            'year': g['year'],
            'semester': g['semester'],
            'section__name': g['section__name'],
            'course__name': g['course__name'],
            'batch_year': g['batch_year'],
            'is_paused': is_paused,
        })

    return render(
        request,
        "admin_college_students.html",
        {
            "college": college,
            "groups": groups
        }
    )


@login_required
@user_passes_test(is_admin)
def college_students_list(request, college_id, year, semester, section, course, batch_year):

    college = get_object_or_404(College, id=college_id)

    students = (
        StudentProfile.objects
        .select_related("user", "course", "section")
        .filter(
            college=college,
            year=year,
            semester=semester,
            section__name=section,
            course__name=course,
            batch_year=batch_year,
            is_current=True
        )
    )

    return render(
        request,
        "admin_student_list.html",
        {
            "students": students,
            "college": college,
            "batch_year": batch_year,
        }
    )


@login_required
@user_passes_test(is_admin)
@csrf_exempt
@require_POST
def toggle_group_access(request):
    """
    Toggle pause/resume for a student group.
    POST body: { college_id, year, semester, section, course, action: "pause"|"resume" }
    """
    try:
        data = json.loads(request.body)
        college_id = data.get('college_id')
        year       = int(data.get('year'))
        semester   = int(data.get('semester'))
        section    = data.get('section')
        course     = data.get('course')
        batch_year = int(data.get('batch_year'))
        action     = data.get('action')  # "pause" or "resume"

        if action not in ('pause', 'resume'):
            return JsonResponse({'status': 'error', 'message': 'Invalid action.'}, status=400)

        college     = get_object_or_404(College, id=college_id)
        section_obj = get_object_or_404(Section, name=section)
        course_obj  = get_object_or_404(Course, name=course)

        access, _created = StudentGroupAccess.objects.get_or_create(
            college=college,
            year=year,
            semester=semester,
            section=section_obj,
            course=course_obj,
            batch_year=batch_year,
        )

        if action == 'pause':
            access.is_paused = True
            access.paused_at = timezone.now()
            access.paused_by = request.user.email
        else:
            access.is_paused = False
            access.paused_at = None
            access.paused_by = None

        access.save()

        return JsonResponse({
            'status': 'success',
            'is_paused': access.is_paused,
            'message': f"Group {'paused' if access.is_paused else 'resumed'} successfully.",
        })

    except (json.JSONDecodeError, TypeError, ValueError):
        return JsonResponse({'status': 'error', 'message': 'Invalid request data.'}, status=400)
    except Exception as e:
        logger.exception('Error toggling group access')
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)