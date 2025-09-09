from decimal import Decimal

from django.db.models import ExpressionWrapper, DecimalField, F, Value
from django.shortcuts import render
import json
import uuid
from decimal import Decimal
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.db.models import Sum, Q

from .models import Category, MenuItem, Variant, ModifierGroup, ModifierOption


# ----- POS home page -------
def home(request):

    price_expr = ExpressionWrapper(
        F("price_cents") * Value(Decimal("0.01")),
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

    variants = Variant.objects.filter(active=True).annotate(price=price_expr).values("id", "name", "price", "price_cents", "menu_item_id").order_by("price", "name" )

    modifier_groups = ModifierGroup.objects.all().order_by("name")
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

# ====== CART ====

# ---- helpers -----

def _get_cart(session):
    """
    Reads session["cart"]; if missing, creates a new one:
    :param session:
    :return: cart
    """
    cart = session.get("cart")
    if not cart:
        cart = {"lines": [], "subtotal_cents": 0, "tax_cents": 0}
        session["cart"] = cart
    return cart

def _save_cart(session, cart):
    """
    Recomputes subtotal_cents from the lines:
    :param session:
    :param cart:
    :return: null
    """
    subtotal_cents = sum(l["qty"] * l["unit_total_cents"] for l in cart["lines"])
    tax_cents = round(subtotal_cents * 13 / 100)

    cart["subtotal_cents"] = subtotal_cents
    cart["tax_cents"] = tax_cents
    session.modified = True
# ---- convenience function to return a uniform JSON cart snapshot
def _cart_snapshot(cart):
    """
    Snapshot returned to the client after any change.
    Keep fields stable so frontend render code is simple.
    """
    return {
        "lines": cart["lines"],
        "subtotal_cents": cart["subtotal_cents"],
        "tax_cents": cart["tax_cents"],
        "tax_label": _fmt_cents(cart["tax_cents"]),
        "subtotal_label": _fmt_cents(cart["subtotal_cents"]),
    }

def _fmt_cents(c):
    return f"${(Decimal(c) / Decimal(100)).quantize(Decimal('0.00'))}"

def _summarize_selections(selections):
    """
    selections is a list like:
      [{'group_id': 5, 'option_ids': [20, 21]}, {'group_id': 7, 'option_ids':[22]}]
    We resolve names & deltas to "Milk: Oat (+$1.00); Syrups: Caramel (+$0.50), Vanilla (+$0.50)".
    """
    if not selections:
        return ""

    parts = []
    for sel in selections:
        gid = sel.get("group_id")
        oids = sel.get("option_ids") or []
        if not gid or not oids:
            continue

        try:
            g = ModifierGroup.objects.only("name").get(id=gid)
        except ModifierGroup.DoesNotExist:
            continue

        opts = list(
            ModifierOption.objects.filter(id__in=oids)
            .values("name", "price_cents")
        )

        if not opts:
            continue

        labeled = []
        for o in opts:
            delta = o["price_cents"] or 0
            if delta:
                labeled.append(f"{o['name']} (+{_fmt_cents(delta)})")
            else:
                labeled.append(o["name"])
        parts.append(f"{g.name}: " + ", ".join(labeled))

    return " ; ".join(parts)


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
#   "subtotal_cents": 1120 ($11.20),
#   "tax_cents": 1120*0.13
# }


@require_POST
def cart_add_line(request):
    # 1) Parse JSON safely
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"ok": False, "error": "Bad JSON"}, status=400)

    # 2) Extract & validate fields types
    try:
        item_id = int(payload["item_id"])
        variant_id = payload.get("variant_id")
        if variant_id is not None:
            variant_id = int(variant_id)
        qty = int(payload.get("qty", 1))
        selections = payload.get("selections") or []
    except Exception:
        return JsonResponse({"ok": False, "error": "Bad payload"}, status=400)

    # 3) Fetch item
    from .models import MenuItem, Variant
    try:
        item = MenuItem.objects.get(id=item_id, active=True)
    except MenuItem.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Item not found"}, status=404)

    # 4) Price & validate
    try:
        # accept either 4-tuple or 5-tuple from the validator
        res = _price_item_validate(
            item=item,
            variant_id=variant_id,
            selections=selections,
        )
        base_cents, options_cents, unit_total_cents, normalized, *rest = res
    except ValueError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    except Exception:
        return JsonResponse({"ok": False, "error": "Server error"}, status=500)

    # 5) Resolve variant name (and ensure it belongs to this item)
    variant_name = None
    if variant_id is not None:
        try:
            v = Variant.objects.only("name").get(id=variant_id, menu_item=item, active=True)
            variant_name = v.name
        except Variant.DoesNotExist:
            # If your validator already enforced the relation this won't happen.
            return JsonResponse({"ok": False, "error": "Variant not found for this item"}, status=400)

    # (Optional) If the validator already returned a variant label as the 5th value,
    # prefer that label:
    if rest and rest[0]:
        variant_name = rest[0]

    # 6) Build a user-friendly summary string with option deltas + tax
    summary = _summarize_selections(normalized)  # function shown below
    tax_cents = unit_total_cents*0.13

    # 7) Save into the session cart
    from uuid import uuid4
    line_id = uuid4().hex[:16]

    cart = _get_cart(request.session)
    cart["lines"].append({
        "id": line_id,
        "item_id": item.id,
        "item_name": item.name,
        "variant_id": variant_id,
        "variant_name": variant_name,            # <— used by the frontend to show size
        "qty": qty,
        "base_cents": base_cents,
        "options_cents": options_cents,
        "unit_total_cents": unit_total_cents,
        "selections": normalized,
        "summary": summary,                      # <— “Milk: Oat (+$1.00) ; Syrups: …”
    })
    _save_cart(request.session, cart)

    return JsonResponse({"ok": True, "cart": _cart_snapshot(cart)})

