from urllib.parse import urljoin

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.urls import reverse
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from .utils import send_verification_email_message

@shared_task(bind=True, rate_limit='14/s', queue='email_queue',max_retries=3)
def send_custom_email_task(self, subject, html_template, context, to_email):
    try:
        html_content = render_to_string(html_template, context)
        text_content = strip_tags(html_content)

        email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [to_email])
        email.attach_alternative(html_content, "text/html")
        email.send()
    except Exception as e:
        self.retry(exc=e, countdown=10)


@shared_task(
    bind=True,
    queue='email_queue',
    rate_limit=settings.EMAIL_TASK_RATE_LIMIT,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 5},
)
def send_verification_email_task(self, user_id, base_url, uidb64, token):
    user = get_user_model().objects.filter(
        pk=user_id,
        is_active=False,
        is_verified=False,
    ).first()
    if user is None:
        return False

    if not default_token_generator.check_token(user, token):
        return False

    verify_url = urljoin(
        base_url,
        reverse('email_verify', kwargs={'uidb64': uidb64, 'token': token}),
    )
    send_verification_email_message(user, verify_url)
    return True
