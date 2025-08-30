from django.apps import AppConfig
from django.contrib.auth.models import Group
from django.db.models.signals import post_migrate
from django.dispatch import receiver


class StoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'store'

# Adding two groups: barista and manager
@receiver(post_migrate)
def ensure_groups(sender, **kwargs):
    for name in ("BARISTA", "MANAGER"):
        Group.objects.get_or_create(name=name)