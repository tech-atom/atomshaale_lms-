from django.urls import path
from django.conf import settings
from django_ratelimit.decorators import ratelimit
from common.compiler_guard import compiler_capacity
from . import views

urlpatterns = [
    # ---------- Student APIs / Pages ----------
    path("api/practice-tests/", views.api_practice_tests, name="student_practice_tests"),
    path("practice/start/<uuid:test_id>/", views.start_practice_test, name="start_practice_test"),  # ← ADD THIS
    path("practice/submit/<uuid:test_id>/", views.submit_practice_test, name="submit_practice_test"),
    path("practice/result/<int:result_id>/", views.practice_test_result, name="practice_test_result"),
    path("api/past-attempts/", views.api_past_practice_attempts, name="past_practice_attempts"),
    path("api/practice-questions/", views.api_practice_questions, name="practice_questions"),
    path("api/performance/", views.student_get_performance, name="student_get_performance"),
    
    # Code Compiler for Practice Tests
    path(
        'api/compile-code/',
        ratelimit(
            key='user_or_ip',
            rate=settings.COMPILER_RATE,
            method='POST',
            block=True,
        )(compiler_capacity(views.compile_code_practice)),
        name='compile_code_practice',
    ),

    # ---------- Admin UI ----------
    path("admin/practice-tests/", views.admin_practice_test_page, name="admin_practice_test_page"),
    path("admin-panel/practice-test/", views.admin_practice_test_page, name="admin_practice_test"),


    path('admin/practice-tests/schedules/<uuid:schedule_id>/', views.admin_schedule_detail, name='admin_schedule_detail'),
    path('admin/practice-tests/schedules/<uuid:schedule_id>/update/', views.admin_schedule_update, name='admin_schedule_update'),
    path('admin/practice-tests/schedules/<uuid:schedule_id>/delete/', views.admin_schedule_delete, name='admin_schedule_delete'),
    # ---------- Admin JSON APIs ----------
    # Removed the missing practice_api_list_questions route
    path("admin/practice-tests/<path:test_title>/questions/", views.practice_api_list_questions_by_name, name="practice_api_list_questions_by_name"),
    path("admin/practice-tests/<path:test_title>/questions/add/", views.practice_api_add_question_by_name, name="practice_api_add_question_by_name"),
    path("admin/practice-tests/<uuid:test_id>/questions/add/", views.practice_api_add_question, name="practice_api_add_question"),

    # Bulk upload (single declaration)
    path("admin/practice-tests/bulk-upload/", views.practice_bulk_upload, name="practice_bulk_upload"),
]
