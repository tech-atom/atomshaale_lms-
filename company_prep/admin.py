from django.contrib import admin
from .models import Company, CompanyAptitudeQuestion, CompanyTechnicalQuestion, StudentCompanyProgress, StudentPrepAttempt, AIInterviewAttempt

@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'package', 'job_role', 'expected_interview_date', 'technical_round_format', 'hr_interview_required')
    list_filter = ('technical_round_format', 'hr_interview_required')
    search_fields = ('name', 'job_role')

@admin.register(CompanyAptitudeQuestion)
class CompanyAptitudeQuestionAdmin(admin.ModelAdmin):
    list_display = ('topic', 'difficulty', 'company', 'question_text')
    list_filter = ('topic', 'difficulty', 'company')
    search_fields = ('question_text',)

@admin.register(CompanyTechnicalQuestion)
class CompanyTechnicalQuestionAdmin(admin.ModelAdmin):
    list_display = ('branch', 'topic', 'company', 'question_text')
    list_filter = ('branch', 'topic', 'company')
    search_fields = ('question_text',)

@admin.register(StudentCompanyProgress)
class StudentCompanyProgressAdmin(admin.ModelAdmin):
    list_display = ('student', 'company', 'overall_progress', 'placement_readiness')
    list_filter = ('company',)
    search_fields = ('student__user__first_name', 'company__name')

@admin.register(StudentPrepAttempt)
class StudentPrepAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'company', 'round_type', 'score', 'created_at')
    list_filter = ('round_type', 'company')
    search_fields = ('student__user__first_name',)

@admin.register(AIInterviewAttempt)
class AIInterviewAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'company', 'overall_score', 'recommendation', 'created_at')
    list_filter = ('company', 'recommendation')
    search_fields = ('student__user__first_name',)
