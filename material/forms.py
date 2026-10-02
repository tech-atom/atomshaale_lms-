# materials/forms.py
from django import forms
from .models import Domain, SubDomain, Module, Material, ScheduledMaterial


# ---------------- DOMAIN, SUBDOMAIN, MODULE FORMS ----------------

class DomainForm(forms.ModelForm):
    class Meta:
        model = Domain
        fields = ['domain_name']
        widgets = {
            'domain_name': forms.TextInput(attrs={'placeholder': 'Domain Name'})
        }

    def clean_domain_name(self):
        name = self.cleaned_data.get('domain_name', '').strip().title()
        qs = Domain.objects.filter(domain_name=name)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("This domain already exists.")
        return name

class SubDomainForm(forms.ModelForm):
    class Meta:
        model = SubDomain
        fields = ['domain', 'subdomain_name']
        widgets = {
            'subdomain_name': forms.TextInput(attrs={'placeholder': 'Subdomain Name'})
        }

    def clean(self):
        cleaned_data = super().clean()
        domain = cleaned_data.get('domain')
        name = cleaned_data.get('subdomain_name', '').strip().title()
        if domain:
            qs = SubDomain.objects.filter(domain=domain, subdomain_name=name)
            if self.instance and self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise forms.ValidationError("This subdomain already exists for the selected domain.")
        cleaned_data['subdomain_name'] = name
        return cleaned_data

class ModuleForm(forms.ModelForm):
    class Meta:
        model = Module
        fields = ['module_name', 'domain', 'subdomain']
        widgets = {
            'module_name': forms.TextInput(attrs={'placeholder': 'Module Name'})
        }

    def clean(self):
        cleaned_data = super().clean()
        domain = cleaned_data.get('domain')
        subdomain = cleaned_data.get('subdomain')
        name = cleaned_data.get('module_name', '').strip().title()
        if domain:
            qs = Module.objects.filter(module_name=name, domain=domain, subdomain=subdomain)
            if self.instance and self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise forms.ValidationError("This module already exists for the selected domain and subdomain.")
        cleaned_data['module_name'] = name
        return cleaned_data