# Retrieve full cart snapshot
@require_GET
def cart_get(request):
    cart = _get_cart(request.session)
    return JsonResponse({"ok": True, "cart": _cart_snapshot(cart)
    })

# Empty the cart
@require_POST
def cart_clear(request):
    request.session["cart"] = {"lines": [], "subtotal_cents": 0, "tax_cents": 0,}
    request.session.modified = True
    return JsonResponse({"ok": True, "cart": request.session["cart"]})

@require_POST
# Update quantity
def cart_update_line(request):
    """"
    Payload example:
      {"line_id": "f2d6-...", "qty": 3}

    Behavior:
      - if the line exists and qty > 0 -> set that qty
      - if the line exists and qty <= 0 -> remove the line
      - recompute subtotal and return a fresh snapshot
    """
    try:
        payload = json.loads(request.body.decode("utf-8"))
        #scan lines to find line_id
        line_id = payload["line_id"]
        qty = max(1, int(payload["qty"]))
    except Exception:
        return HttpResponseBadRequest("Bad payload")

    cart = _get_cart(request.session)
    for line in cart["lines"]:
        if line["id"] == line_id:
            #set new quantity
            if qty <= 0:
                # treat 0 or negative as "remove"
                cart["lines"].pop(line)
            else:
                line["qty"] = qty
            _save_cart(request.session, cart)
            return JsonResponse({"ok": True, "cart": _cart_snapshot(cart)})

    return HttpResponseBadRequest("Line not found")

@require_POST
def cart_remove_line(request):
    """
    Payload: {"line_id": "uuid"}
    """
    try:
        payload = json.loads(request.body.decode("utf-8"))
        line_id = payload["line_id"]
    except Exception:
        return HttpResponseBadRequest("Bad payload")

    cart = _get_cart(request.session)

    # Filter out that line
    before = len(cart["lines"])
    cart["lines"] = [l for l in cart["lines"] if l["id"] != line_id]
    if len(cart["lines"]) == before:
        return HttpResponseBadRequest("Line not found")

    _save_cart(request.session, cart)
    return JsonResponse({"ok": True, "cart": _cart_snapshot(cart)})

def cart_pay(request):
    pass