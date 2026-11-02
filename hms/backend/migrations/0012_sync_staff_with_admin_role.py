from django.db import migrations
from django.db.models import Q


def sync_staff_flag(apps, schema_editor):
    User = apps.get_model('backend', 'User')
    admins = Q(is_superuser=True) | Q(role='admin')
    User.objects.filter(admins).update(is_staff=True)
    User.objects.exclude(admins).update(is_staff=False)


class Migration(migrations.Migration):

    dependencies = [
        ('backend', '0011_carecontact_medicationschedule_medicationdose'),
    ]

    operations = [
        migrations.RunPython(sync_staff_flag, migrations.RunPython.noop),
    ]
