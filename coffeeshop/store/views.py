from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import ExpressionWrapper, DecimalField, F, Value, Max, Prefetch
from django.shortcuts import render, get_object_or_404, redirect
import json
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from decimal import Decimal
from django.http import JsonResponse, HttpResponseBadRequest
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET
# store/views.py
from django.shortcuts import render

from .models import Category, MenuItem, Variant, ModifierGroup, ModifierOption, Order, OrderItem, OrderItemModifier
from .apps import (
    POS_TAX_RATE_BPS,         # 1300 (13%)
    POS_DISCOUNT_CHOICES,     # ("NONE", ...), ("STUDENT_10", ...), ...
    POS_NICKEL_ROUNDING,      # True/False
)
from .permissions import compute_order_permissions


# ----- POS home page -------

@login_required
def home(request):

    price_expr = ExpressionWrapper(
        F("price_cents") * Value(Decimal("0.01")),
        output_field=DecimalField(max_digits=8, decimal_places=2),
    )

    items = (
        MenuItem.objects
        .annotate(price=price_expr)
        .order_by("price")
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

# 13% -> 1300 basis points; return integer cents
def _bp(amount_cents: int, bp: int) -> int:
    return round(amount_cents * bp / 10_000)

# round to nearest $0.05 for CASH only
def _nickel_round_cents(cents: int) -> int:
    return int(round(cents / 5.0) * 5)

# Map codes to bp
DISCOUNT_BP = {
    "NONE": 0,
    "STUDENT_10": 1000,
    "FRIENDS_FAMILY_20": 2000,
}

def _get_cart(session):
    """
    Reads session["cart"]; if missing, creates a new one:
    :param session:
    :return: cart
    """
    cart = session.get("cart")
    if not cart:
        cart = _empty_cart()
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
    # discount (in basis points from your config)
    disc_bp = DISCOUNT_BP.get(cart.get("discount_code") or "NONE", 0)
    discount = _bp(subtotal_cents, disc_bp)

    taxable = max(0, subtotal_cents - discount)
    tax_cents = _bp(taxable, POS_TAX_RATE_BPS)

    pre_total = taxable + tax_cents
    total = pre_total
    rounding_delta = 0
    if cart.get("payment_method") == "CASH" and POS_NICKEL_ROUNDING:
        rounded = _nickel_round_cents(pre_total)
        rounding_delta = rounded - pre_total
        total = rounded

    cart["subtotal_cents"] = subtotal_cents
    cart["discount_cents"] = discount
    cart["tax_cents"] = tax_cents
    cart["total_cents"] = total
    cart["rounding_delta_cents"] = rounding_delta
    request_session = session
    request_session["cart"] = cart

    session.modified = True

def _empty_cart():
    return {
        "lines": [],
        "discount_code": "NONE",
        "payment_method": "CARD",
        "subtotal_cents": 0,
        "discount_cents": 0,
        "tax_cents": 0,
        "total_cents": 0,
        "rounding_delta_cents": 0,
    }

# ---- convenience function to return a uniform JSON cart snapshot
def _cart_snapshot(cart):
    """
    Snapshot returned to the client after any change.
    Keep fields stable so frontend render code is simple.
    """
    return {
        "lines": cart["lines"],
        "discount_code": cart.get("discount_code", "NONE"),
        "payment_method": cart.get("payment_method", "CARD"),

        # raw cents
        "subtotal_cents": cart.get("subtotal_cents", 0),
        "discount_cents": cart.get("discount_cents", 0),
        "tax_cents": cart.get("tax_cents", 0),
        "total_cents": cart.get("total_cents", 0),
        "rounding_delta_cents": cart.get("rounding_delta_cents", 0),

        # preformatted labels
        "subtotal_label": _fmt_cents(cart.get("subtotal_cents", 0)),
        "discount_label": "-" + _fmt_cents(cart.get("discount_cents", 0)) if cart.get("discount_cents") else _fmt_cents(0),
        "tax_label": _fmt_cents(cart.get("tax_cents", 0)),
        "total_label": _fmt_cents(cart.get("total_cents", 0)),
        "rounding_delta_label": _fmt_cents(cart.get("rounding_delta_cents", 0)),
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
        print("[PAY] checking Variant(id=%s) for item %s" % (variant_id, item.id))
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

@login_required
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
@login_required
@require_GET
def cart_get(request):
    cart = _get_cart(request.session)
    return JsonResponse({"ok": True, "cart": _cart_snapshot(cart)
    })

# Empty the cart
@login_required
@require_POST
def cart_clear(request):
    request.session["cart"] = {
        "lines": [],
        "discount_code": "NONE",
        "payment_method": "CARD",
        "subtotal_cents": 0,
        "discount_cents": 0,
        "tax_cents": 0,
        "total_cents": 0,
        "rounding_delta_cents": 0,
    }
    # Recompute and persist (keeps pipeline consistent)
    _save_cart(request.session, request.session["cart"])
    return JsonResponse({"ok": True, "cart": _cart_snapshot(request.session["cart"])})

@login_required
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

@login_required
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

@require_POST
def cart_discount(request):
    data = json.loads(request.body.decode("utf-8"))
    cart = _get_cart(request.session)

    if "discount_code" in data:
        code = data["discount_code"]
        if code not in DISCOUNT_BP:
            return HttpResponseBadRequest("Unknown discount code")
        cart["discount_code"] = code

    if "payment_method" in data:
        method = (data["payment_method"] or "").upper()
        if method not in ("CARD", "CASH"):
            return HttpResponseBadRequest("Bad payment method")
        cart["payment_method"] = method

    _save_cart(request.session, cart)
    return JsonResponse({"ok": True, "cart": _cart_snapshot(cart)})


def cart_pay(request):
    pass


# ==== LOGIN VIEWS =====

def login_user(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, "You are now logged in.")
            return redirect("/")
        else:
            messages.error(request, "Invalid username or password. Try again")
    return render(request, "login.html")


def logout_user(request):
    logout(request)
    messages.success(request, "You have been logged out.")
    return redirect('login')

# ====== ORDER VIEWS =====
@csrf_exempt
@login_required
@require_POST
def order_payment(request):
    """
    Finalize an order using the client's cart payload, but:
      - Recompute line prices from DB
      - Compute tax via basis points and apply nickel rounding for CASH.
      - Persist Order and OrderItems.
      - Clear session cart.
      - Return JSON with order id

    EXPECTED JSON BODY:
    {
      {
      "payment_method": "CARD",
      "discount_cents": 0,
      "lines": [
        {
          "item_id": 3,
          "variant_id": 4,
          "qty": 1,
          "selections": []
        }
      ]
    }
    RETURN JSON BODY:
    {
        "ok": true,
        "created_by": user id,
        "order_id": 2,
        "subtotal_cents": 500,
        "discount_cents": 0,
        "tax_cents": 65,
        "total_cents": 565,
        "rounding_delta_cents": 0,
        "subtotal_label": "$5.00",
        "discount_label": "$0.00",
        "tax_label": "$0.65",
        "total_label": "$5.65",
        "chip_label": "5.65 Card"
    }

    """
    # ---- parse and validate json ----
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"ok": False, "error": "Invalid JSON."}, status=400)

    # validate payment method
    method_raw = (payload.get("payment_method") or "").upper().strip()
    if method_raw not in ("CARD", "CASH"):
        return JsonResponse({"ok": False, "error": "payment_method must be 'CARD' or 'CASH'."}, status=400)
    payment_method = method_raw

    #  discount in cents negative -> 0
    try:
        requested_discount_cents = int(payload.get("discount_cents") or 0)
    except Exception:
        requested_discount_cents = 0
    if requested_discount_cents < 0:
        requested_discount_cents = 0

    # validate lines structure
    lines = payload.get("lines")
    if not isinstance(lines, list) or not lines:
        return JsonResponse({"ok": False, "error": "Cart is empty or malformed."}, status=400)

    # ---- Recompute from DB ----
    # Using _price_item_validate to ensure variants belong to items and selections belong to allowed groups
    recomputed_subtotal_cents = 0
    staged_items = []

    for idx, line in enumerate(lines, start=1):
        try:
            item_id = int(line["item_id"])
            variant_id = line.get("variant_id")
            if variant_id is not None:
                variant_id = int(variant_id)
            qty = int(line.get("qty", 1))
            selections = line.get("selections") or []
        except Exception:
            return JsonResponse({"ok": False, "error": f"Line {idx}: bad payload."}, status=400)

        if qty < 1:
            return JsonResponse({"ok": False, "error": f"Line {idx}: qty must be >= 1."}, status=400)

        try:
            item = MenuItem.objects.get(id=item_id, active=True)
        except MenuItem.DoesNotExist:
            return JsonResponse({"ok": False, "error": f"Line {idx}: item not found."}, status=404)

        #validate unit price
        try:
            print(f"[PAY] item_id={item_id} variant_id={variant_id} qty={qty}")
            print("[PAY] allowed groups:", list(item.applicable_modifier_groups().values_list("id", flat=True)))

            base_cents, options_cents, unit_total_cents, normalized, _variant_name = _price_item_validate(
                item=item,
                variant_id=variant_id,
                selections=selections,
            )
        except ValueError as e:
            return JsonResponse({"ok": False, "error": f"Line {idx}: {str(e)}"}, status=400)
        except Exception:
            return JsonResponse({"ok": False, "error": f"Line {idx}: server error."}, status=500)

        line_subtotal_cents = unit_total_cents * qty
        recomputed_subtotal_cents += line_subtotal_cents

        # Resolve Variant (nullable for items without variants)
        variant_obj = None
        if variant_id is not None:
            try:
                variant_obj = Variant.objects.only("id").get(id=variant_id, menu_item=item, active=True)
            except Variant.DoesNotExist:
                return JsonResponse({"ok": False, "error": f"Line {idx}: variant not found for this item."}, status=400)
        variant_name = _variant_name or ""
        staged_items.append({
            "item": item,
            "variant": variant_obj,
            "quantity": qty,
            "options_cents": options_cents,          # per-unit modifiers delta (optional, for reporting)
            "base_cents": base_cents,
            "unit_cents": unit_total_cents,
            "line_subtotal_cents": line_subtotal_cents,
            "variant_name": variant_name,  # string label like "Americano 12oz" or ""
            "normalized": normalized,
        })

    # ----- Discount, Tax,rounding -----
    # apply discount in cents;
    discount_cents = min(requested_discount_cents, recomputed_subtotal_cents)

    taxable_cents = max(0, recomputed_subtotal_cents - discount_cents) #avoid negative
    tax_cents = _bp(taxable_cents, POS_TAX_RATE_BPS)

    pre_total_cents = taxable_cents + tax_cents
    total_cents = pre_total_cents
    rounding_delta_cents = 0
    if payment_method == "CASH" and POS_NICKEL_ROUNDING:
        rounded = _nickel_round_cents(pre_total_cents)
        rounding_delta_cents = rounded - pre_total_cents
        total_cents = rounded


    # ----Order & Items -------
    # generate a new receipt number
    next_receipt = (Order.objects.aggregate(m=Max("receipt_number"))["m"] or 0) + 1
    order = Order.objects.create(
        created_by=request.user,
        payment_method=payment_method,  # 'CARD' | 'CASH'
        subtotal_cents=recomputed_subtotal_cents,
        tax_cents=tax_cents,
        total_cents=total_cents,
        discount_cents=discount_cents,
        rounding_delta_cents=rounding_delta_cents,
        paid_at=timezone.now(),
        receipt_number=next_receipt,
    )

    items_to_create = [
        OrderItem(
            order=order,
            menu_item=si["item"],
            name_snapshot=si["item"].name,
            variant_name_snapshot=si["variant_name"],  # no extra DB hit
            base_unit_price_cents=si["base_cents"],
            unit_price_cents=si["unit_cents"],
            qty=si["quantity"],
        )
        for si in staged_items
    ]
    created_items = OrderItem.objects.bulk_create(items_to_create)
    #lookups for groups/modifiers options
    group_ids, option_ids = set(), set()
    for si in staged_items:
        for sel in si["normalized"]:
            group_ids.add(sel["group_id"])
            option_ids.update(sel["option_ids"])

    groups = {g.id: g.name for g in ModifierGroup.objects.filter(id__in=group_ids).only("id", "name")}
    options = {o.id: (o.name, o.price_cents) for o in
               ModifierOption.objects.filter(id__in=option_ids).only("id", "name", "price_cents")}

    mods_to_create = []
    for oi, si in zip(created_items, staged_items):
        for sel in si["normalized"]:
            gname = groups.get(sel["group_id"], "")
            for oid in sel["option_ids"]:
                oname, delta = options.get(oid, ("", 0))
                mods_to_create.append(OrderItemModifier(
                    order_item=oi,
                    group_name_snapshot=gname,  # e.g. "Syrups"
                    option_name_snapshot=oname,  # e.g. "Caramel"
                    price_delta_cents_snapshot=delta,  # per-unit delta
                ))
    print("[PAY] will create modifier snapshots:", len(mods_to_create))
    if mods_to_create:
        print("[PAY] saved modifier snapshots in DB:",
        OrderItemModifier.objects.bulk_create(mods_to_create))
    # ----- clear session cart -----
    request.session["cart"] = _empty_cart()
    _save_cart(request.session, request.session["cart"])  # keep pipeline consistent

    # --- response payload ---
    chip_method = "Cash" if payment_method == "CASH" else "Card"
    resp = {
        "ok": True,
        "created_by": (request.user.get_full_name() or request.user.get_username()),
        "order_id": order.id,
        "subtotal_cents": recomputed_subtotal_cents,
        "discount_cents": discount_cents,
        "tax_cents": tax_cents,
        "total_cents": total_cents,
        "rounding_delta_cents": rounding_delta_cents,
        "subtotal_label": _fmt_cents(recomputed_subtotal_cents),
        "discount_label": "-" + _fmt_cents(discount_cents) if discount_cents else _fmt_cents(0),
        "tax_label": _fmt_cents(tax_cents),
        "total_label": _fmt_cents(total_cents),
        "chip_label": f"{_fmt_cents(total_cents)[1:]} {chip_method}",  # e.g., "6.22 Card"
    }

    return JsonResponse(resp, status=201)

