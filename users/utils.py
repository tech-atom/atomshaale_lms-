# users/utils.py
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.urls import reverse

logger = logging.getLogger(__name__)


def send_verification_email(request, user):
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    verify_url = request.build_absolute_uri(
        reverse('email_verify', kwargs={'uidb64': uidb64, 'token': token})
    )
    subject = "Welcome to AtomShaale - Complete your registration"
    learner_name = user.get_full_name() or user.first_name or "Learner"
    message = (
        f"Hi {learner_name},\n\n"
        "We are pleased to welcome you to AtomShaale, your digital learning companion powered by Atom.\n\n"
        "To complete your registration, please verify your email address and set your password by clicking the link below.\n\n"
        f"{verify_url}\n\n"
        "You are now logged into our Learning Management System, where you can:\n\n"
        "Access your courses and study materials\n"
        "Appear for exams, view results, and track your progress\n\n"
        "We encourage you to explore the platform, stay organized, and make the most of your learning journey.\n\n"
        "For any assistance or queries, please reach out to your College Management.\n\n"
        "We wish you a successful and enriching learning experience.\n\n"
        "If you have not registered or believe this message was sent to you by mistake, please feel free to ignore it.\n\n"
        "Regards,\n"
        "The AtomShaale Team"
    )
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception as exc:
        logger.exception("Verification email failed for %s: %s", user.email, exc)
        return False


def send_password_reset_email(user, uid, token, domain, protocol):
    reset_link = f"{protocol}://{domain}{reverse('password_reset_confirm', kwargs={'uidb64': uid, 'token': token})}"
    subject = "Reset Your Password - Atom Shaale LMS"
    message = (
        f"Hi {user.get_full_name() or user.email},\n\n"
        f"You requested a password reset. Click the link below to reset your password:\n\n"
        f"{reset_link}\n\n"
        "If you didn’t request this, please ignore this email."
    )
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
        return True
    except Exception as exc:
        logger.exception("Password reset email failed for %s: %s", user.email, exc)
        return False