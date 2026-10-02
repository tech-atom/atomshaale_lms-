#college/urls.py
from django.urls import path
from college import views

urlpatterns = [
    #path('api/<uuid:pk>/', views.api_get_college, name='api_get_college'),
    path('api/<uuid:pk>/update/', views.api_update_college, name='api_update_college'),
    path('delete/<uuid:pk>/', views.delete_college, name='delete_college'),
    path('api/add/', views.add_college, name='add_college'), 

#-------------------course urls-------------------#
    path('courses/api/add/', views.add_course, name='add_course'),
    path('courses/api/<int:pk>/update/', views.api_update_course, name='api_update_course_course'),
    path('courses/delete/<int:pk>/', views.delete_course, name='delete_course'),
    path('courses/api/list/', views.get_courses, name='get_courses'),

     # ... section urls ...
    path('add-section/', views.add_section, name='add_section'),
    path('update-section/<str:name>/', views.api_update_section, name='api_update_section'),
    path('delete-section/<str:name>/', views.delete_section, name='delete_section'),
    path('get-sections/', views.get_sections, name='get_sections'),


   path(
        "<uuid:college_id>/student-groups/",
        views.get_college_student_groups,
        name="college_student_groups"
    ),

    path(
        "students/",
        views.get_students_by_group,
        name="college_students"
    ),

    path(
    "college/<uuid:college_id>/students/",
    views.college_students_page,
    name="college_student_page"
),

path(
    "college/<uuid:college_id>/students/<int:year>/<int:semester>/<str:section>/<str:course>/<int:batch_year>/",
    views.college_students_list,
    name="college_students_list"
),

    # Pause / Resume student group access
    path(
        'group-access/toggle/',
        views.toggle_group_access,
        name='toggle_group_access',
    ),

    # College course/section mapping APIs
    path(
        'college/<uuid:college_id>/mappings/',
        views.get_college_mappings,
        name='get_college_mappings',
    ),
    path(
        'college/<uuid:college_id>/mappings/add/',
        views.add_college_mapping,
        name='add_college_mapping',
    ),
    path(
        'college/<uuid:college_id>/mappings/remove/',
        views.remove_college_mapping,
        name='remove_college_mapping',
    ),
]
