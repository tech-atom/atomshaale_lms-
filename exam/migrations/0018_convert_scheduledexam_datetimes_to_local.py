from zoneinfo import ZoneInfo

from django.db import migrations
from django.utils import timezone


def forwards(apps, schema_editor):
    ScheduledExam = apps.get_model("exam", "ScheduledExam")
    local_tz = ZoneInfo("Asia/Kolkata")

    for schedule in ScheduledExam.objects.all().iterator():
        updated_fields = []

        for field_name in ("start_datetime", "end_datetime"):
            dt = getattr(schedule, field_name)
            if dt is None:
                continue

            # Reinterpret the stored wall-clock time in the local exam timezone.
            naive_dt = dt.replace(tzinfo=None) if timezone.is_aware(dt) else dt
            local_aware_dt = timezone.make_aware(naive_dt, local_tz)
            setattr(schedule, field_name, local_aware_dt)
            updated_fields.append(field_name)

        if updated_fields:
            schedule.save(update_fields=updated_fields)


class Migration(migrations.Migration):

    dependencies = [
        ("exam", "0017_alter_scheduledexam_section"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]