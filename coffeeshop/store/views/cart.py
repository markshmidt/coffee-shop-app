from django.contrib.auth.decorators import login_required
from django.http import HttpResponseBadRequest, JsonResponse
from django.views.decorators.http import require_POST, require_GET

from ..apps import POS_DISCOUNT_CHOICES
from ..models import MenuItem
from ..services.cart import price_item_validate, summarize_selections, get_cart, save_cart, \
    cart_snapshot, empty_cart
from ..utils.http import parse_json
from uuid import uuid4

@login_required
@require_POST
def cart_add_line(request):
    """
    Add a line to the cart.

     Parameters
        ----------
        request: django.http.HttpRequest like {"item_id": {{item_id}}, "variant_id": {{variant_id}},"qty": 1,
        "selections": [{ "group_id": {{group_id}}, "option_ids": [{{option_id_1}}, {{option_id_2}}] }]}

    Returns
        -------
        JsonResponse
    """
    # Parse JSON safely
    try:
        payload = parse_json(request)
    except Exception:
        return JsonResponse({"ok": False, "error": "Bad JSON in cart_add_line view"}, status=400)

    # Extract & validate fields types
    try:
        item_id = int(payload["item_id"])
        variant_id = payload.get("variant_id")
        if variant_id is not None:
            variant_id = int(variant_id)
        qty = int(payload.get("qty", 1))
        selections = payload.get("selections") or []
    except Exception:
        return JsonResponse({"ok": False, "error": "Bad payload"}, status=400)

    # Fetch item
    try:
        item = MenuItem.objects.get(id=item_id, active=True)
    except MenuItem.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Item not found"}, status=404)

    # Price & validate
    try:
        base_cents, options_cents, unit_total_cents, normalized, variant_name = price_item_validate(
            item=item,
            variant_id=variant_id,
            selections=selections,
        )
    except ValueError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    except Exception:
        return JsonResponse({"ok": False, "error": "Server error"}, status=500)

    # user-friendly summary string with option deltas + tax
    summary = summarize_selections(normalized)

    #save into the session cart
    line_id = uuid4().hex[:16] #client/session-side primary key for a cart line
    cart = get_cart(request.session)
    cart["lines"].append({
        "id": line_id,
        "item_id": item.id,
        "item_name": item.name,
        "variant_id": variant_id,
        "variant_name": variant_name,
        "qty": qty,
        "base_cents": base_cents,
        "options_cents": options_cents,
        "unit_total_cents": unit_total_cents,
        "selections": normalized,
        "summary": summary,
    })
    save_cart(request.session, cart)

    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})

# Retrieve full cart snapshot
@login_required
@require_GET
def cart_get(request):
    """
        Retrieve cart snaphot

         Parameters
            ----------
            request: django.http.HttpRequest
        Returns
            -------
            JsonResponse
        """
    cart = get_cart(request.session)
    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)
    })

@login_required
@require_POST
def cart_clear(request):
    """
         Return empty cart

          Parameters
             ----------
             request: django.http.HttpRequest
         Returns
             -------
             JsonResponse
         """
    cart = empty_cart()
    request.session["cart"] = cart
    return JsonResponse({"ok": True, "cart": cart_snapshot(request.session["cart"])})

@login_required
@require_POST
# Update quantity
def cart_update_line(request):
    """"
    Behavior:
      - if the line exists and qty > 0 -> set that qty
      - if the line exists and qty <= 0 -> remove the line
      - recompute subtotal and return a fresh snapshot
    Payload example:
      {"line_id": "f2d6-...", "qty": 3}

  Parameters
         ----------
         request: django.http.HttpRequest
     Returns
         -------
         JsonResponse
    """
    try:
        payload = parse_json(request)
        line_id = payload["line_id"]
        qty = int(payload.get("qty", 0)) #if qty missing -> assign to 0 and remove
    except Exception:
        return HttpResponseBadRequest("Bad payload")

    cart = get_cart(request.session)
    for i, line in enumerate(cart["lines"]):
        if line["id"] == line_id:
            if qty <= 0:
                del cart["lines"][i]
            else:
                line["qty"] = qty
            save_cart(request.session, cart)
            return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})

    return HttpResponseBadRequest("Line not found")


@login_required
@require_POST
def cart_discount(request):
    """"
    Updates discount/payment/redeem flags on the cart and return a fresh snapshot.

  Parameters
         ----------
         request: django.http.HttpRequest
     Returns
         -------
         JsonResponse
    """
    data = parse_json(request)
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
    return JsonResponse({"ok": True, "cart": cart_snapshot(cart)})
