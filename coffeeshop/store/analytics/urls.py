from django.urls import path, include

from .views.api import summary
from .views.dashboard import dashboard

urlpatterns = [
    # page
    path("", dashboard, name="analytics_dashboard"),

    # api
    path("api/summary/", summary, name="analytics_summary"),
]