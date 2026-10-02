from django.urls import path
from . import views

app_name = 'compiler'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('editor/', views.editor, name='editor'),
    path('setup/', views.setup, name='setup'),
    path('installation/', views.installation_guide, name='installation_guide'),
    path('api/compile/', views.compile_code, name='compile_code'),
    path('api/compiler-status/', views.compiler_status, name='compiler_status'),
    path('api/install-compiler/', views.install_compiler, name='install_compiler'),
]
