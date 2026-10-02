from django.core.management.base import BaseCommand
from student.models import StudentProfile
from college.models import College, Course

class Command(BaseCommand):
    help = 'Show all student groups for exam scheduling'

    def handle(self, *args, **options):
        students = StudentProfile.objects.filter(is_current=True).select_related(
            'college', 'course', 'user'
        ).order_by('college', 'course', 'semester', 'year')
        
        self.stdout.write('=' * 100)
        self.stdout.write('STUDENT GROUPS - Schedule exams for each group')
        self.stdout.write('=' * 100)
        
        current_group = None
        group_students = []
        
        for s in students:
            group = (str(s.college.id), str(s.course.id), s.semester, s.year)
            
            if group != current_group:
                if current_group and group_students:
                    self.stdout.write(f"  Total students in this group: {len(group_students)}")
                    self.stdout.write('')
                
                current_group = group
                group_students = []
                
                self.stdout.write(f"\n📚 GROUP:")
                self.stdout.write(f"   College: {s.college.name}")
                self.stdout.write(f"   Course: {s.course.name}")
                self.stdout.write(f"   Semester: {s.semester}, Year: {s.year}")
                self.stdout.write(self.style.SUCCESS(f"   College ID: {s.college.id}"))
                self.stdout.write(self.style.SUCCESS(f"   Course ID: {s.course.id}"))
                self.stdout.write("   Students:")
            
            group_students.append(s)
            name = s.user.first_name or s.user.username or 'Unknown'
            self.stdout.write(f"     • {name} (USN: {s.usn})")
        
        if group_students:
            self.stdout.write(f"  Total students in this group: {len(group_students)}")
        
        self.stdout.write('\n' + '=' * 100)
        self.stdout.write(f'Total active students: {students.count()}')
        self.stdout.write('=' * 100)
