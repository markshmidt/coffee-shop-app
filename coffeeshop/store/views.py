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

from .models import Category, MenuItem, Variant, ModifierGroup, ModifierOption


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
    """
    Reads session["cart"]; if missing, creates a new one:
    :param session:
    :return: cart
    """
    cart = session.get("cart")
    if not cart:
        cart = {"lines": [], "subtotal_cents": 0}
        session["cart"] = cart
    return cart

def _save_cart(session, cart):
    """
    Recomputes subtotal_cents from the lines:
    :param session:
    :param cart:
    :return: null
    """
    cart["subtotal_cents"] = sum(l["qty"] * l["unit_total_cents"] for l in cart["lines"])
    session["cart"] = cart
    session.modified = True

def _fmt_cents(c):
    return f"${(Decimal(c) / Decimal(100)).quantize(Decimal('0.00'))}"

def _price_item_validate(item: MenuItem, variant_id, selections):
    """
    Returns (base_cents, options_cents, unit_total_cents, normalized_selections)
    or raises ValueError
    """
    # base price
    if variant_id:
        try:
            # We assert the variant belongs to the same item and is active
            variant = Variant.objects.get(id=variant_id, menu_item=item, active=True)
        except Variant.DoesNotExist:
            raise ValueError("Invalid size selection.")
        base_cents = variant.price_cents
        variant_name = variant.name
    else:
        # items without variants
        base_cents = item.price_cents
        variant_name = None

    # allowed groups for this item
    # dict of group_id → group object, based on “applies_to + per-category + per-item + untargeted” logic.
    groups_qs = item.applicable_modifier_groups()
    allowed_groups = {g.id: g for g in groups_qs}
    print(allowed_groups)


    # 3) validate selections and sum deltas
    options_cents = 0
    normalized = []

    for selection in selections or []:
        # check the group is in allowed_groups
        # fetch options that belong to that group
        try:
            gid = int(selection["group_id"])
            option_ids = [int(x) for x in selection.get("option_ids", [])]
            print(gid, option_ids)
        except Exception:
            raise ValueError("Bad modifiers payload.")

        group = allowed_groups.get(gid)
        if not group:
            raise ValueError("Invalid modifier group selected.")
        opts = list(ModifierOption.objects.filter(group=group, id__in=option_ids))
        if len(opts) != len(option_ids):
            raise ValueError("Invalid modifier option selected.")

        # enforce min/max
        count = len(option_ids)
        if count < group.min_select:
            raise ValueError(f"You must pick at least {group.min_select} option(s) for {group.name}.")
        if count > group.max_select:
            raise ValueError(f"You can pick at most {group.max_select} option(s) for {group.name}.")

        #normalized_selections as list of {group_id, option_ids} with integers
        options_cents += sum(o.price_cents for o in opts)
        normalized.append({"group_id": gid, "option_ids": option_ids})

    unit_total_cents = base_cents + options_cents
    return base_cents, options_cents, unit_total_cents, normalized, variant_name

# Cart data structure
# {
#   "lines": [
#     {
#       "id": "uuid-string",
#       "item_id": 12,
#       "item_name": "Latte",
#       "variant_id": 45,                     # or None
#       "variant_name": "12oz",               # or None
#       "qty": 1,
#       "unit_total_cents": 570,              # base + modifiers (for 1 unit)
#       "base_cents": 500,
#       "options_cents": 70,
#       "selections": [                       # normalized user choices
#         {"group_id": 3, "option_ids": [10]},            # Milk: Oat
#         {"group_id": 7, "option_ids": [25, 26, 27]},    # Syrups: Vanilla, Caramel, ...
#       ],
#       "summary": "Milk: Oat ; Syrups: Vanilla, Caramel"
#     },
#     ...
#   ],
#   "subtotal_cents": 1120 ($11.20)
# }


def cart_add_line(request):
    pass
def cart_pay(request):
    pass