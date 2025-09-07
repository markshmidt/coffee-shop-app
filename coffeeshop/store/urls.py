from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("cart/add-line/", views.cart_add_line, name="api_add_line"),
    path("cart/clear/", views.cart_pay, name="api_pay"),
    path("cart/", views.cart_get, name="api_cart_add"),
    path("cart/update-line/", views.cart_update_line, name="api_update"),
path("cart/remove-line/", views.cart_remove_line, name="api_delete"),

]
