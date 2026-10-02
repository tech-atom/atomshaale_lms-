from django.db import models
from college.models import College,Course,Section
import uuid
from django.core.exceptions import ValidationError

class Domain(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    domain_name = models.CharField(max_length=50, unique=True)

    def save(self, *args, **kwargs):
        self.domain_name = self.domain_name.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.domain_name

class SubDomain(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="subdomains")
    subdomain_name = models.CharField(max_length=100,unique=True)

    class Meta:
        unique_together = ('domain', 'subdomain_name')

    def save(self, *args, **kwargs):
        self.subdomain_name = self.subdomain_name.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.subdomain_name} ({self.domain.domain_name})"

class Module(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module_name = models.CharField(max_length=100)
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    subdomain=models.ForeignKey(SubDomain,on_delete=models.SET_NULL,null=True,blank=True)

    class Meta:
        unique_together = ('module_name', 'domain','subdomain')

    def save(self, *args, **kwargs):
        self.module_name = self.module_name.strip().title()
        super().save(*args, **kwargs)
    
    def clean(self):
        if self.domain.domain_name == "Technical Skills" and not self.subdomain:
            raise ValidationError("Subdomain is required for Technical Domain.")


    def __str__(self):
        return f"{self.module_name} ({self.domain.domain_name})"

# OK materials/models.py
class Material(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField()
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE)
    module = models.ForeignKey(Module, on_delete=models.CASCADE)
    subdomain=models.ForeignKey(SubDomain,on_delete=models.SET_NULL,null=True,blank=True)
    video_file = models.FileField(upload_to='materials/videos/', blank=True, null=True)
    video_url = models.URLField(blank=True, null=True) 
    material_pdf = models.FileField(upload_to='materials/docs/')
    document_file = models.FileField(upload_to='materials/docs/', blank=True, null=True)  # doc/docx/odt
    ppt_file = models.FileField(upload_to='materials/ppts/', blank=True, null=True)         # ppt, pptx
    excel_file = models.FileField(upload_to='materials/sheets/', blank=True, null=True)    # xls, xlsx, ods
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class ScheduledMaterial(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name="schedules")
    college = models.ForeignKey(College, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    section=models.ForeignKey(Section,on_delete=models.CASCADE)
    semester = models.IntegerField(choices=[(i, str(i)) for i in range(1, 13)], db_index=True)
    year = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], db_index=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('material', 'college', 'course', 'section','semester', 'year')
    
    def clean(self):
        if self.end_datetime <= self.start_datetime:
            raise ValidationError("End datetime must be after start datetime.")

    def __str__(self):
        return f"{self.material.title} | {self.college.name} | {self.course.name} | Sem {self.semester}, Year {self.year}"
    