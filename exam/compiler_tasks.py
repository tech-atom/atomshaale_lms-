from celery import shared_task


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 2},
    queue='compiler_queue',
    time_limit=40,
    soft_time_limit=35,
)
def execute_compiler_job(self, payload):
    """Execute one job only through the isolated Docker sandbox."""
    from .sandbox import run_sandboxed

    return run_sandboxed(_add_question_cases(payload))


def _add_question_cases(payload):
    payload = dict(payload)
    question_id = payload.get('question_id')
    if not question_id:
        return payload

    from .models import ExamQuestion
    question = ExamQuestion.objects.filter(id=question_id, type='Code').first()
    if question and question.test_cases:
        payload['test_cases'] = question.test_cases
    elif question and question.expected_output:
        payload['test_cases'] = [{
            'input': question.input_example or '',
            'output': question.expected_output,
        }]
    return payload