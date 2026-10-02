from django.urls import path
from . import views

urlpatterns = [
    # ----------------- ADMIN -----------------
    path('admin/domains/add/', views.add_domain, name='add_domain'),
    path('admin/domains/update/<uuid:domain_id>/', views.update_domain, name='update_domain'),
    path('admin/domains/delete/<uuid:domain_id>/', views.delete_domain, name='delete_domain'),

    path('admin/subdomains/add/', views.add_subdomain, name='add_subdomain'),
    path('admin/subdomains/update/<uuid:subdomain_id>/', views.update_subdomain, name='update_subdomain'),
    path('admin/subdomain/delete/', views.delete_subdomain, name='delete_subdomain'),

    path('admin/modules/add/', views.add_module, name='add_module'),
    path('admin/modules/update/<uuid:module_id>/', views.update_module, name='update_module'),
    path('admin/modules/delete/<uuid:module_id>/', views.delete_module, name='delete_module'),

    # ajax dropdowns for admin UI
    path('admin/domains/json/', views.admin_get_domains, name='admin_get_domain'),
    path('admin/subdomains/json/', views.get_subdomains_by_domain, name='admin_get_subdomains'),
    path('admin/domains/<uuid:domain_id>/subdomains/', views.get_subdomains_by_domain, name='get_subdomains_by_domain'),
    path('admin/modules/json/', views.admin_get_modules, name='admin_get_modules'),

    # materials
    path('admin/materials/upload/', views.upload_material, name='upload_material'),
    path('admin/materials/list/', views.list_materials, name='list_materials'),
    path('admin/materials/delete/<uuid:material_id>/', views.delete_material, name='delete_material'),

   # ----------------- STUDENT -----------------
    path('student/domains/', views.get_domains, name='student_get_domain'),
    path('student/modules/', views.get_modules, name='student_get_modules'),
    path('student/subdomains/', views.get_subdomains, name='student_get_subdomains'),
    path('student/materials/', views.api_student_materials, name='api_student_get_materials'),
    path('download/<uuid:material_id>/<str:file_type>/', views.download_material_file, name='download_material_file'),

    # ----------------- ADMIN: SCHEDULING -----------------
    path('admin/semesters/', views.admin_get_semesters, name='admin_get_semesters'),
    path('admin/years/', views.admin_get_years, name='admin_get_years'),
    path('admin/colleges/', views.admin_get_colleges, name='admin_get_colleges'),
    path('admin/courses/<uuid:college_id>/', views.admin_get_courses, name='admin_get_courses'),
    path('admin/sections/<uuid:course_id>/', views.admin_get_sections, name='admin_get_sections'),
    path('admin/materials/schedule/', views.schedule_material, name='schedule_material'),
    path('admin/materials/schedules/', views.list_schedules, name='list_schedules'),
    path('admin/materials/schedules/update/<uuid:schedule_id>/', views.update_schedule, name='update_schedule'),
    path('admin/materials/schedules/delete/<uuid:schedule_id>/', views.delete_schedule, name='delete_schedule'),
    # materials/urls.py
    path('admin/sections/<str:course_id>/', views.admin_get_sections, name='admin_get_sections'),
    path('admin/courses/<str:college_id>/', views.admin_get_courses, name='admin_get_courses'),

]
