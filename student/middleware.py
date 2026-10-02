# student/middleware.py
from django.shortcuts import redirect
from django.contrib.auth import logout
from django.contrib import messages
from django.urls import reverse
from django.http import JsonResponse
import logging


logger = logging.getLogger(__name__)


class StudentAccessMiddleware:
    """
    On every request, checks if the logged-in student group is paused.
    If paused, logs them out and redirects to login with an explanatory message.
    Only applies to requests under /student/* paths.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only check authenticated students accessing student-area URLs
        if (
            request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'student'
            and request.path.startswith('/student/')
        ):
            try:
                from student.models import StudentProfile
                from college.models import StudentGroupAccess

                profile = (
                    StudentProfile.objects
                    .select_related('college', 'section', 'course')
                    .get(user=request.user, is_current=True)
                )

                is_paused = StudentGroupAccess.is_group_paused(
                    college_id=profile.college_id,
                    year=profile.year,
                    semester=profile.semester,
                    section_name=profile.section.name if profile.section else None,
                    course_name=profile.course.name if profile.course else None,
                    batch_year=profile.batch_year,
                )

                if is_paused:
                    logout(request)
                    messages.error(
                        request,
                        "Your portal access has been temporarily paused by your institution. "
                        "Please contact your administrator."
                    )
                    return redirect(reverse('login'))

            except StudentProfile.DoesNotExist:
                pass
            except Exception:
                logger.exception("Student access check failed for user %s", request.user.pk)
                return JsonResponse(
                    {"error": "Student access is temporarily unavailable."},
                    status=503,
                )

        response = self.get_response(request)
        return response
