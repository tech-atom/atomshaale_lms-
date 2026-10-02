# users/views.py
from django.contrib.auth import authenticate, login,logout,get_user_model
from django.shortcuts import render, redirect
from .forms import UserLoginForm, StudentRegistrationForm, CustomSetPasswordForm
from django.contrib import messages
from django.http import JsonResponse
from http import HTTPStatus
from django.contrib.auth.decorators import login_required
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from .utils import send_verification_email
from django.urls import reverse

User = get_user_model()


def _style_set_password_form(form):
    form.fields['new_password1'].widget.attrs.update({
        'class': 'verify-input',
        'placeholder': 'Enter new password',
        'autocomplete': 'new-password',
    })
    form.fields['new_password2'].widget.attrs.update({
        'class': 'verify-input',
        'placeholder': 'Confirm new password',
        'autocomplete': 'new-password',
    })
    return form


def home_view(request):
    return render(request, 'users/home.html')
def login_view(request):
    form = UserLoginForm(request.POST or None)

    if request.method == 'POST':
        if form.is_valid():
            email = form.cleaned_data.get('email')
            password = form.cleaned_data.get('password')
            user = authenticate(request, email=email, password=password)
            if user is not None:
                # --- Student group pause check ---
                if user.role == 'student':
                    from student.models import StudentProfile
                    from college.models import StudentGroupAccess
                    try:
                        profile = StudentProfile.objects.select_related(
                            'college', 'section', 'course'
                        ).get(user=user, is_current=True)
                        paused = StudentGroupAccess.is_group_paused(
                            college_id=profile.college_id,
                            year=profile.year,
                            semester=profile.semester,
                            section_name=profile.section.name if profile.section else None,
                            course_name=profile.course.name if profile.course else None,
                            batch_year=profile.batch_year,
                        )
                        if paused:
                            msg = (
                                "Your portal access has been temporarily paused by your institution. "
                                "Please contact your administrator."
                            )
                            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                                return JsonResponse({'status': 'error', 'message': msg}, status=HTTPStatus.FORBIDDEN)
                            messages.error(request, msg)
                            return render(request, 'login.html', {'form': form})
                    except StudentProfile.DoesNotExist:
                        pass  # No profile yet — allow login
                # --- End pause check ---

                # Determine redirect target by role and show a success popup first.
                if user.role == 'student':
                    redirect_target = reverse('student_home_page')
                elif user.role == 'trainer':
                    redirect_target = reverse('trainer_dashboard')
                elif user.role == 'tpo':
                    redirect_target = reverse('tpo_dashboard')
                else:
                    redirect_target = reverse('admin_dashboard')

                login(request, user)

                if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                    return JsonResponse({'status': 'success', 'redirect_url': redirect_target}, status=HTTPStatus.OK)

                return redirect(redirect_target)

            else:
                # User doesn't exist or invalid credentials
                if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                    return JsonResponse({'status': 'error', 'message': 'Invalid credentials'}, status=HTTPStatus.UNAUTHORIZED)
                messages.error(request, "Invalid email or password.")
                return render(request, 'login.html', {'form': form})
        else:
            email_errors = form.errors.get('email', [])
            password_errors = form.errors.get('password', [])

            if email_errors:
                messages.error(request, "Email ID is not registered.")
            elif password_errors:
                messages.error(request, "Incorrect password.")
            else:
                messages.error(request, "Invalid login details.")

            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                ajax_message = "Invalid form data."
                if email_errors:
                    ajax_message = "Email ID is not registered."
                elif password_errors:
                    ajax_message = "Incorrect password."
                return JsonResponse({'status': 'error', 'message': ajax_message}, status=HTTPStatus.BAD_REQUEST)

    return render(request, 'login.html', {'form': form})
@login_required
def logout_view(request):
    logout(request)
    return redirect('login')


def student_register(request):
    if request.method == 'POST':
        form = StudentRegistrationForm(request.POST)
        if form.is_valid():
            try:
                user, student_profile = form.save()

                # Send verification email
                send_verification_email(request, user)

                messages.success(request, "Registration successful! Please check your email to set your password and verify your account.")
                return redirect('login')
            except Exception as e:
                messages.error(request, f"An error occurred during registration: {str(e)}")
        else:
            # Form has errors
            for field, errors in form.errors.items():
                for error in errors:
                    if field == '__all__':
                        messages.error(request, str(error))
                    else:
                        messages.error(request, f"{field}: {error}")
    else:
        form = StudentRegistrationForm()

    return render(request, 'users/student_register.html', {'form': form})
def email_verify(request, uidb64, token):
    try:
        uid = urlsafe_base64_decode(uidb64).decode()
        user = User.objects.get(pk=uid)
    except Exception:
        user = None

    if user and default_token_generator.check_token(user, token):
        if request.method == 'POST':
            form = _style_set_password_form(CustomSetPasswordForm(user, request.POST))
            if form.is_valid():
                form.save()
                user.is_active = True
                user.is_verified = True
                user.save()
                messages.success(request, "Your account is verified! You may now log in.")
                return redirect('login')
            messages.error(request, "Please fix password issues and try again.")
        else:
            form = _style_set_password_form(CustomSetPasswordForm(user))
        return render(request, 'email_verify.html', {'form': form})
    else:
        return render(request, 'email_verify_invalid.html')
