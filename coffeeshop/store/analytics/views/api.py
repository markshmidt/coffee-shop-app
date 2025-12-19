import io

from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, Q
from django.db.models.functions import Coalesce, TruncDate, TruncHour, TruncMonth
from django.http import JsonResponse, FileResponse
from django.utils import timezone
from datetime import timedelta
import matplotlib
from matplotlib import pyplot as plt
from store.models import Order, OrderItem
import pandas as pd


matplotlib.use("Agg")
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
    daily_kpis = (
        Order.objects
        .filter(created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            orders=Count("id"),
            revenue=Sum("total_cents"),
            refunds=Count("id", filter=Q(status="REFUNDED")),
            new_customers=Count("customer", distinct=True),
        )
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
    plt.xticks(rotation=0)

    ax.set_title("Monthly Revenue")
    ax.set_ylabel("Revenue ($)")
    ax.set_xlabel("Month")
    for container in ax.containers:
        labels = [
            f"{int(v)}" if v != 0 else ""
            for v in container.datavalues
        ]
        ax.bar_label(container, labels=labels, label_type="center")

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png")
    plt.close(fig)

    buf.seek(0)
    return FileResponse(buf, content_type="image/png")

@login_required
def daily_stats(request):
    today = timezone.localdate()

    orders_today = Order.objects.filter(created_at__date=today)

    total_orders = orders_today.count()
    total_revenue = orders_today.aggregate(
        total=Sum("total_cents")
    )["total"] or 0

    refunded = orders_today.filter(status="REFUNDED").count()

    avg_order = total_revenue / total_orders if total_orders else 0

    new_customers = (
        orders_today
        .exclude(customer__isnull=True)
        .values("customer")
        .distinct()
        .count()
    )
    payment = (
        orders_today
        .values("payment_method")
        .annotate(revenue=Sum("total_cents"))
    )

    payment_map = {
        p["payment_method"]: (p["revenue"] or 0) / 100
        for p in payment
    }

    # ---- RAW hourly data ----
    qs = (
        orders_today
        .annotate(hour=TruncHour("created_at"))
        .values("hour")
        .annotate(
            revenue=Sum("total_cents"),
            orders=Count("id"),
        )
    )

    raw = {
        h["hour"].hour: {
            "revenue": (h["revenue"] or 0) / 100,
            "orders": h["orders"]
        }
        for h in qs
    }

    # ---- FULL 24 HOURS ----
    hourly = []
    for h in range(24):
        hourly.append({
            "hour": f"{h:02d}:00",
            "revenue": raw.get(h, {}).get("revenue", 0),
            "orders": raw.get(h, {}).get("orders", 0),
        })

    return JsonResponse({
        "orders": total_orders,
        "revenue": total_revenue / 100,
        "avg_order": avg_order / 100,
        "refunds": refunded,
        "new_customers": new_customers,
        "hourly": hourly,
        "payment": payment_map
    })
@login_required
def monthly_stats(request):
    now = timezone.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    qs = Order.objects.filter(created_at__gte=start_of_month)

    total_orders = qs.count()

    total_revenue = qs.aggregate(
        total=Coalesce(Sum("total_cents"), 0)
    )["total"]

    refunded = qs.filter(status="REFUNDED").count()

    new_customers = (
        qs.exclude(customer__isnull=True)
          .values("customer")
          .distinct()
          .count()
    )

    days_passed = max((now.date() - start_of_month.date()).days + 1, 1)

    avg_order_value = (
        total_revenue / total_orders if total_orders else 0
    )

    revenue_per_day = total_revenue / days_passed

    refund_rate = (
        (refunded / total_orders) * 100 if total_orders else 0
    )

    return JsonResponse({
        "orders": total_orders,
        "revenue": total_revenue / 100,
        "avg_order": avg_order_value / 100,
        "refunds": refunded,
        "refund_rate": round(refund_rate, 2),
        "new_customers": new_customers,
        "avg_daily_revenue": revenue_per_day / 100,
    })
@login_required
def monthly_cumulative_chart(request):
    now = timezone.now()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    qs = (
        Order.objects
        .filter(created_at__gte=start)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(revenue=Sum("total_cents"))
        .order_by("day")
    )

    if not qs.exists():
        # return empty transparent image instead of JSON
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, "No data this month", ha="center", va="center")
        ax.axis("off")

        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        plt.close(fig)
        buf.seek(0)
        return FileResponse(buf, content_type="image/png")

    df = pd.DataFrame.from_records(qs)
    df["revenue"] = df["revenue"] / 100
    df["cumulative"] = df["revenue"].cumsum()

    fig, ax = plt.subplots(figsize=(8, 4))

    ax.plot(
        df["day"],
        df["cumulative"],
        color="#8b5e3c",
        linewidth=3,
        marker="o"
    )

    ax.set_title("Cumulative Revenue (Current Month)")
    ax.set_ylabel("Revenue ($)")
    ax.set_xlabel("Date")
    ax.grid(alpha=0.3)

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    plt.close(fig)
    buf.seek(0)

    return FileResponse(buf, content_type="image/png")
@login_required
def monthly_popular_items(request):
    now = timezone.now()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    qs = (
        OrderItem.objects
        .filter(order__created_at__gte=start)
        .values("name_snapshot")
        .annotate(qty=Sum("qty"))
        .order_by("-qty")
    )

    return JsonResponse({
        "most": qs.first(),
        "least": qs.last(),
    })

@login_required
def monthly_top_customer(request):
    now = timezone.now()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    qs = (
        Order.objects
        .filter(created_at__gte=start)
        .exclude(customer__isnull=True)
        .values("customer__id", "customer__fname",)
        .annotate(
            orders=Count("id"),
            revenue=Sum("total_cents")
        )
        .order_by("-orders")
    )

    top = qs.first()

    return JsonResponse({
        "customer": top["customer__fname"] if top else None,
        "orders": top["orders"] if top else 0,
        "revenue": (top["revenue"] or 0) / 100 if top else 0,
    })
