# admin_panel/urls.py
from django.urls import path
from . import views
from .views import admin_registration
from . import views as admin_views


urlpatterns = [
    # -------------------- Admin Dashboard & Main Pages --------------------
    path("admin/dashboard/", views.admin_dashboard_page, name="admin_dashboard"),
    path("admin/dashboard/stats/", views.admin_dashboard_stats_api, name="admin_dashboard_stats_api"),
    path("admin/college/", views.college_html_page, name="admin_college"),
    path("admin/domain/", views.domain_module_page, name="admin_domain_page"),
    path("admin/register/", admin_registration, name="admin_registration"),
    path("admin/assessment/", views.admin_assessment_page, name="admin_assessment_page"),
    path("admin/materials/", views.admin_material_page, name="admin_material_page"),
    path("admin/trainer/", views.admin_trainer_page, name="admin_trainer"),
    

    # -------------------- Student Performance --------------------
    path("admin/student-performance/", views.admin_student_performance_page, name="admin_student_performance_page"),
    path("admin/api/performance/dropdowns/", views.admin_perf_dropdowns, name="admin_perf_dropdowns"),
    path("admin/api/performance/tests/", views.admin_perf_tests, name="admin_perf_tests"),
    path("admin/api/performance/results/", views.admin_perf_results, name="admin_perf_results"),
    path("admin/api/performance/result-detail/", views.admin_perf_result_detail, name="admin_perf_result_detail"),
    path("admin/api/performance/download/", views.admin_perf_download, name="admin_perf_download"),

    # -------------------- Student Resumes --------------------
    path("admin/student-resumes/", views.admin_student_resume_page, name="admin_student_resumes"),
    path("admin/api/colleges/", admin_views.admin_college_list_api, name="admin_college_list_api"),
    path("admin/api/courses/", admin_views.admin_course_list_api, name="admin_course_list_api"),
    path("admin/api/student-resume-filters/", admin_views.admin_student_resume_filters_api, name="admin_student_resume_filters_api"),
    path("admin/api/student-resumes/", admin_views.admin_student_resume_api, name="admin_student_resume_api"),
    path("admin/api/student-resumes/download-zip/", views.admin_student_resume_download_zip, name="admin_student_resume_download_zip"),

    # -------------------- Trainer Management --------------------
    path("admin/trainers/", views.admin_trainer_list, name="admin_trainer_list"),
    path("admin/trainers/<uuid:trainer_id>/delete/", views.admin_trainer_delete, name="admin_trainer_delete"),
    path("admin/trainers/<uuid:trainer_id>/download/", views.admin_trainer_download_profile, name="admin_trainer_download_profile"),
   
   # ------------------------ Attendance Management ------------------------
   path("admin/attendance/", views.admin_attendance_page, name="admin_attendance_page"),
   path("admin/attendance/list/", views.admin_attendance_list, name="admin_attendance_list"),
   path("admin/attendance/download/", views.admin_attendance_download, name="admin_attendance_download"),
   path("admin/api/colleges/", admin_views.admin_college_list_api, name="admin_college_list_api"),
   path("api/colleges/", views.get_colleges, name="get_colleges"),
   path("api/courses/", views.get_courses, name="get_courses"), 
   path("api/sections/", views.get_sections, name="get_sections"),
   path("api/years/", views.get_year_choices, name="get_year_choices"),
   path("api/semesters/", views.get_semester_choices, name="get_semester_choices"),

    # ------------------------ Feedback Management ------------------------
    path("api/admin/admin/feedback/list/", views.admin_feedback_list, name="admin_feedback_list"),
    path("api/admin/admin/feedback/download/", views.admin_feedback_download, name="admin_feedback_download"),
    path("api/admin/admin/feedback/", views.admin_feedback_page, name="admin_feedback_page"),
    path("api/admin/sections/", views.get_sections, name="admin_sections_api"),
    path("api/admin/trainers/", views.get_trainers, name="admin_trainers_api"),
    path("feedback/session/", views.admin_feedback_session_detail, name="admin_feedback_session_detail"),
    path("feedback/detail/<uuid:feedback_id>/",views.admin_feedback_detail,name="admin_feedback_detail"),
    # ------------------------ Session Management ------------------------
 
## --- Session Scheduling ---
path("admin/schedule/", views.admin_schedule_page, name="admin_schedule_page"),
path("api/colleges/", views.get_colleges, name="get_colleges"),
path("api/courses/", views.get_courses, name="get_courses"),
path("api/sections/", views.get_sections, name="get_sections"),



    path("api/domains/", views.get_domains, name="get_domains"),
    path("api/subdomains/<uuid:domain_id>/", views.get_subdomains, name="get_subdomains"),
    path("api/modules/", views.get_modules, name="admin_modules_api"),
    path("api/trainers/", views.get_trainers, name="get_trainers"),
    path("api/schedule/create/", views.create_session_schedule, name="create_schedule"),
    path("api/schedule/bulk-create/", views.bulk_create_session_schedule, name="bulk_create_schedule"),
    path("api/schedule/bulk-excel-upload/", views.bulk_upload_session_schedule_excel, name="bulk_upload_schedule_excel"),
    path("api/semesters/", views.get_semester_choices, name="get_semester_choices"),
    path("api/years/", views.get_year_choices, name="get_year_choices"),
    path("api/schedule/list/", views.list_session_schedules, name="list_session_schedules"),
    path("api/schedule/delete/<uuid:schedule_id>/", views.delete_session_schedule, name="delete_session_schedule"),
    path("api/schedule/update/<uuid:schedule_id>/", views.update_session_schedule, name="update_session_schedule"),



# OK Trainer Daily Reports for Admin
path("admin/trainer-reports/", views.admin_trainer_reports_page, name="admin_trainer_reports"),
path("trainer-reports/api/", views.admin_trainer_reports_api, name="admin_trainer_reports_api"),
path("admin/api/trainers/", views.admin_trainer_list, name="admin_trainer_list"),
path("admin/api/colleges/", views.admin_college_list_api, name="admin_college_list_api"),
path("trainer-reports/export/", views.export_trainer_reports_excel, name="export_trainer_reports_excel"),
    path('api/trainers/', views.trainer_list_api, name='trainer_list_api'),

    # Student edit and delete URLs
    path("admin/student/<uuid:student_id>/edit/", views.admin_edit_student, name="admin_edit_student"),
    path("admin/student/<uuid:student_id>/delete/", views.admin_delete_student, name="admin_delete_student"),
]
