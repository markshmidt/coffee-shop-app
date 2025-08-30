from django.apps import AppConfig


class StoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'store'

# --- POS config (all non-secret; safe to commit) ---
POS_TAX_RATE_BPS = 1300                  # 13.00% in basis points
POS_POINTS_PER_DOLLAR = 1                # 1 point per whole $1
POS_REDEMPTION_POINTS = 80               # 80 pts = free drink
POS_LOYALTY_PRICE_CAP_CENTS = 600        # free drink up to $6.00
POS_NICKEL_ROUNDING = True               # cash payments: round to nearest $0.05
POS_LATE_ATTACH_MINUTES = 30             # allow attaching phone after pay
POS_DISCOUNT_CHOICES = (
    ("NONE", "None"),
    ("STUDENT_10", "Student -10%"),
    ("FRIENDS_FAMILY_20", "Friends/Family -20%"),
)
TIME_ZONE = "Toronto"