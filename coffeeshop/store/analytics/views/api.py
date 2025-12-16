import io

from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count
from django.db.models.functions import Coalesce, TruncDate, TruncHour
from django.http import JsonResponse, FileResponse
from django.utils import timezone
from datetime import timedelta

from matplotlib import pyplot as plt
from store.models import Order
import pandas as pd

@login_required
def summary(request):
    minutes = int(request.GET.get("minutes", 60))

    all_orders = Order.objects.all()
    total_orders = all_orders.count()

    total_revenue = all_orders.aggregate(
        total=Sum("total_cents")
    )["total"] or 0

    refunded_orders = all_orders.filter(status="REFUNDED").count()

    refund_rate = (
        (refunded_orders / total_orders) * 100
        if total_orders > 0 else 0
    )

    payment_split = (
        all_orders
        .exclude(payment_method__isnull=True)
        .values("payment_method")
        .annotate(count=Count("id"))
    )

    since = timezone.now() - timedelta(minutes=minutes)

    daily_qs = (
        Order.objects
        .filter(created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day", "payment_method")
        .annotate(orders=Count("id"))
        .order_by("day")
    )

    return JsonResponse({
        "ok": True,
        "window_minutes": minutes,   # ✅ ADD THIS
        "server_time": timezone.now().strftime("%Y-%m-%d %H:%M:%S"),
        "all_time": {
            "orders": total_orders,
            "revenue_cents": total_revenue,
            "refunded_orders": refunded_orders,
            "refund_rate": round(refund_rate, 2),
        },
        "payment": list(payment_split),
        "data": list(daily_qs),
    })

@login_required
def monthly_revenue_chart(request):
    qs = Order.objects.values("created_at", "total_cents")

    df = pd.DataFrame(qs)
    if df.empty:
        return JsonResponse({"ok": False})

    df["created_at"] = pd.to_datetime(df["created_at"])
    df["month"] = df["created_at"].dt.to_period("M")

    monthly = df.groupby("month")["total_cents"].sum() / 100

    fig, ax = plt.subplots(figsize=(8, 4))
    monthly.plot(kind="bar", ax=ax, color="#8b5e3c")

    ax.set_title("Monthly Revenue")
    ax.set_ylabel("Revenue ($)")
    ax.set_xlabel("Month")

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png")
    plt.close(fig)

    buf.seek(0)
    return FileResponse(buf, content_type="image/png")
@login_required
def daily_stats(request):
    today = timezone.now().date()

    orders_today = Order.objects.filter(created_at__date=today)

    total_orders = orders_today.count()
    total_revenue = orders_today.aggregate(
        total=Sum("total_cents")
    )["total"] or 0

    refunded = orders_today.filter(status="REFUNDED").count()

    avg_order = (
        total_revenue / total_orders if total_orders else 0
    )

    # Orders per hour (revenue)
    hourly = (
        orders_today
        .annotate(hour=TruncHour("created_at"))
        .values("hour")
        .annotate(revenue=Sum("total_cents"))
        .order_by("hour")
    )

    # Payment split
    payment = (
        orders_today
        .values("payment_method")
        .annotate(count=Count("id"))
    )

    return JsonResponse({
        "orders": total_orders,
        "revenue_cents": total_revenue,
        "avg_order_cents": avg_order,
        "refunded": refunded,
        "hourly": list(hourly),
        "payment": list(payment),
    })