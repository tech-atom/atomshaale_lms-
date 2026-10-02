from django.contrib import admin
from .models import PracticeTest, PracticeQuestion, PracticeResult, ScheduledPracticeTest

@admin.register(PracticeQuestion)
class PracticeQuestionAdmin(admin.ModelAdmin):
    list_display = ['practice_test', 'question_text_short', 'type', 'marks']
    list_filter = ['type', 'practice_test']
    search_fields = ['question_text']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('practice_test', 'question_text', 'type', 'marks', 'negative_mark', 'image')
        }),
        ('MCQ/True-False Options', {
            'fields': ('options', 'correct_answer'),
            'classes': ('collapse',),
            'description': 'For MCQ and True/False questions only'
        }),
        ('Coding Question Settings', {
            'fields': ('input_example', 'expected_output', 'test_cases'),
            'classes': ('collapse',),
            'description': 'For CODE questions: Add expected output or test cases for evaluation'
        }),
        ('Descriptive Settings', {
            'fields': ('expected_keywords', 'min_characters'),
            'classes': ('collapse',),
        }),
    )
    
    def question_text_short(self, obj):
        return obj.question_text[:50] + '...' if len(obj.question_text) > 50 else obj.question_text
    question_text_short.short_description = 'Question'

@admin.register(PracticeTest)
class PracticeTestAdmin(admin.ModelAdmin):
    list_display = ['title', 'domain', 'duration_minutes', 'max_marks', 'created_at']
    list_filter = ['domain', 'created_at']
    search_fields = ['title']

@admin.register(PracticeResult)
class PracticeResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'practice_test', 'marks_obtained', 'total_marks', 'submitted_at']
    list_filter = ['submitted_at', 'practice_test']
    search_fields = ['student__user__username', 'practice_test__title']
    readonly_fields = ['submitted_at']

@admin.register(ScheduledPracticeTest)
class ScheduledPracticeTestAdmin(admin.ModelAdmin):
    list_display = ['practice_test', 'college', 'start_datetime', 'end_datetime', 'course']
    list_filter = ['college', 'course', 'start_datetime']
    search_fields = ['practice_test__title', 'college__name']
