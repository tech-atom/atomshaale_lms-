from django.urls import path
from . import views


urlpatterns = [
    path('dashboard/', views.trainer_dashboard, name='trainer_dashboard'),
    path('profile/', views.trainer_profile_page, name='trainer_profile'),
    path('profile/upload/', views.upload_trainer_profile, name='upload_pdf'),
    path('api/courses/', views.api_courses, name='api_courses'),
    path('api/semesters/', views.api_semesters, name='api_semesters'),
    path('api/domains/', views.api_domains, name='api_domains'),
    # Attendance
    path('attendance/', views.trainer_attendance_view, name='trainer_attendance'),
    path('attendance/students/<uuid:session_id>/', views.get_students_for_session, name='get_students_for_session'),
    path('attendance/submit/', views.submit_attendance, name='submit_attendance'),

      # Schedule
    path('schedule/', views.trainer_schedule, name='trainer_schedule'),
    path('api/schedule/', views.trainer_schedule_api, name='trainer_schedule_api'),

    # Reports
    path('report/', views.trainer_report, name='trainer_report'),
    path('report/submit/', views.submit_trainer_report, name='submit_trainer_report'),
    path('report/list/', views.trainer_report_list, name='trainer_report_list'),
    path("trainer/api/report/<int:report_id>/update/",views.update_trainer_report,name="update_trainer_report"),
    path('report/marked-sessions/', views.get_marked_sessions_for_reports, name='get_marked_sessions_for_reports'),
 
    #profile pdf upload
    path('save_trainer_pdf/', views.save_trainer_pdf, name='save_trainer_pdf'),

    # Exam Monitoring
    path('exam-monitor/', views.trainer_exam_monitor, name='trainer_exam_monitor'),
    path('exam-monitor/list/', views.trainer_exam_monitor_list, name='trainer_exam_monitor_list'),
    path('exam-monitor/<uuid:schedule_id>/', views.trainer_exam_monitor_detail, name='trainer_exam_monitor_detail'),
    # Optional college/student list APIs
    path('api/colleges/', views.api_colleges, name='get_colleges'),
    path('api/courses/', views.api_courses, name='api_courses'),
    path('api/semesters/', views.api_semesters, name='api_semesters'),
    path('api/years/', views.api_years, name='api_years'),
    path('api/sections/', views.api_sections, name='api_sections'),
    path('api/domains/', views.api_domains, name='api_domains'),
    path('api/subdomains/', views.api_subdomains, name='api_subdomains'),
    path('api/modules/', views.api_modules, name='api_modules')
]
