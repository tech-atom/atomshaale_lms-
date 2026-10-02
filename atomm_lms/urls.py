from django.contrib import admin
from django.urls import path, include
from django.shortcuts import redirect
from django.conf import settings
from django.conf.urls.static import static
from common.health import healthz, readyz


urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('readyz/', readyz, name='readyz'),
    path('', include('users.urls')),
    path('', lambda request: redirect('/student/home/')), 
    path('admin/', admin.site.urls),
    path('student/', include('student.urls')),
    path('users/', include('users.urls')),
    path('admin-panel/', include('admin_panel.urls')),
    path('college/', include('college.urls')),
    path('material/', include('material.urls')),
    path('trainer/', include('trainer.urls')),
    path('practicetest/', include('practicetest.urls')), 
    path('exam/', include('exam.urls')),  # No prefix
    path('tpo/', include('tpo.urls')),
    path('pre-assessment/', include('pre_assessment.urls')),
    path('company-prep/', include('company_prep.urls')),
    
    path('api/admin/', include('admin_panel.urls')),   
]

from django.views.static import serve
from django.urls import re_path

# Serve media files in both development and production as fallback
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]