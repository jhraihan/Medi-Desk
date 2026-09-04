from django.db import migrations


def set_missing_roles(apps, schema_editor):
    User = apps.get_model('backend', 'User')
    User.objects.filter(role='', is_superuser=True).update(role='admin')
    User.objects.filter(role='').update(role='patient')


class Migration(migrations.Migration):

    dependencies = [
        ('backend', '0002_alter_user_role'),
    ]

    operations = [
        migrations.RunPython(set_missing_roles, migrations.RunPython.noop),
    ]
