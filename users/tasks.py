from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings

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