@csrf_exempt
@login_required
@require_GET
def orders_list(request):
    """
    Return the most recent orders, newest first.
    """
    try:
        limit = max(1, min(50, int(request.GET.get("limit", 20))))
    except Exception:
        limit = 1

    cursor = request.GET.get("cursor")
    qs = (
        Order.objects
        .select_related("created_by")
        .prefetch_related(
            Prefetch(
                "items",
                queryset=OrderItem.objects.only(
                    "order_id",
                    "name_snapshot",
                    "variant_name_snapshot",
                    "qty",
                    "unit_price_cents",
                ),
            )
        )
        .order_by("-id")
    )
    if cursor:
        try:
            qs = qs.filter(id__lt=int(cursor))
        except Exception:
            pass

    out = []
    for o in qs[:limit]:
        when_dt = o.paid_at or o.created_at
        when_dt = timezone.localtime(when_dt)  # show local time
        when_label = when_dt.strftime("%Y-%m-%d %H:%M")

        out.append({
            "id": o.id,
            "status": o.status,
            "when_iso": when_dt.isoformat(),
            "when_label": when_label,
            "payment_method": o.payment_method,  # 'CARD' | 'CASH'
            "total_cents": o.total_cents,
            "total_label": _fmt_cents(o.total_cents),
            "created_by": o.created_by.get_username(),
            "items": [
                {
                    "label": f"{it.name_snapshot}{(' ' + it.variant_name_snapshot) if it.variant_name_snapshot else ''}",
                    "qty": it.qty,
                    "unit_cents": it.unit_price_cents,
                    "unit_label": _fmt_cents(it.unit_price_cents),
                    "line_cents": it.unit_price_cents * it.qty,
                    "line_label": _fmt_cents(it.unit_price_cents * it.qty),
                }
                for it in o.items.all()
            ],
        })

    next_cursor = out[-1]["id"] if len(out) == limit else None
    return JsonResponse({"ok": True, "orders": out, "next_cursor": next_cursor})

