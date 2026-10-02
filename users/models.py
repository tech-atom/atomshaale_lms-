import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from phonenumber_field.modelfields import PhoneNumberField
from .managers import CustomUserManager


class User(AbstractUser):
    username = None  # disable default username
    ROLE_CHOICES = [('admin', 'Admin'), ('student', 'Student'), ('trainer', 'Trainer'), ('tpo', 'TPO')]
    GENDER_CHOICES=[('Male','Male'),('Female','Female'),('NA','Perfer Not to Say')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    #full_name = models.CharField(max_length=100)    we are using first_name
    email = models.EmailField(unique=True)
    mobile_number = PhoneNumberField(region='IN')
    gender=models.CharField(max_length=10,choices=GENDER_CHOICES)
    updated_at = models.DateTimeField(auto_now=True)
    is_verified = models.BooleanField(default=False)

    #created_at = models.DateTimeField(auto_now_add=True) we are using date_joined

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name','role','mobile_number','gender']
    
    objects = CustomUserManager()

    def __str__(self):
        return f"{self.first_name} ({self.email})"
