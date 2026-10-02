#exam/urls.py
from django.urls import path
from django.conf import settings
from django_ratelimit.decorators import ratelimit
from . import views

urlpatterns = [

    path('api/admin-dropdowns/', views.admin_dropdown_data, name='admin_dropdown_data'),

    # Exam CRUD (AJAX)
    path('api/add-exam/', views.add_exam, name='admin_add_exam'),
    path('api/update-exam/<uuid:pk>/', views.update_exam, name='admin_update_exam'),
    path('api/delete-exam/<uuid:pk>/', views.delete_exam, name='admin_delete_exam'),

    # Question CRUD (AJAX)
    path('api/get-exam-questions/<uuid:pk>/', views.get_exam_questions, name='admin_get_exam_questions'),
    path('api/add-question/<uuid:exam_id>/', views.add_question, name='admin_add_question'),
    path('api/update-question/<uuid:exam_id>/<int:question_id>/', views.update_question, name='admin_update_question'),
    path('api/delete-question/<uuid:exam_id>/<int:question_id>/', views.delete_question, name='admin_delete_question'),

    # Schedule Exam (AJAX)
    path('api/schedule-exam/<uuid:exam_id>/', views.schedule_exam, name='admin_schedule_exam'),

    path('api/list-exams/', views.admin_list_exams, name='admin_list_exams'),
    path('api/list-scheduled-exams/', views.admin_list_scheduled_exams, name='admin_list_scheduled_exams'),
    path('api/delete-schedule/<uuid:pk>/', views.admin_delete_schedule, name='admin_delete_schedule'),
    path('api/update-schedule/<uuid:pk>/', views.update_scheduled_exam, name='admin_update_schedule'),
    path(
        'admin/submissions/<uuid:schedule_id>/',
        views.admin_exam_submissions,
        name='admin_exam_submissions'
    ),
    path(
        'admin/live-report/<uuid:schedule_id>/',
        views.download_live_attendance_report,
        name='download_live_attendance_report'
    ),
    path(
        'admin/allow-retake/<int:result_id>/',
        views.allow_exam_retake,
        name='allow_exam_retake'
    ),
    path(
        'admin/remove-attempt/<int:result_id>/',
        views.remove_student_exam_attempt,
        name='remove_student_exam_attempt'
    ),

    ########Student section for exam ########

    path('api/student/exam/', views.student_get_exam, name='student_get_exam'),
    path('api/student/exam/<uuid:scheduled_exam_id>/questions/', views.student_get_exam_questions, name='student_get_exam_questions'),
    path('api/student/exam/live-update/', views.student_live_update, name='student_live_update'),
    path('student/exam/live-update/', views.student_live_update, name='student_live_update_direct'),
    path('api/student/exam/<uuid:scheduled_exam_id>/submit/', views.submit_exam, name='submit_exam'),
    path('api/student/exam/results/', views.get_student_exam_results, name='get_student_exam_results'),
    path('result/', views.view_exam_result, name='view_exam_result'),
    path('api/result/<int:result_id>/', views.get_exam_result_detail, name='get_exam_result_detail'),
    path('performance/', views.performance_page, name='student_performance'),
    path('api/performance/', views.api_student_performance, name='api_student_performance'),

    # Bulk Upload
    path("admin/exams/download/<uuid:pk>/", views.admin_download_exam_paper, name="admin_download_exam_paper"),
    path("admin/exams/bulk-upload/<uuid:exam_id>/", views.admin_bulk_upload_questions, name="admin_bulk_upload_questions"),

    # Code Compiler for Exams
     path(
         'api/compile-code/',
         ratelimit(
             key='user_or_ip',
             rate=settings.COMPILER_RATE,
             method='POST',
             block=True,
            )(views.compile_code_exam),
         name='compile_code_exam',
     ),
    path('api/compile-code/<str:job_id>/', views.compiler_job_status, name='compiler_job_status'),



]
