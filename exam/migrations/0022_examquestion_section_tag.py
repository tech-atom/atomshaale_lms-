from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exam", "0021_examresult_question_time_map"),
    ]

    operations = [
        migrations.AddField(
            model_name="examquestion",
            name="section_tag",
            field=models.CharField(
                blank=True,
                help_text="Example: Python, C, Java, GK",
                max_length=100,
                null=True,
            ),
        ),
    ]
