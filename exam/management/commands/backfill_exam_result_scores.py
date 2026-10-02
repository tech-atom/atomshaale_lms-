from django.core.management.base import BaseCommand
from django.db import transaction

from exam.models import ExamResult, ExamQuestion


class Command(BaseCommand):
    help = "Backfill ExamResult total_marks/marks_obtained for rows with zero totals."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist updates. Without this flag, runs in dry-run mode.",
        )
        parser.add_argument(
            "--result-id",
            type=int,
            default=None,
            help="Optional specific ExamResult id to backfill.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        target_result_id = options.get("result_id")

        qs = ExamResult.objects.select_related("exam").filter(total_marks__lte=0)
        if target_result_id is not None:
            qs = qs.filter(id=target_result_id)

        total_rows = qs.count()
        if total_rows == 0:
            self.stdout.write(self.style.SUCCESS("No ExamResult rows with total_marks <= 0 found."))
            return

        mode = "APPLY" if apply_changes else "DRY-RUN"
        self.stdout.write(self.style.WARNING(f"Running backfill in {mode} mode for {total_rows} rows."))

        updated_count = 0
        skipped_count = 0

        for result in qs.iterator():
            exam = result.exam
            if not exam:
                skipped_count += 1
                self.stdout.write(f"SKIP result_id={result.id}: exam is null")
                continue

            questions = list(ExamQuestion.objects.filter(exam=exam).values("id", "marks", "type"))
            question_count = len(questions)
            if question_count == 0:
                skipped_count += 1
                self.stdout.write(f"SKIP result_id={result.id}: exam has no questions")
                continue

            default_question_marks = float(exam.max_marks or 0) / question_count if exam.max_marks else 0.0
            marks_by_qid = {
                str(q["id"]): float(q["marks"] or 0) if float(q["marks"] or 0) > 0 else default_question_marks
                for q in questions
            }

            breakdown = list(result.question_wise_breakdown or [])
            if not breakdown:
                skipped_count += 1
                self.stdout.write(f"SKIP result_id={result.id}: breakdown is empty")
                continue

            recalculated_total = float(exam.max_marks or 0)
            if recalculated_total <= 0:
                recalculated_total = sum(marks_by_qid.values())

            recalculated_obtained = 0.0
            breakdown_changed = False

            for item in breakdown:
                qid = str(item.get("question_id", ""))
                q_marks = float(marks_by_qid.get(qid, default_question_marks) or 0)

                marks_awarded = float(item.get("marks_awarded", 0) or 0)

                # Recover previously zeroed coding scores using saved score_ratio/passed/total.
                if item.get("type") == "Code" and q_marks > 0 and marks_awarded == 0:
                    score_ratio = item.get("score_ratio")
                    if score_ratio is None:
                        passed = item.get("passed")
                        total = item.get("total")
                        if isinstance(passed, int) and isinstance(total, int) and total > 0:
                            score_ratio = passed / total
                    if isinstance(score_ratio, (int, float)) and score_ratio > 0:
                        marks_awarded = round(q_marks * float(score_ratio), 2)
                        item["marks_awarded"] = marks_awarded
                        breakdown_changed = True

                recalculated_obtained += marks_awarded

            if apply_changes:
                with transaction.atomic():
                    result.total_marks = round(recalculated_total, 2)
                    result.marks_obtained = round(recalculated_obtained, 2)
                    if breakdown_changed:
                        result.question_wise_breakdown = breakdown
                    result.save(update_fields=["total_marks", "marks_obtained", "question_wise_breakdown"])

            updated_count += 1
            self.stdout.write(
                f"OK result_id={result.id}: total {result.total_marks} -> {round(recalculated_total, 2)}, "
                f"obtained {result.marks_obtained} -> {round(recalculated_obtained, 2)}"
            )

        self.stdout.write("-" * 72)
        self.stdout.write(
            self.style.SUCCESS(
                f"Completed ({mode}). updated={updated_count}, skipped={skipped_count}, total={total_rows}"
            )
        )
