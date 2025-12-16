from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta

from store.models import Order


@login_required
def summary(request):
    """
    Live overview numbers.
    Optional: ?minutes=60 for 'last X minutes' totals.
    """
    minutes = int(request.GET.get("minutes", 60))
    since = timezone.now() - timedelta(minutes=minutes)

    # TODO: adjust these filters to match your schema (paid only, non-void, etc.)
    base = Order.objects.all()

    last = base

    # totals (cents)
    last_total = last.aggregate(
        total=Coalesce(Sum("total_cents"), 0),
        count=Coalesce(Count("id"), 0),
    )

    # payment split (last X minutes)
    by_payment = (
        last.values("payment_method")
        .annotate(count=Count("id"), total_cents=Coalesce(Sum("total_cents"), 0))
        .order_by("payment_method")
    )

    return JsonResponse({
        "ok": True,
        "window_minutes": minutes,
        "last": {
            "orders": last_total["count"],
            "total_cents": last_total["total"],
        },
        "payment": list(by_payment),
        "server_time": timezone.localtime().strftime("%Y-%m-%d %H:%M:%S"),
    })
