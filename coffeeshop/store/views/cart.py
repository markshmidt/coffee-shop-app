import json
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.http import HttpResponseBadRequest, JsonResponse
from django.views.decorators.http import require_POST, require_GET

from ..apps import POS_DISCOUNT_CHOICES
from ..models import MenuItem, Variant
from ..services.cart import price_item_validate, summarize_selections, get_cart, save_cart, \
    cart_snapshot


# ====== CART ====

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
    try:
        item = MenuItem.objects.get(id=item_id, active=True)
    except MenuItem.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Item not found"}, status=404)

    # 4) Price & validate
    try:
        # accept either 4-tuple or 5-tuple from the validator
        res = price_item_validate(
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
    summary = summarize_selections(normalized)  # function shown below

    # 7) Save into the session cart
    from uuid import uuid4
    line_id = uuid4().hex[:16]

    cart = get_cart(request.session)
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
    save_cart(request.session, cart)

    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})

# Retrieve full cart snapshot
@login_required
@require_GET
def cart_get(request):
    cart = get_cart(request.session)
    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)
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
    save_cart(request.session, request.session["cart"])
    return JsonResponse({"ok": True, "cart": cart_snapshot(request.session["cart"])})

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

    cart = get_cart(request.session)
    for line in cart["lines"]:
        if line["id"] == line_id:
            #set new quantity
            if qty <= 0:
                # treat 0 or negative as "remove"
                cart["lines"].pop(line)
            else:
                line["qty"] = qty
            save_cart(request.session, cart)
            return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})

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

    cart = get_cart(request.session)

    # Filter out that line
    before = len(cart["lines"])
    cart["lines"] = [line for line in cart["lines"] if line["id"] != line_id]
    if len(cart["lines"]) == before:
        return HttpResponseBadRequest("Line not found")

    save_cart(request.session, cart)
    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})

@login_required
@require_POST
def cart_discount(request):
    data = json.loads(request.body.decode("utf-8"))
    cart = get_cart(request.session)

    if "discount_code" in data:
        code = data["discount_code"]
        if code not in POS_DISCOUNT_CHOICES:
            return HttpResponseBadRequest("Unknown discount code")
        cart["discount_code"] = code

    if "payment_method" in data:
        method = (data["payment_method"] or "").upper()
        if method not in ("CARD", "CASH"):
            return HttpResponseBadRequest("Bad payment method")
        cart["payment_method"] = method
    if "redeem" in data:
        cart["redeem"] = bool(data["redeem"])
        save_cart(request.session, cart)

    save_cart(request.session, cart)
    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})
