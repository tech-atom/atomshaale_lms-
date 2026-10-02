from django.urls import path
from . import views

app_name = 'company_prep'

urlpatterns = [
    # Student views
    path('', views.company_list, name='company_list'),
    path('<uuid:company_id>/', views.company_dashboard, name='company_dashboard'),
    path('<uuid:company_id>/aptitude/<str:difficulty>/', views.aptitude_test, name='aptitude_test'),
    path('<uuid:company_id>/technical/', views.technical_test, name='technical_test'),
    path('<uuid:company_id>/ai-interview/', views.ai_interview, name='ai_interview'),
    path('<uuid:company_id>/ai-interview/submit/', views.submit_interview, name='submit_interview'),

    # API endpoints for placement exam console (same to same layout)
    path('api/<uuid:company_id>/<str:test_type>/meta/', views.api_get_test_meta, name='api_get_test_meta'),
    path('api/<uuid:company_id>/<str:test_type>/questions/', views.api_get_test_questions, name='api_get_test_questions'),
    path('api/<uuid:company_id>/<str:test_type>/live-update/', views.api_live_update, name='api_live_update'),
    path('api/<uuid:company_id>/<str:test_type>/submit/', views.api_submit, name='api_submit'),
    path('<uuid:company_id>/<str:test_type>/result/', views.test_result_page, name='test_result_page'),

    # Recruiter (TPO) views
    path('tpo/', views.tpo_dashboard, name='tpo_dashboard'),
    path('tpo/<uuid:company_id>/', views.tpo_company_detail, name='tpo_company_detail'),

    # Custom Admin Management Panel
    path('admin-manage/', views.admin_placement, name='admin_placement'),
    path('admin-manage/company/add/', views.admin_company_create, name='admin_company_add'),
    path('admin-manage/company/edit/<uuid:company_id>/', views.admin_company_edit, name='admin_company_edit'),
    path('admin-manage/company/delete/<uuid:company_id>/', views.admin_company_delete, name='admin_company_delete'),
    path('admin-manage/question/add/<str:q_type>/', views.admin_question_create, name='admin_question_add'),
    path('admin-manage/question/edit/<str:q_type>/<uuid:q_id>/', views.admin_question_edit, name='admin_question_edit'),
    path('admin-manage/question/delete/<str:q_type>/<uuid:q_id>/', views.admin_question_delete, name='admin_question_delete'),
    
    # AJAX APIs for Questions Management
    path('admin-manage/api/get-company-questions/<uuid:company_id>/', views.api_get_company_questions, name='api_get_company_questions'),
    path('admin-manage/api/add-company-question/<uuid:company_id>/', views.api_add_company_question, name='api_add_company_question'),
    path('admin-manage/api/update-company-question/<uuid:company_id>/<str:q_type>/<uuid:question_id>/', views.api_update_company_question, name='api_update_company_question'),
    path('admin-manage/api/delete-company-question/<uuid:company_id>/<str:q_type>/<uuid:question_id>/', views.api_delete_company_question, name='api_delete_company_question'),

    path('admin-manage/bulk-upload/', views.admin_bulk_upload, name='admin_bulk_upload'),
    path('admin-manage/download-sample-excel/', views.download_sample_excel, name='download_sample_excel'),
    path('admin-manage/api/get-general-questions/<uuid:company_id>/<str:category>/', views.api_get_general_questions, name='api_get_general_questions'),
    path('admin-manage/api/import-question-bank/<uuid:company_id>/', views.api_import_question_bank, name='api_import_question_bank'),
    path('admin-manage/api/save-rounds/<uuid:company_id>/', views.api_save_rounds, name='api_save_rounds'),
    path('admin-manage/api/schedule-assessment/<uuid:company_id>/', views.api_schedule_assessment, name='api_schedule_assessment'),
    path('tpo/api/student-attempts/<uuid:student_id>/<uuid:company_id>/', views.api_student_attempts, name='api_student_attempts'),
]
