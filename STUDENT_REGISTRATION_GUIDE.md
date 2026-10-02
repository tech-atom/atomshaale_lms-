# Student Self-Registration System - Implementation Guide

## Overview
This document describes the complete student self-registration system for ATOMM LMS. The system allows new students to create accounts, provide academic information, and verify their email addresses.

---

## Features Implemented

### 1. **Student Registration Form** (`StudentRegistrationForm`)
**Location**: `users/forms.py`

#### Fields:
- **Email** (unique, required)
- **First Name** (required, min 2 characters)
- **Mobile Number** (format: +91XXXXXXXXXX)
- **Gender** (Male, Female, Prefer Not to Say)
- **Password** (min 8 characters, with confirmation)
- **USN/Roll Number** (converted to uppercase)
- **College** (dropdown, only active colleges)
- **Course** (dropdown)
- **Section** (dropdown)
- **Semester** (1-12)
- **Year** (1-5)

#### Validations:
- Email uniqueness check
- Password confirmation matching
- Minimum password length (8 characters)
- First name minimum length (2 characters)
- Email format validation
- Phone number format validation
- USN sanitization (uppercase)

---

### 2. **Registration Views**
**Location**: `users/views.py`

#### `student_register_view(request)`
- Handles student registration form submission
- Creates both User and StudentProfile records atomically
- Sends verification email
- Redirects to registration pending page on success
- Prevents authenticated users from accessing registration

#### `send_student_verification_email(request, user)`
- Generates secure token for email verification
- Creates verification URL
- Sends HTML and plain text emails
- Includes 24-hour expiration notice

#### `registration_pending_view(request)`
- Shows confirmation message to users after registration
- Displays instructions for email verification

#### `email_verify(request, uidb64, token)` (existing)
- Verifies email tokens
- Sets user password
- Activates user account
- Marks user as verified

---

### 3. **URL Routes**
**Location**: `users/urls.py`

```
/users/register/              → Student registration form
/users/registration-pending/  → Registration confirmation page
/users/verify/<uidb64>/<token>/ → Email verification (existing)
/users/login/                 → Login page
```

---

### 4. **HTML Templates**

#### A. `student_register.html`
**Location**: `users/templates/student_register.html`

Features:
- Responsive design (mobile-friendly)
- Organized form sections:
  - Personal Information
  - Academic Information
  - Security Information
- Real-time password confirmation validation
- Password requirements display
- Help text and error messages
- Mobile number format guidance
- Form section titles with icons

#### B. `registration_pending.html`
**Location**: `users/templates/registration_pending.html`

Features:
- Success confirmation message
- Step-by-step instructions (4 steps)
- 24-hour verification warning
- Support contact information
- Buttons to login or go home
- Responsive design with animations

---

## User Registration Flow

```
1. User visits /users/register/
   ↓
2. User fills registration form with:
   - Personal info (name, email, mobile, gender)
   - Academic info (USN, college, course, section, semester, year)
   - Security (password, password confirmation)
   ↓
3. Form validation:
   - Email uniqueness check
   - Password match check
   - Field length/format validation
   ↓
4. If valid:
   - Create User account (role='student', is_active=False)
   - Create StudentProfile with academic info
   - Generate verification token
   ↓
5. Send verification email with:
   - HTML and plain text content
   - Verification link
   - 24-hour expiration warning
   ↓
6. Display registration pending page
   ↓
7. User clicks verification link in email
   ↓
8. System verifies token and shows password reset form
   ↓
9. User sets new password
   ↓
10. Account activated (is_active=True, is_verified=True)
    ↓
11. Redirect to login page
    ↓
12. User logs in with email and password
```

---

## Key Technical Details

### Database Models Used
1. **User Model** (`users.models.User`)
   - Abstract user with email as login field
   - Custom manager (CustomUserManager)
   - UUID primary key
   - Role-based access

2. **StudentProfile Model** (`student.models.StudentProfile`)
   - Links to User via ForeignKey
   - Contains academic information
   - Unique constraint on (USN, College, Course, Year, Semester)

