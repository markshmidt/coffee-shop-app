from django.urls import path, include

from .views.api import summary, monthly_revenue_chart, daily_stats, monthly_stats, monthly_cumulative_chart, \
    monthly_top_customer, monthly_popular_items
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

]