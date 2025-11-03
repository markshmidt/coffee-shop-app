from django.apps import AppConfig
from django.db.models.signals import post_migrate


class StoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'store'

    def ready(self):
        post_migrate.connect(seed_roles, dispatch_uid="seed_roles_once")


# --- POS config (all non-secret; safe to commit) ---
POS_TAX_RATE_BPS = 1300                  # 13.00% in basis points
POS_POINTS_PER_DOLLAR = 1                # 1 point per whole $1
POS_REDEMPTION_POINTS = 80               # 80 pts = free drink
POS_LOYALTY_PRICE_CAP_CENTS = 800        # free drink up to $8.00
POS_NICKEL_ROUNDING = True               # cash payments: round to nearest $0.05
POS_LATE_ATTACH_MINUTES = 30             # allow attaching phone after pay
POS_DISCOUNT_CHOICES = {
    "NONE": 0,
    "STUDENT_10": 1000,
    "FRIENDS_FAMILY_20": 2000,
}


def seed_roles(sender, **kwargs):
    from django.contrib.auth.models import Group, Permission
    perms = Permission.objects
    barista, _ = Group.objects.get_or_create(name="Barista")
    manager, _ = Group.objects.get_or_create(name="Manager")

    barista_perms = [
        "add_order", "apply_given_discount", "view_order",

    ]
    manager_perms = barista_perms + [
        "apply_any_discount", "void_order", "refund_order", "view_sales_reports",
        "manage_menu_items",
        "manage_customers", "manage_categories", "manage_variants",
        "manage_modifiers_groups", "add_order", "change_order", "view_order",
    ]

    def grant(g, codes):
        g.permissions.set(perms.filter(codename__in=codes) | g.permissions.all())

    grant(barista, barista_perms)
    grant(manager, manager_perms)