3. **College Model** (`college.models.College`)
   - Available colleges for student selection
   - has `is_active` flag

4. **Course Model** (`college.models.Course`)
   - Courses available to students

5. **Section Model** (`college.models.Section`)
   - Sections/groups within courses

### Email Configuration
The system uses Django's email backend. Ensure your `settings.py` has:

```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'your-email-host'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your-email@example.com'
EMAIL_HOST_PASSWORD = 'your-password'
DEFAULT_FROM_EMAIL = 'noreply@atommlms.com'
```

### Security Features
- Password hashing using Django's default hasher (PBKDF2)
- CSRF protection on forms
- Email verification requirement
- Token-based verification (expires in 24 hours)
- Atomic database transactions
- Unique email constraint
- Password confirmation validation
- SQL injection protection via ORM

---

## Form Styling

The templates use:
- **Colors**: Purple gradient (#667eea to #764ba2)
- **CSS**: Custom CSS with responsive grid layout
- **Icons**: Font Awesome 6.4.0
- **Fonts**: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif
- **Animations**: Scale-in effect on success icon

---

## Testing Checklist

- [ ] User can access registration form
- [ ] Form validates all required fields
- [ ] Password confirmation validation works
- [ ] Email uniqueness is enforced
- [ ] StudentProfile is created with User
- [ ] Verification email is sent
- [ ] Email verification link works
- [ ] User can set password after verification
- [ ] Account becomes active after verification
- [ ] User can log in with verified email
- [ ] Form displays proper error messages
- [ ] Mobile number format is validated
- [ ] USN is converted to uppercase
- [ ] Authenticated users cannot access registration

---

## Error Handling

The form handles:
1. **Email Already Registered**: "This email is already registered."
2. **Password Mismatch**: "Passwords do not match."
3. **Invalid Email Format**: Django's built-in email validation
4. **Short Password**: "Password must be at least 8 characters long."
5. **Short First Name**: "First name must be at least 2 characters long."
6. **Invalid Mobile Number**: PhoneNumberField validation
7. **Missing Required Fields**: Individual field error messages

---

## Admin Panel Access

Django admin users can manage:
- User accounts (created via registration)
- StudentProfile records
- College, Course, and Section data

Navigate to `/admin/` after creating a superuser:
```bash
python manage.py createsuperuser
```

---

## Future Enhancements

1. **Email Verification Resend**: Allow users to request a new verification email
2. **OTP Verification**: Add SMS-based OTP for phone verification
3. **Document Upload**: Resume/profile picture during registration
4. **Terms & Conditions**: Accept T&C during registration
5. **Domain-based Auto-approval**: Auto-approve .edu emails
6. **Social Login**: Google/GitHub authentication
7. **Batch Registration**: CSV upload for bulk student creation
8. **Email Templates**: Database-driven customizable email templates

---

## Troubleshooting

### Emails Not Sending
- Check `EMAIL_*` settings in `settings.py`
- Verify SMTP credentials
- Check Django logs for send errors
- Test with: `python manage.py shell` → `from django.core.mail import send_mail; send_mail(...)`

### Form Not Validating
- Check Django version compatibility
- Verify all model imports in forms.py
- Clear browser cache and cookies
- Check browser console for JavaScript errors

### StudentProfile Not Created
- Ensure User and StudentProfile creation is atomic
- Check that all required fields are provided
- Verify foreign key relationships are valid
- Check for unique_together constraint violations

---

## Files Modified/Created

### New Files:
- `users/templates/student_register.html`
- `users/templates/registration_pending.html`

### Modified Files:
- `users/forms.py` - Added StudentRegistrationForm
- `users/views.py` - Added registration views and email sending
- `users/urls.py` - Added registration routes

---

## Dependencies

Ensure these are installed in requirements.txt:
- `django>=3.2`
- `django-phonenumber-field`
- `phonenumbers`
- `django-ratelimit` (for login rate limiting)

---

## Support & Maintenance

For issues or improvements:
1. Check the troubleshooting section above
2. Review Django documentation for email configuration
3. Check form validation in the browser console
4. Review Django logs for backend errors

---

Generated: March 27, 2026
