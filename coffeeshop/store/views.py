from decimal import Decimal

from django.db.models import ExpressionWrapper, DecimalField, F, Value
from django.shortcuts import render
import json
import uuid
from decimal import Decimal
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.db.models import Sum, Q

from .models import Category, MenuItem, Variant, ModifierGroup


# POS home page
def home(request):

    price_expr = ExpressionWrapper(
        F("price_cents") / Value(Decimal("100")),  # integer division by 100
        output_field=DecimalField(max_digits=8, decimal_places=2),
    )

    items = (
        MenuItem.objects
        .annotate(price=price_expr)
        .order_by("name")
        .select_related("category")
        .prefetch_related("direct_modifier_groups", "category__modifier_groups")
    )

    parents = Category.objects.filter(parent__isnull=True).order_by("position", "name")
    cats = Category.objects.values("id", "name", "parent_id").order_by("position", "name")

    variants = Variant.objects.filter(active=True).annotate(price=price_expr).values("id", "name", "price", "price_cents", "menu_item_id").order_by("price_cents", "name" )

    modifier_groups = ModifierGroup.objects.all()
    return render(
        request,
        "home.html",
        {
            "parents": parents,
            "items": items,
            "cats": list(cats),
            "variants": variants,
            "modifier_groups": modifier_groups,
        }
    )

# ----- CART -----

def _get_cart(session):
    cart = session.get("cart")
    if not cart:
        cart = {"lines": [], "subtotal_cents": 0}
        session["cart"] = cart
    return cart

def _save_cart(session, cart):
    cart["subtotal_cents"] = sum(l["qty"] * l["unit_total_cents"] for l in cart["lines"])
    session["cart"] = cart
    session.modified = True

def _fmt_cents(c):
    return f"${(Decimal(c) / Decimal(100)).quantize(Decimal('0.00'))}"


def cart_add_line(request):
    pass
def cart_pay(request):
    pass