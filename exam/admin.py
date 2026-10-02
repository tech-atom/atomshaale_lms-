from django.contrib import admin
from .models import Exam, ExamQuestion, ScheduledExam, ExamResult

class ExamQuestionInline(admin.TabularInline):
    model = ExamQuestion
    extra = 1
    fields = ['question_text', 'type', 'marks', 'negative_mark', 'options', 'correct_answer', 'test_cases']

@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ['title', 'domain', 'duration_minutes', 'max_marks', 'passing_marks', 'created_at']
    search_fields = ['title', 'domain__name']
    inlines = [ExamQuestionInline]

@admin.register(ExamQuestion)
class ExamQuestionAdmin(admin.ModelAdmin):
    list_display = ['exam', 'question_text', 'type', 'marks']
    list_filter = ['type', 'exam']
    search_fields = ['question_text']
    fields = ['exam', 'question_text', 'type', 'marks', 'negative_mark', 'image', 
              'options', 'correct_answer', 'test_cases', 'input_example', 'expected_output',
              'expected_keywords', 'min_characters']

@admin.register(ScheduledExam)
class ScheduledExamAdmin(admin.ModelAdmin):
    list_display = ['exam', 'college', 'course', 'semester', 'year', 'start_datetime', 'status']
    list_filter = ['status', 'college', 'course']
    search_fields = ['exam__title']

@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'exam_title', 'marks_obtained', 'total_marks', 'submitted_at']
    list_filter = ['exam', 'submitted_at']
    search_fields = ['student__usn', 'exam_title']
    readonly_fields = ['submitted_at']


