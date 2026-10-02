# materials/views.py
import logging
import json
from uuid import UUID
from django.core.exceptions import FieldError
from django.shortcuts import get_object_or_404
from django.http import JsonResponse, FileResponse, Http404
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db import IntegrityError
from django.db.models import F
from django.utils import timezone
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from college.models import College, Course, Section 
from django.utils.encoding import smart_str
import os
from django.conf import settings
from .models import Material, ScheduledMaterial
from django.utils.dateparse import parse_datetime
from django.conf import settings

from .models import Domain, SubDomain, Module, Material, ScheduledMaterial
from .forms import DomainForm, SubDomainForm, ModuleForm

logger = logging.getLogger(__name__)

# File size limits (mirror the frontend)
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_OTHER_BYTES = 40 * 1024 * 1024
MAX_VIDEO_BYTES = 150 * 1024 * 1024

ALLOWED_DOC_EXT = ['.pdf', '.doc', '.docx', '.odt']
ALLOWED_PPT_EXT = ['.ppt', '.pptx']
ALLOWED_EXCEL_EXT = ['.xls', '.xlsx', '.ods']
ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv']


def is_admin(user):
    return user.is_authenticated and getattr(user, 'role', '') == 'admin'


def is_student(user):
    return user.is_authenticated and getattr(user, 'role', '') == 'student'


# ---------------- ADMIN: Domains / Subdomains / Modules ----------------

