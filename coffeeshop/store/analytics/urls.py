from django.urls import path, include

from .views.api import summary, monthly_revenue_chart, daily_stats, monthly_stats
from .views.dashboard import dashboard

urlpatterns = [
    # page
    path("", dashboard, name="analytics_dashboard"),

    # api
    path("api/summary/", summary, name="analytics-summary"),
    path("api/daily-stats/", daily_stats, name="analytics-daily"),
    path("api/monthly-revenue-chart/", monthly_revenue_chart, name="analytics-monthly-chart"),
    path("api/monthly-stats/", monthly_stats, name="analytics-monthly"),
]