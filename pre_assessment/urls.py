from django.urls import path
from . import views

urlpatterns = [
    # Admin Views
    path('admin/', views.admin_page, name='pre_assessment_admin'),
    path('admin/api/list/', views.admin_list_api, name='pre_assessment_list_api'),
    path('admin/api/create/', views.admin_create_api, name='pre_assessment_create_api'),
    path('admin/api/toggle/<uuid:pk>/', views.admin_toggle_api, name='pre_assessment_toggle_api'),
    path('admin/api/delete/<uuid:pk>/', views.admin_delete_api, name='pre_assessment_delete_api'),
    path('admin/api/results/<uuid:pk>/', views.admin_results_api, name='pre_assessment_results_api'),
    path('admin/api/allow-retake/<int:result_id>/', views.admin_allow_retake_api, name='pre_assessment_allow_retake_api'),
    path('admin/api/remove-attempt/<int:result_id>/', views.admin_remove_attempt_api, name='pre_assessment_remove_attempt_api'),

    # Student Flow Views
    path('enter-code/', views.candidate_enter_code, name='pre_assessment_enter_code'),
    path('register/<str:code>/', views.candidate_register, name='pre_assessment_register'),
    path('exam/<str:code>/', views.candidate_exam_page, name='pre_assessment_exam_page'),
    path('thank-you/<str:code>/', views.candidate_thank_you, name='pre_assessment_thank_you'),

    # Student Flow APIs
    path('api/<str:code>/meta/', views.api_get_exam_meta, name='pre_assessment_get_exam_api'),
    path('api/<str:code>/questions/', views.api_get_exam_questions, name='pre_assessment_get_questions_api'),
    path('api/<str:code>/live-update/', views.api_live_update, name='pre_assessment_live_update_api'),
    path('api/<str:code>/submit/', views.api_submit, name='pre_assessment_submit_api'),
]