@login_required
@user_passes_test(is_admin)
@require_POST
def add_domain(request):
    try:
        data = json.loads(request.body)
        form = DomainForm(data)
        if form.is_valid():
            try:
                domain = form.save()
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'That domain already exists.'}, status=400)
            return JsonResponse({'status': 'success', 'message': 'Domain added successfully.', 'domain': {'id': str(domain.id), 'name': domain.domain_name}})
        else:
            message = '; '.join(str(err) for errors in form.errors.values() for err in errors)
            return JsonResponse({'status': 'error', 'message': message}, status=400)
    except Exception as e:
        logger.exception("add_domain error")
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def update_domain(request, domain_id):
    try:
        data = json.loads(request.body)
        domain = get_object_or_404(Domain, id=domain_id)
        form = DomainForm(data, instance=domain)
        if form.is_valid():
            try:
                form.save()
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'That domain name is already in use.'}, status=400)
            return JsonResponse({'status': 'success', 'message': 'Domain updated successfully.'})
        else:
            message = '; '.join(str(err) for errors in form.errors.values() for err in errors)
            return JsonResponse({'status': 'error', 'message': message}, status=400)
    except Exception:
        logger.exception("update_domain")
        return JsonResponse({'status': 'error', 'message': 'Unable to update domain.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def delete_domain(request, domain_id):
    try:
        domain = get_object_or_404(Domain, id=domain_id)
        domain.delete()
        return JsonResponse({'status': 'success', 'message': 'Domain deleted successfully.'})
    except Exception:
        logger.exception("delete_domain")
        return JsonResponse({'status': 'error', 'message': 'Unable to delete domain.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def add_subdomain(request):
    try:
        data = json.loads(request.body)
        form = SubDomainForm(data)
        if form.is_valid():
            try:
                subdomain = form.save()
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'That subdomain already exists for the selected domain.'}, status=400)
            return JsonResponse({'status': 'success', 'message': 'Subdomain added successfully.', 'subdomain': {'id': str(subdomain.id), 'name': subdomain.subdomain_name, 'domain': subdomain.domain.domain_name}})
        else:
            message = '; '.join(err for errors in form.errors.values() for err in errors)
            return JsonResponse({'status': 'error', 'message': message}, status=400)
    except Exception:
        logger.exception("add_subdomain")
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def update_subdomain(request, subdomain_id):
    try:
        data = json.loads(request.body)
        sub = get_object_or_404(SubDomain, id=subdomain_id)
        form = SubDomainForm(data, instance=sub)
        if form.is_valid():
            try:
                form.save()
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'That subdomain already exists for the selected domain.'}, status=400)
            return JsonResponse({'status': 'success', 'message': 'Subdomain updated successfully.'})
        else:
            message = '; '.join(err for errors in form.errors.values() for err in errors)
            return JsonResponse({'status': 'error', 'message': message}, status=400)
    except Exception:
        logger.exception("update_subdomain")
        return JsonResponse({'status': 'error', 'message': 'Unable to update subdomain.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def delete_subdomain(request):
    try:
        data = json.loads(request.body)
        sub_id = data.get('id')
        sub = get_object_or_404(SubDomain, id=sub_id)
        sub.delete()
        return JsonResponse({'status': 'success', 'message': 'Subdomain deleted'})
    except SubDomain.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Subdomain not found'}, status=404)
    except Exception:
        logger.exception("delete_subdomain")
        return JsonResponse({'status': 'error', 'message': 'Unable to delete subdomain.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def add_module(request):
    try:
        data = json.loads(request.body)
        form = ModuleForm(data)
        if form.is_valid():
            try:
                module = form.save()
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'That module already exists for the selected domain and subdomain.'}, status=400)
            return JsonResponse({'status': 'success', 'message': 'Module added successfully.', 'module': {'id': str(module.id), 'name': module.module_name}})
        else:
            message = '; '.join(err for errors in form.errors.values() for err in errors)
            return JsonResponse({'status': 'error', 'message': message}, status=400)
    except Exception:
        logger.exception("add_module")
        return JsonResponse({'status': 'error', 'message': 'Something went wrong.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def update_module(request, module_id):
    try:
        data = json.loads(request.body)
        module = get_object_or_404(Module, id=module_id)
        form = ModuleForm(data, instance=module)
        if form.is_valid():
            try:
                form.save()
            except IntegrityError:
                return JsonResponse({'status': 'error', 'message': 'That module already exists for the selected domain and subdomain.'}, status=400)
            return JsonResponse({'status': 'success', 'message': 'Module updated successfully.'})
        else:
            message = '; '.join(err for errors in form.errors.values() for err in errors)
            return JsonResponse({'status': 'error', 'message': message}, status=400)
    except Exception:
        logger.exception("update_module")
        return JsonResponse({'status': 'error', 'message': 'Unable to update module.'}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def delete_module(request, module_id):
    try:
        module = get_object_or_404(Module, id=module_id)
        module.delete()
        return JsonResponse({'status': 'success', 'message': 'Module deleted successfully'})
    except Exception:
        logger.exception("delete_module")
        return JsonResponse({'status': 'error', 'message': 'Unable to delete module.'}, status=500)


# ----------------- AJAX / JSON endpoints for admin UI -----------------

@login_required
@user_passes_test(is_admin)
def admin_get_domains(request):
    """
    Returns list of domains as: [{'id': '<uuid>', 'name': 'Domain Name'}, ...]
    """
    try:
        domains = Domain.objects.all().annotate(name=F('domain_name')).values('id', 'name')
        # convert UUID to str
        res = [{'id': str(d['id']), 'name': d['name']} for d in domains]
        return JsonResponse(res, safe=False)
    except Exception:
        logger.exception("admin_get_domains")
        return JsonResponse([], safe=False)


@login_required
@user_passes_test(is_admin)
def admin_get_modules(request):
    domain_id = request.GET.get("domain_id")
    try:
        modules = Module.objects.filter(domain_id=domain_id).annotate(name=F('module_name')).values('id', 'name')
        res = [{'id': str(m['id']), 'name': m['name']} for m in modules]
        return JsonResponse(res, safe=False)
    except Exception:
        logger.exception("admin_get_modules")
        return JsonResponse([], safe=False)


@login_required
@user_passes_test(is_admin)
def get_subdomains_by_domain(request, domain_id=None):
    """
    Support both:
      - path style: /admin/domains/<uuid:domain_id>/subdomains/
      - query param: /admin/subdomains/json/?domain_id=<uuid>
    """
    if domain_id is None:
        domain_id = request.GET.get('domain_id')

    if not domain_id:
        return JsonResponse([], safe=False)

    try:
        qs = SubDomain.objects.filter(domain_id=domain_id).values('id', 'subdomain_name')
        data = [{'id': str(x['id']), 'subdomain_name': x['subdomain_name']} for x in qs]
        return JsonResponse(data, safe=False)
    except Exception:
        logger.exception("get_subdomains_by_domain")
        return JsonResponse({'error': 'Unable to fetch subdomains'}, status=500)


# ----------------- Materials: upload, list, delete -----------------

@login_required
@user_passes_test(is_admin)
def upload_material(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid method'}, status=405)

    try:
        title = request.POST.get('title', '').strip()
        description = request.POST.get('description', '').strip()
        domain_id = request.POST.get('domain')
        subdomain_id = request.POST.get('subdomain') or None
        module_id = request.POST.get('module')
        video_url = request.POST.get('video_url') or None

        if not all([title, description, domain_id, module_id]):
            return JsonResponse({'error': 'Missing required fields'}, status=400)

        domain = get_object_or_404(Domain, id=domain_id)
        module = get_object_or_404(Module, id=module_id)
        subdomain = SubDomain.objects.filter(id=subdomain_id).first()

        # ---------------- FIXED FILE HANDLING ---------------- #
        uploaded_files = request.FILES.getlist("files")

        material_pdf = None
        document_file = None
        ppt_file = None
        excel_file = None
        video_file = None

        for f in uploaded_files:
            name = f.name.lower()

            if name.endswith(".pdf"):
                material_pdf = f
            elif name.endswith((".doc", ".docx", ".odt")):
                document_file = f
            elif name.endswith((".ppt", ".pptx")):
                ppt_file = f
            elif name.endswith((".xls", ".xlsx", ".ods")):
                excel_file = f
            elif f.content_type.startswith("video/"):
                video_file = f

        # Save material with detected files
        material = Material.objects.create(
            title=title,
            description=description,
            domain=domain,
            module=module,
            subdomain=subdomain,
            material_pdf=material_pdf,
            document_file=document_file,
            ppt_file=ppt_file,
            excel_file=excel_file,
            video_file=video_file,
            video_url=video_url
        )

        # --------------- OPTIONAL SCHEDULING ---------------- #
        college_id = request.POST.get("college")
        course_id = request.POST.get("course")
        section_id = request.POST.get("section")
        semester = request.POST.get("semester")
        year = request.POST.get("year")
        start_datetime = request.POST.get("start_datetime")
        end_datetime = request.POST.get("end_datetime")

        if all([college_id, course_id, section_id, semester, year, start_datetime, end_datetime]):
            college = get_object_or_404(College, id=college_id)
            course = get_object_or_404(Course, id=course_id)
            section = get_object_or_404(Section, id=section_id)

            ScheduledMaterial.objects.create(
                material=material,
                college=college,
                course=course,
                section=section,
                semester=int(semester),
                year=int(year),
                start_datetime=start_datetime,
                end_datetime=end_datetime,
            )

        return JsonResponse({
            'status': 'success',
            'message': 'Material uploaded and scheduled successfully',
            'material': {
                'id': str(material.id),
                'title': material.title,
                'file_url': material.material_pdf.url if material.material_pdf else '',
            }
        })

    except Exception as e:
        logger.exception("upload_material")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
def list_materials(request):
    """
    Returns list of materials with file URLs and metadata the JS expects.
    """
    try:
        materials = Material.objects.select_related('domain', 'subdomain', 'module').order_by('-created_at').all()
        data = []
        for m in materials:
            data.append({
                'id': str(m.id),
                'title': m.title,
                'domain': m.domain.domain_name if m.domain else '',
                'subdomain': m.subdomain.subdomain_name if m.subdomain else '',
                'module': m.module.module_name if m.module else '',
                'file_url': m.material_pdf.url if m.material_pdf else '',
                'document_url': m.document_file.url if m.document_file else '',
                'ppt_url': m.ppt_file.url if m.ppt_file else '',
                'excel_url': m.excel_file.url if m.excel_file else '',
                'video_file_url': m.video_file.url if m.video_file else '',
                'video_url': m.video_url or ''
            })
        return JsonResponse(data, safe=False)
    except Exception:
        logger.exception("list_materials")
        return JsonResponse({'status': 'error', 'message': 'Unable to fetch materials'}, status=500)




@login_required
@user_passes_test(is_admin)
@require_POST
def delete_material(request, material_id):
    try:
        material = get_object_or_404(Material, id=material_id)
        material.delete()
        return JsonResponse({'status': 'success', 'message': 'Material deleted successfully'})
    except Exception:
        logger.exception("delete_material")
        return JsonResponse({'status': 'error', 'message': 'Unable to delete material.'}, status=500)



# ---------------- STUDENT-FACING endpoints (read-only) ----------------

@login_required
@user_passes_test(is_student)
def get_domains(request):
    domains = Domain.objects.all().values('id', name=models.F('domain_name'))
    return JsonResponse(list(domains), safe=False)


@login_required
@user_passes_test(is_student)
def get_modules(request):
    domain_id = request.GET.get('domain_id')
    modules = Module.objects.filter(domain_id=domain_id).values('id', name=models.F('module_name'))
    return JsonResponse(list(modules), safe=False)


@login_required
@user_passes_test(is_student)
def api_student_materials(request):
    domain_id = request.GET.get('domain')
    subdomain_id = request.GET.get('subdomain')
    module_id = request.GET.get('module')

    try:
        student = request.user.studentprofile_set.get(is_current=True)
    except ObjectDoesNotExist:
        return JsonResponse({'error': 'Student profile not found'}, status=404)

    now = timezone.now()
    filters = {
        'college': student.college,
        'course': student.course,
        'section': student.section,
        'semester': student.semester,
        'year': student.year,
        'start_datetime__lte': now,
        'end_datetime__gte': now,
    }
    if domain_id:
        filters['material__domain_id'] = domain_id
    if subdomain_id:
        filters['material__subdomain_id'] = subdomain_id
    if module_id:
        filters['material__module_id'] = module_id

    materials = ScheduledMaterial.objects.filter(**filters).select_related(
        'material', 'material__domain', 'material__subdomain', 'material__module'
    ).order_by('-start_datetime')

    material_list = []
    for idx, m in enumerate(materials):
        # Calculate file size estimate or real size
        file_size = "245 KB"
        pdf_file = getattr(m.material, 'material_pdf', None)
        if pdf_file and hasattr(pdf_file, 'size'):
            try:
                sz = pdf_file.size
                if sz > 1024 * 1024:
                    file_size = f"{sz / (1024 * 1024):.1f} MB"
                else:
                    file_size = f"{max(1, sz // 1024)} KB"
            except Exception:
                file_size = "245 KB"

        material_list.append({
            'id': str(m.id),
            'material_code': f"MAT-{idx+1:04d}",
            'title': m.material.title,
            'description': m.material.description,
            'domain': m.material.domain.domain_name if m.material.domain else 'General',
            'subdomain': m.material.subdomain.subdomain_name if m.material.subdomain else '',
            'module': m.material.module.module_name if m.material.module else '',
            'uploaded_on': m.start_datetime.strftime("%d %b %Y") if m.start_datetime else 'Recently',
            'file_size': file_size,
            'video_url': m.material.video_url or '',
            'video_file_url': m.material.video_file.url if m.material.video_file else '',
            'file_url': m.material.material_pdf.url if m.material.material_pdf else '',
            'document_url': m.material.document_file.url if (hasattr(m.material, 'document_file') and m.material.document_file) else '',
            'ppt_url': m.material.ppt_file.url if (hasattr(m.material, 'ppt_file') and m.material.ppt_file) else '',
            'excel_url': m.material.excel_file.url if (hasattr(m.material, 'excel_file') and m.material.excel_file) else '',
        })

    return JsonResponse(material_list, safe=False)

# ======================== SCHEDULING CRUD ========================

@login_required
@user_passes_test(is_admin)
@require_POST
def schedule_material(request):
    """Schedule a material for specific college, course, section, semester, and year."""
    try:
        material_id = request.POST.get("material_id")
        college_id = request.POST.get("college")
        course_id = request.POST.get("course")
        section_id = request.POST.get("section")
        semester = request.POST.get("semester")
        year = request.POST.get("year")
        start_datetime = request.POST.get("start_datetime")
        end_datetime = request.POST.get("end_datetime")

        if not all([material_id, college_id, course_id, section_id, semester, year, start_datetime, end_datetime]):
            return JsonResponse({"error": "All fields are required"}, status=400)

        material = get_object_or_404(Material, id=material_id)
        college = get_object_or_404(College, id=college_id)
        course = get_object_or_404(Course, id=course_id)
        section = get_object_or_404(Section, name=section_id)  

        start = parse_datetime(start_datetime)
        end = parse_datetime(end_datetime)
        if not start or not end:
            return JsonResponse({"error": "Invalid date format"}, status=400)
        if end <= start:
            return JsonResponse({"error": "End time must be after start time"}, status=400)

        # Avoid duplicates
        ScheduledMaterial.objects.update_or_create(
            material=material,
            college=college,
            course=course,
            section=section,
            semester=semester,
            year=year,
            defaults={
                "start_datetime": start,
                "end_datetime": end,
            }
        )
        return JsonResponse({"status": "success", "message": "Material scheduled successfully"})
    except Exception as e:
        logger.exception("schedule_material error")
        return JsonResponse({"error": str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
def list_schedules(request):
    """List all scheduled materials"""
    try:
        schedules = ScheduledMaterial.objects.select_related(
            "material", "college", "course", "section"
        ).order_by("-created_at")

        data = []
        for s in schedules:
            data.append({
                "id": str(s.id),
                "material_id": str(s.material.id),
                "material_title": s.material.title,
                "college": s.college.name,
                "course": s.course.name,
                "section": s.section.name,
                "semester": s.semester,
                "year": s.year,
                "start_datetime": s.start_datetime.strftime("%Y-%m-%d %H:%M"),
                "end_datetime": s.end_datetime.strftime("%Y-%m-%d %H:%M"),
            })
        return JsonResponse(data, safe=False)
    except Exception as e:
        logger.exception("list_schedules error")
        return JsonResponse({"error": str(e)}, status=500)



@login_required
@user_passes_test(is_admin)
@require_POST
def update_schedule(request, schedule_id):
    try:
        schedule = get_object_or_404(ScheduledMaterial, id=schedule_id)
        start_datetime = request.POST.get("start_datetime")
        end_datetime = request.POST.get("end_datetime")

        if not start_datetime or not end_datetime:
            return JsonResponse({'error': 'Start and end datetime required'}, status=400)

        schedule.start_datetime = start_datetime
        schedule.end_datetime = end_datetime
        schedule.save()

        return JsonResponse({'status': 'success', 'message': 'Schedule updated successfully'})
    except Exception as e:
        logger.exception("update_schedule")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
@require_POST
def delete_schedule(request, schedule_id):
    """Delete a scheduled material"""
    try:
        schedule = get_object_or_404(ScheduledMaterial, id=schedule_id)
        schedule.delete()
        return JsonResponse({"status": "success", "message": "Scheduled material deleted successfully"})
    except Exception as e:
        logger.exception("delete_schedule error")
        return JsonResponse({"error": str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
def admin_get_colleges(request):
    """Return all colleges"""
    colleges = College.objects.values('id', 'name')
    return JsonResponse(list(colleges), safe=False)


@login_required
@user_passes_test(is_admin)
def admin_get_courses(request, college_id=None):
    try:
        if not college_id or college_id == "00000000-0000-0000-0000-000000000000":
            return JsonResponse([], safe=False)
        # Adjust field name based on your model
        try:
            courses = Course.objects.filter(college_id=college_id).values('id', 'name')
        except FieldError:
            # fallback if field name differs
            courses = Course.objects.all().values('id', 'name')
        return JsonResponse(list(courses), safe=False)
    except Exception as e:
        logger.exception("admin_get_courses error")
        return JsonResponse({"error": str(e)}, status=500)



@login_required
@user_passes_test(is_admin)
def admin_get_sections(request, course_id=None):
    """Return all sections (since Section has no FK to Course)."""
    try:
        sections = Section.objects.all().values('name')
        data = [{'id': s['name'], 'name': s['name']} for s in sections]
        return JsonResponse(data, safe=False)
    except Exception as e:
        logger.exception("admin_get_sections error")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_admin)
def admin_get_semesters(request):
    """Fetch semesters dynamically from DB if model/table exists; fallback to default"""
    try:
         # optional if you have a Semester model
        semesters = Semester.objects.values('id', 'name')
        data = [{'id': str(s['id']), 'name': s['name']} for s in semesters]
    except Exception:
        # fallback if no semester table
        data = [{'id': i, 'name': f'Semester {i}'} for i in range(1, 13)]
    return JsonResponse(data, safe=False)


@login_required
@user_passes_test(is_admin)
def admin_get_years(request):
    """Fetch years dynamically from DB if model/table exists; fallback to default"""
    try:
       # optional if you have a Year model
        years = Year.objects.values('id', 'name')
        data = [{'id': str(y['id']), 'name': y['name']} for y in years]
    except Exception:
        # fallback static year options (1–5)
        data = [{'id': i, 'name': f'Year {i}'} for i in range(1, 6)]
    return JsonResponse(data, safe=False)




#################### END of ADMIN SECTION  ########################################################################################

#################################### STUDENT SECTION ##########################################################

# OK --- STUDENT SECTION ---

@login_required
@user_passes_test(is_student)
def get_domains(request):
    domains = Domain.objects.all().values('id', 'domain_name')
    return JsonResponse(list(domains), safe=False)


@login_required
@user_passes_test(is_student)
def get_modules(request):
    domain_id = request.GET.get('domain_id')
    modules = Module.objects.filter(domain_id=domain_id).values('id', 'module_name')
    return JsonResponse(list(modules), safe=False)


# OK NEW: Fetch Subdomains for selected Domain
@login_required
@user_passes_test(is_student)
def get_subdomains(request):
    domain_id = request.GET.get('domain_id')
    subdomains = SubDomain.objects.filter(domain_id=domain_id).values('id', 'subdomain_name')
    return JsonResponse(list(subdomains), safe=False)

@login_required
@user_passes_test(is_student)
def api_student_materials(request):
    """
    Returns materials available to the logged-in student,
    filtered by domain, module, and (optionally) subdomain.
    """
    domain_id = request.GET.get('domain')
    module_id = request.GET.get('module')
    subdomain_id = request.GET.get('subdomain')

    try:
        student = request.user.studentprofile_set.get(is_current=True)
    except ObjectDoesNotExist:
        return JsonResponse([], safe=False)

    now = timezone.now()

    section_value = (
        student.section.name
        if hasattr(student.section, "name")
        else student.section
    )

    # ---- Primary Filter ----
    filters = {
        'college': student.college,
        'course': student.course,
        'section__name': str(section_value),
        'semester': int(student.semester),
        'year': int(student.year),
        'start_datetime__lte': now,
        'end_datetime__gte': now,
    }

    if domain_id:
        filters['material__domain_id'] = domain_id
    if module_id:
        filters['material__module_id'] = module_id
    if subdomain_id:
        filters['material__subdomain_id'] = subdomain_id

    schedules = (
        ScheduledMaterial.objects
        .filter(**filters)
        .select_related('material', 'college', 'course', 'section')
        .distinct()
    )

    # ---- 🔁 Retry without date filters if no match ----
    if not schedules.exists():
        filters.pop('start_datetime__lte', None)
        filters.pop('end_datetime__gte', None)
        schedules = (
            ScheduledMaterial.objects
            .filter(**filters)
            .select_related('material', 'college', 'course', 'section')
            .distinct()
        )

    # ---- Build response ----
    materials = []
    for sm in schedules:
        mat = sm.material
        materials.append({
            'id': str(mat.id),
            'title': mat.title,
            'description': mat.description or '',
            'domain': mat.domain.domain_name if mat.domain else '',
            'module': mat.module.module_name if mat.module else '',
            'subdomain': mat.subdomain.subdomain_name if mat.subdomain else '',
            'file_url': mat.material_pdf.url if mat.material_pdf else '',
            'document_url': mat.document_file.url if mat.document_file else '',
            'ppt_url': mat.ppt_file.url if mat.ppt_file else '',
            'excel_url': mat.excel_file.url if mat.excel_file else '',
            'video_url': mat.video_url or '',
            'video_file_url': mat.video_file.url if mat.video_file else '',
        })

    return JsonResponse(materials, safe=False)


@login_required
@user_passes_test(is_student)
def download_material_file(request, material_id, file_type):
    """
    Securely download a file from Material by type.
    file_type: pdf, document, ppt, excel, or video
    """
    valid_fields = {
        'pdf': 'material_pdf',
        'document': 'document_file',
        'ppt': 'ppt_file',
        'excel': 'excel_file',
        'video': 'video_file',
    }

    if file_type not in valid_fields:
        return JsonResponse({'error': 'Invalid file type'}, status=400)

    material = get_object_or_404(Material, id=material_id)
    file_field = getattr(material, valid_fields[file_type])

    if not file_field:
        return JsonResponse({'error': f'{file_type.title()} not found for this material.'}, status=404)

    file_path = file_field.path
    if not os.path.exists(file_path):
        raise Http404("File not found")

    filename = os.path.basename(file_path)
    response = FileResponse(open(file_path, 'rb'), as_attachment=True, filename=smart_str(filename))
    return response