def serialize_order_for_modal(order):
    """
    Return a dict with everything the modal needs.
    """

    when_dt = timezone.localtime(order.paid_at or order.created_at)

    # ---- Items with variants + modifiers ----
    items_out = []
    for it in order.items.all():
        # if related name differs, fall back safely
        try:
            mods_qs = it.modifiers.all()
        except Exception:
            try:
                mods_qs = it.orderitemmodifier_set.all()
            except Exception:
                mods_qs = []

        modifiers_out = []
        for m in mods_qs:
            gname = getattr(m, "group_name_snapshot", "")
            oname = getattr(m, "option_name_snapshot", "")
            delta = getattr(m, "price_delta_cents_snapshot", 0) or 0
            modifiers_out.append({
                "group": gname,
                "choice": oname,
                "price_cents": delta,
                "price_label": _fmt_cents(delta),
            })

        unit = it.unit_price_cents
        qty  = it.qty
        line = unit * qty

        items_out.append({
            "line_id": it.id,
            "name": it.name_snapshot,
            "variant": it.variant_name_snapshot or "",
            "qty": qty,
            "unit_cents": unit,
            "unit_label": _fmt_cents(unit),
            "line_cents": line,
            "line_label": _fmt_cents(line),
            "modifiers": modifiers_out,
            "note": getattr(it, "note", ""),
        })

    # ---- Totals (prefer stored fields; compute as fallback) ----
    subtotal_cents = getattr(order, "subtotal_cents", None)
    if subtotal_cents is None:
        subtotal_cents = sum(i["line_cents"] for i in items_out)

    discount_cents = getattr(order, "discount_cents", 0) or 0
    tax_cents      = getattr(order, "tax_cents", 0) or 0
    rounding_cents = getattr(order, "rounding_delta_cents", 0) or 0
    grand_cents    = getattr(order, "total_cents", subtotal_cents - discount_cents + tax_cents + rounding_cents)

    totals = {
        "subtotal_cents": subtotal_cents, "subtotal_label": _fmt_cents(subtotal_cents),
        "discount_cents": discount_cents, "discount_label": _fmt_cents(discount_cents),
        "tax_cents":      tax_cents,      "tax_label":      _fmt_cents(tax_cents),
        "rounding_cents": rounding_cents, "rounding_label": _fmt_cents(rounding_cents),
        "grand_total_cents": grand_cents, "grand_total_label": _fmt_cents(grand_cents),
    }

    # ---- Payments----
    payments_out = []
    if hasattr(order, "payments"):
        for p in order.payments.all():
            amt = getattr(p, "amount_cents", 0) or 0
            payments_out.append({
                "id": p.id,
                "method": (getattr(p, "method", getattr(p, "type", "")) or "").upper(),
                "amount_cents": amt,
                "amount_label": _fmt_cents(amt),
                "ref": getattr(p, "reference", ""),
                "at": timezone.localtime(getattr(p, "created_at", order.created_at)).isoformat(),
            })

    # ---- Customer (for future) ----
    customer = None
    if getattr(order, "customer_id", None):
        c = order.customer
        customer = {
            "id": c.id,
            "name": getattr(c, "name", ""),
            "phone": getattr(c, "phone", ""),
            "email": getattr(c, "email", ""),
        }

    return {
        "id": order.id,
        "number": getattr(order, "receipt_number", order.id),
        "status": order.status,
        "payment_method": (getattr(order, "payment_method", "") or "").upper(),  # CARD/CASH
        "created_by": order.created_by.get_username(),
        "when_iso": when_dt.isoformat(),
        "when_label": when_dt.strftime("%Y-%m-%d %H:%M"),
        "items": items_out,
        "totals": totals,
        "payments": payments_out,
        "customer": customer,
        "notes": getattr(order, "internal_notes", ""),
    }
@csrf_exempt
@login_required
@require_GET
def order_detail(request, pk):
    """
    JSON payload for the modal.
    """
    #prefetch order items + their modifiers
    items_qs = OrderItem.objects.all().prefetch_related("modifiers")

    order = get_object_or_404(
        Order.objects
        .select_related("customer", "created_by")
        .prefetch_related(
            Prefetch("items", queryset=items_qs),
            # "payments",
        ),
        pk=pk,
    )

    data = serialize_order_for_modal(order)
    data["permissions"] = compute_order_permissions(order, request.user)
    return JsonResponse({"ok": True, "order": data})
@login_required
def orders_page(request):
    return render(request, "orders_page.html")


