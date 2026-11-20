from django.db import migrations


TABLE_NAME = "exam_examquestion"
LEGACY_REQUIRED_COLUMNS = (
    "ai_interview_job_description",
    "ai_interview_role",
)


def set_legacy_column_defaults(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s
              AND column_name = ANY(%s)
            """,
            [TABLE_NAME, list(LEGACY_REQUIRED_COLUMNS)],
        )
        existing_columns = {row[0] for row in cursor.fetchall()}

        table = schema_editor.quote_name(TABLE_NAME)
        for column_name in LEGACY_REQUIRED_COLUMNS:
            if column_name in existing_columns:
                column = schema_editor.quote_name(column_name)
                cursor.execute(
                    f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT ''"
                )


class Migration(migrations.Migration):

    dependencies = [
        ("exam", "0045_allow_long_correct_answers"),
    ]

    operations = [
        migrations.RunPython(
            set_legacy_column_defaults,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
