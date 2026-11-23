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
    email_sent = models.BooleanField(default=False, help_text="True if verification email was sent successfully")
    email_sent_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when verification email was sent")
    password_set_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when password was set")

    #created_at = models.DateTimeField(auto_now_add=True) we are using date_joined

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name','role','mobile_number','gender']
    
    objects = CustomUserManager()

    @property
    def is_mail_sent(self):
        """Returns True if verification email has been sent or if user is already verified."""
        return bool(self.email_sent or self.is_verified)

    @property
    def is_password_set(self):
        """Returns True if user has set a usable password / verified their account."""
        return bool(self.password_set_at or (self.is_verified and self.has_usable_password()))

    def __str__(self):
        return f"{self.first_name} ({self.email})"
