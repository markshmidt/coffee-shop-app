from django.urls import path, include

from .views.api import summary, monthly_revenue_chart
from .views.dashboard import dashboard

urlpatterns = [
    # page
    path("", dashboard, name="analytics_dashboard"),

    # api
    path("api/summary/", summary, name="analytics_summary"),
path("api/monthly-revenue-chart/", monthly_revenue_chart),
]