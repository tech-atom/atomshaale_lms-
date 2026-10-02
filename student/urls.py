# student/urls.py
from django.urls import path
from student import views as student_views
from exam import views as exam_views

urlpatterns = [
    # Main pages
    path('', student_views.student_redirect_to_home, name='student_redirect'),
    path('home/', student_views.student_home_page, name='student_home_page'),
    path('dashboard/', student_views.student_dashboard, name='student_dashboard_page'),
    path('materials/', student_views.materials_page, name='student_materials_page'),
    path('exam/', student_views.exam_page, name='student_exam_page'),
    path('practice-test/', student_views.practice_test_page, name='student_practice_test_page'),
    path('performance/', student_views.performance_page, name='student_performance_page'),
    path('resume/', student_views.resume_page, name='student_resume_page'),
    path('feedback/', student_views.feedback_page, name='student_feedback_page'),

    # Resume API
    path('upload_resume/', student_views.upload_resume, name='upload_resume'),
    path('api/resumes/', student_views.get_uploaded_resumes, name='student_uploaded_resumes'),

    # Dashboard & performance APIs
   path('dashboard/data/', student_views.student_dashboard_data, name='dashboard_api'),

    path('api/performance/', exam_views.api_student_performance, name='student_get_performance'),


    path('feedback/give/', student_views.give_student_feedback, name='give_student_feedback'),

    path('redirect-after-login/', student_views.role_based_redirect, name='role_based_redirect'),

    path(
    "profile/",
    student_views.student_profile,
    name="student_profile_page"
),

path(
    "profile/edit/",
    student_views.edit_student_profile,
    name="student_profile_edit"
),
    
]
