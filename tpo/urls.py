from django.urls import path
from . import views


urlpatterns = [
    path('dashboard/', views.tpo_dashboard, name='tpo_dashboard'),
    path('dashboard/data/', views.get_tpo_dashboard_data, name='get_tpo_dashboard_data'),
    path("feedback/", views.tpo_feedback, name="tpo_feedback"),
    path("feedback/data/", views.get_feedback_chart_data, name="get_feedback_chart_data"),
    path("feedback/download/excel/", views.download_feedback_excel, name="download_feedback_excel"),
    path('attendance/', views.tpo_student_attendance, name='tpo_student_attendance'),
    path('attendance/student-detail/<uuid:student_id>/', views.get_student_attendance_detail_api, name='tpo_student_attendance_detail'),
    path("attendance/download/excel/", views.download_attendance_excel, name="download_attendance_excel"),
    path('performance/', views.tpo_student_performance, name='tpo_student_performance'),
    path('performance/student-detail/<uuid:student_id>/', views.get_student_performance_detail_api, name='tpo_student_performance_detail'),
    path("performance/data/", views.get_performance_data, name="get_performance_data"),
    path("performance/download/excel/", views.download_performance_excel, name="download_performance_excel"),
    path("resumes/", views.tpo_resume, name="tpo_resume"),  # OK uses tpo_resume.html
    path("resumes/download/<uuid:student_id>/", views.download_resume, name="download_resume"),
    path("resumes/bulk-download-zip/", views.bulk_download_resumes_zip, name="bulk_download_resumes_zip"),
   path('trainer-daily-reports/', views.trainer_daily_report, name='trainer_daily_report_tpo'),
   path("trainer-daily-reports/", views.trainer_daily_report, name="trainer_daily_report"),
path("trainer-daily-reports/data/", views.trainer_daily_report_data, name="trainer_daily_report_data"),

    # Exam Monitoring
    path('exam-monitor/', views.tpo_exam_monitor, name='tpo_exam_monitor'),
    path('exam-monitor/list/', views.tpo_exam_monitor_list, name='tpo_exam_monitor_list'),
    path('exam-monitor/<uuid:schedule_id>/', views.tpo_exam_monitor_detail, name='tpo_exam_monitor_detail'),
]
