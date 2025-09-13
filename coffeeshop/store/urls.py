from django.contrib.auth.views import LoginView, LogoutView
from django.urls import path
from . import views

urlpatterns = [
    # pos page and cart
    path("", views.home, name="home"),
    path("cart/add-line/", views.cart_add_line, name="api_add_line"),
    path("cart/clear/", views.cart_clear, name="api_clear"),
    path("cart/", views.cart_get, name="api_cart_add"),
    path("cart/update-line/", views.cart_update_line, name="api_update"),
path("cart/remove-line/", views.cart_remove_line, name="api_delete"),
    path("cart/discount/", views.cart_discount, name="api_discount"),

    # login/logout
    path("login/", LoginView.as_view(template_name="login.html"), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),



]
