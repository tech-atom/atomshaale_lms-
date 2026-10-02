#users/urls.py
from django.urls import path, reverse_lazy
from django.conf import settings
from django.contrib.auth import views as auth_views
from django_ratelimit.decorators import ratelimit
from . import views
from users.forms import CustomPasswordResetForm
from users.forms import CustomSetPasswordForm

urlpatterns = [
    # Login (rate limited by IP and by email)
    path(
        'login/',
        ratelimit(key='ip', rate=settings.LOGIN_IP_RATE, method='POST', block=True)(
            ratelimit(key='post:email', rate=settings.LOGIN_EMAIL_RATE, method='POST', block=True)(
                views.login_view
            )
        ),
        name='login'
    ),
    path('logout/', views.logout_view, name='logout'),
    path('register/', views.student_register, name='student_register'),
    path('', views.home_view, name='home'),

    # Password reset (rate limited by IP and by email)
    path(
    'password_reset/',
    ratelimit(key='ip', rate=settings.PASSWORD_RESET_IP_RATE, method='POST', block=True)(
        ratelimit(key='post:email', rate=settings.PASSWORD_RESET_EMAIL_RATE, method='POST', block=True)(
            auth_views.PasswordResetView.as_view(
                template_name='users/password_reset_form.html',
                form_class=CustomPasswordResetForm,  # OK Use custom form here
                success_url=reverse_lazy('password_reset_done'),
            )
        )
    ),
    name='password_reset'
),
    path(
        'password_reset/done/',
        auth_views.PasswordResetDoneView.as_view(
            template_name='users/password_reset_done.html'
        ),
        name='password_reset_done'
    ),
    path(
        'reset/<uidb64>/<token>/',
        auth_views.PasswordResetConfirmView.as_view(
            template_name='users/password_reset_confirm.html',
            form_class=CustomSetPasswordForm,
            success_url=reverse_lazy('password_reset_complete')
        ),
        name='password_reset_confirm'
    ),
    path(
        'reset/done/',
        auth_views.PasswordResetCompleteView.as_view(
            template_name='users/password_reset_complete.html'
        ),
        name='password_reset_complete'
    ),

    # Email verification (optional to rate limit, but can be added if needed)
    path('verify/<uidb64>/<token>/', views.email_verify, name='email_verify'),
]
    