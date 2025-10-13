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
    path(
        "logout/",
        LogoutView.as_view(next_page="login"),  # always redirect here after logout
        name="logout",
    ),

    # orders
    path("order/pay/", views.order_payment, name="api_payment"),
    path("orders/list/", views.orders_list, name="orders_list"),
    path("orders/", views.orders_page, name="orders"),
    path("orders/<int:pk>/", views.order_detail, name="order_detail"),
    path("orders/<int:id>/note/", views.order_note, name="order_note"),
    path("orders/<int:pk>/receipt/", views.order_receipt, name="order_receipt"),
    path("orders/<int:id>/assign_customer/", views.assign_customer, name="assign_customer"),

    #customers
    path("customers/list/", views.customers_list, name="customers_list"),
    path("customers/add/", views.customer_add, name="customer_add"),
    path("customers/<int:pk>/", views.customer_detail, name="customer_detail"),

]
