from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exam", "0020_examresult_live_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="examresult",
            name="question_time_map",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Per-question time spent in seconds, keyed by question number",
            ),
        ),
    ]
