from django.urls import path, include

from .views.api import summary, monthly_revenue_chart, daily_stats, monthly_stats, monthly_cumulative_chart, \
    monthly_top_customer, monthly_popular_items, export_orders_csv, export_monthly_report, top_drinks_all_time, \
    bottom_drinks_all_time
from .views.dashboard import dashboard

urlpatterns = [
    # page
    path("", dashboard, name="analytics_dashboard"),

    # api
    path("api/summary/", summary, name="analytics-summary"),
    path("api/daily-stats/", daily_stats, name="analytics-daily"),
    path("api/monthly-revenue-chart/", monthly_revenue_chart, name="analytics-monthly-chart"),
    path("api/monthly-stats/", monthly_stats, name="analytics-monthly"),
    path("api/monthly-cumulative-chart/", monthly_cumulative_chart, name="monthly-cumulative-chart"),
path(
    "api/monthly-top-customers/",
    monthly_top_customer,
    name="monthly-top-customer"
),
path(
    "api/monthly-top-item/",
    monthly_popular_items,
    name="monthly-popular-items"
),
path("api/export/orders-csv/", export_orders_csv, name="export-orders-csv"),
path("api/export/monthly-report/", export_monthly_report, name="export-monthly-report"),
path(
    "api/top-drinks/",
    top_drinks_all_time,
    name="top-drinks-all-time"
),
path("api/bottom-drinks/", bottom_drinks_all_time),

]