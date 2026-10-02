from django.db import models
from users.models import User
from college.models import College

class TpoProfile(models.Model):
    user = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, limit_choices_to={'role': 'tpo'})
    college = models.ForeignKey(College, on_delete=models.CASCADE)

    def __str__(self):
        return self.user.full_name
