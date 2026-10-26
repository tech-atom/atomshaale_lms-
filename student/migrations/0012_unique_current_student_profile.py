from django.db import migrations, models
from django.db.models import Count, Q


def retain_latest_current_profile(apps, schema_editor):
    StudentProfile = apps.get_model('student', 'StudentProfile')
    database = schema_editor.connection.alias
    duplicate_user_ids = list(
        StudentProfile.objects.using(database)
        .filter(is_current=True)
        .values('user_id')
        .annotate(profile_count=Count('id'))
        .filter(profile_count__gt=1)
        .values_list('user_id', flat=True)
    )

    for user_id in duplicate_user_ids:
        current_profiles = (
            StudentProfile.objects.using(database)
            .filter(user_id=user_id, is_current=True)
            .order_by('-created_at', '-id')
        )
        keep_id = current_profiles.values_list('id', flat=True).first()
        current_profiles.exclude(id=keep_id).update(is_current=False)


class Migration(migrations.Migration):

    dependencies = [
        ('student', '0011_remove_studentprofile_resume_data'),
    ]

    operations = [
        migrations.RunPython(
            retain_latest_current_profile,
            migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name='studentprofile',
            constraint=models.UniqueConstraint(
                condition=Q(is_current=True),
                fields=('user',),
                name='unique_current_student_profile_per_user',
            ),
        ),
    ]