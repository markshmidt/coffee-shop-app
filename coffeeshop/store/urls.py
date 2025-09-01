from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("api/add-line/", views.api_add_line, name="api_add_line"),
    path("api/pay/", views.api_pay, name="api_pay"),
]
