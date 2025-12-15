from django.urls import path

from .utils.decorators import manager_required
from .views import home as home_views
from .views import cart as cart_views
from .views import order as orders_views
from .views import customers as customers_views
from .views import auth
from .views import debug
from .views import management as management_views

urlpatterns = [
    path("debug-cart/", debug.debug_cart, name="debug_cart"),

    # POS page and cart
    path("", home_views.home, name="home"),
    path("cart/add-line/", cart_views.cart_add_line, name="api_add_line"),
    path("cart/clear/", cart_views.cart_clear, name="api_clear"),
    path("cart/", cart_views.cart_get, name="api_cart_add"),
    path("cart/update-line/", cart_views.cart_update_line, name="api_update"),
    path("cart/discount/", cart_views.cart_discount, name="api_discount"),

    # Login/logout
    path("login/", auth.login_user, name="login"),
    path("logout/", auth.logout_user, name="logout"),

    # Orders (UI + API)
    path("order/pay/", orders_views.order_payment, name="api_payment"),
    path("orders/list/", orders_views.orders_list, name="orders_list"),
    path("orders/", orders_views.orders_page, name="orders"),
    path("orders/<int:pk>/", orders_views.order_detail, name="order_detail"),
    path("orders/<int:pk>/note/", orders_views.order_note, name="order_note"),
    path("orders/<int:pk>/receipt/", orders_views.order_receipt, name="order_receipt"),

    # Customers (legacy/non-API endpoints still used in POS search etc.)
    path("customers/list/", customers_views.customers_list, name="customers_list"),
    path("customers/<int:pk>/", customers_views.customer_detail, name="customer_detail"),
    path("customers/<int:pk>/orders/", customers_views.customer_orders, name="customer_orders"),

    # Assign customer to an existing ORDER
    path(
        "orders/<int:pk>/assign_customer/",
        customers_views.order_assign_customer,
        name="order_assign_customer",
    ),

    # Assign customer to CART (session) before an order exists
    path(
        "cart/assign_customer/",
        customers_views.cart_assign_customer,
        name="cart_assign_customer",
    ),

    # Management dashboard pages
    path(
        "manage/",
        manager_required(management_views.management_dashboard),
        name="management_dashboard",
    ),

    path(
        "manage/staff/",
        manager_required(management_views.manage_staff),
        name="manage_staff",
    ),
    path(
        "manage/staff/new/",
        manager_required(management_views.add_staff),
        name="add_staff",
    ),
    path(
        "manage/staff/<int:user_id>/edit/",
        manager_required(management_views.edit_staff),
        name="edit_staff",
    ),

    path(
        "manage/customers/",
        manager_required(management_views.customers_manage),
        name="manage_customers",
    ),
    path(
        "manage/menu/",
        manager_required(management_views.manage_menu),
        name="manage_menu",
    ),
    path(
        "manage/modifiers/",
        manager_required(management_views.manage_modifiers),
        name="manage_modifiers",
    ),
    path(
        "manage/reports/",
        manager_required(management_views.sales_reports),
        name="sales_reports",
    ),

    # ============================
    #  CUSTOMER MANAGEMENT API
    #  (used by /manage/customers/ JS)
    # ============================
    path(
        "api/customers/",
        customers_views.customers_list,
        name="api_customers_list",
    ),
    path(
        "api/customers/add/",
        customers_views.customer_add,
        name="api_customer_add",
    ),
    path(
        "api/customers/<int:pk>/",
        customers_views.customer_detail,
        name="api_customer_detail",
    ),
    path(
        "api/customers/<int:pk>/orders/",
        customers_views.customer_orders,
        name="api_customer_orders",
    ),
    path(
        "api/customers/<int:pk>/update/",
        customers_views.customer_update,
        name="api_customer_update",
    ),
    path(
        "api/customers/<int:pk>/delete/",
        customers_views.customer_delete,
        name="api_customer_delete",
    ),
]
