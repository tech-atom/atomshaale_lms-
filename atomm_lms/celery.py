import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'atomm_lms.settings')

app = Celery('atomm_lms')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
from exam.tasks import execute_compiler_job  # noqa: F401
