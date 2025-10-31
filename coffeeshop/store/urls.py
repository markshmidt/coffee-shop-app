from django.contrib.auth.views import LoginView, LogoutView
from django.urls import path
from .views import home as home_views
from .views import cart as cart_views
from .views import order as orders_views
from .views import customers as customers_views
from .views import views
from .views import debug

urlpatterns = [
    path("debug-cart/", debug.debug_cart, name="debug_cart"),
    # pos page and cart
    path("", home_views.home, name="home"),
    path("cart/add-line/", cart_views.cart_add_line, name="api_add_line"),
    path("cart/clear/", cart_views.cart_clear, name="api_clear"),
    path("cart/", cart_views.cart_get, name="api_cart_add"),
    path("cart/update-line/", cart_views.cart_update_line, name="api_update"),
    path("cart/discount/", cart_views.cart_discount, name="api_discount"),

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

    #customers
    path("customers/list/", views.customers_list, name="customers_list"),
    path("customers/add/", views.customer_add, name="customer_add"),
    path("customers/<int:pk>/", views.customer_detail, name="customer_detail"),
    path("customers/<int:pk>/orders/", views.customer_orders, name="customer_orders"),
# assign to an existing ORDER
    path("orders/<int:pk>/assign_customer/", views.order_assign_customer, name="order_assign_customer"),

    # assign to CART (session) before an order exists
    path("cart/assign_customer/", views.cart_assign_customer, name="cart_assign_customer"),

]
