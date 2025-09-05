from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("cart/add-line/", views.cart_add_line, name="api_add_line"),
    path("cart/pay/", views.cart_pay, name="api_pay"),
]
