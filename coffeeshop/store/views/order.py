import logging
from django.contrib.auth.decorators import login_required
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max, Prefetch, F
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.http import require_POST, require_GET, require_http_methods

from ..apps import POS_LOYALTY_PRICE_CAP_CENTS, POS_REDEMPTION_POINTS, POS_TAX_RATE_BPS, \
    POS_NICKEL_ROUNDING
from ..models import Customer, MenuItem, Order, OrderItem, ModifierOption, OrderItemModifier, \
    ModifierGroup
from ..permissions import compute_order_permissions
from ..services.cart import get_cart, price_item_validate, empty_cart, save_cart
from ..services.loyalty import award_points_for_order
from ..services.pricing import _bp, _nickel_round_cents, _fmt_cents
from ..utils.http import parse_json
from ..utils.serializers import serialize_order_for_modal, customer_to_dict

logger = logging.getLogger(__name__)
@login_required
@require_POST
@transaction.atomic
def order_payment(request):
    """
    Create and finalize an Order from a session cart payload.

    This endpoint:
      - Re-validates and re-prices each line against the DB (item/variant/modifiers).
      - Applies percent discounts (in cents), loyalty redemption, tax (basis points), and cash rounding.
      - Persists Order, OrderItems, and modifier snapshots.
      - Optionally attaches/creates a Customer based on the session cart.
      - Clears the in-session cart and returns an order summary.
 Request JSON:
      {}
 Response: 201 with order summary JSON (totals, labels, loyalty info).

    """

    cart = get_cart(request.session)
    logger.debug("CART %s", cart)
    # validate payment method
    method_raw = (cart.get("payment_method") or "").upper().strip()
    logger.debug(method_raw)
    if method_raw not in ("CARD", "CASH"):
        return JsonResponse({"ok": False, "error": "payment_method must be 'CARD' or 'CASH'."}, status=400)
    payment_method = method_raw


    redeem = bool(cart.get("redeem", False))
    requested_discount_cents = int(cart.get("discount_cents", 0)) or 0
    lines = cart.get("lines") or []
    if not lines:
        return JsonResponse({"ok": False, "error": "Cart is malformed."}, status=400)

    #resolve customer
    #inspect the session cart and return a Customer  or None
    customer = None
    if cart.get("customer_id"):
        # lock the row to update points in the same txn later
        customer = Customer.objects.select_for_update().get(pk=cart["customer_id"])
    elif cart.get("create"):
        data = cart["create"]
        existing = Customer.objects.select_for_update().filter(phone=data["phone"]).first()
        customer = existing or Customer.objects.create(
            fname=(data.get("fname") or "").strip(),
            lname=(data.get("lname") or "").strip(),
            phone= (data.get("phone") or "").strip(),
            email=(data.get("email") or "").strip().lower()
        )

    # ---- Recompute from DB ----
    staged_items = []
    subtotal = 0

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

        #ensure menuitem exists
        try:
            item = MenuItem.objects.get(id=item_id, active=True)
        except MenuItem.DoesNotExist:
            return JsonResponse({"ok": False, "error": f"Line {idx}: item not found."}, status=404)

        base, opt, unit, normalized, vname = price_item_validate(item, variant_id, selections)
        line_sub = unit * qty
        subtotal += line_sub
        staged_items.append({"item": item, "quantity": qty, "base": base, "unit": unit,
                       "options": opt, "normalized": normalized, "variant_name": vname or ""})

    # ----- Discount, Tax,rounding -----

    # apply discount in cents;
    discount_cents = min(requested_discount_cents, subtotal)

    # redemption logic
    loyalty_redemption_cents = 0
    redeemed_points = 0
    if customer and redeem and customer.can_redeem():
        loyalty_redemption_cents = min(
            max(0, subtotal - discount_cents),
            POS_LOYALTY_PRICE_CAP_CENTS
        )
        redeemed_points = POS_REDEMPTION_POINTS

    taxable_cents = max(0, subtotal - discount_cents - loyalty_redemption_cents) #avoid negative
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
        customer=customer,
        payment_method=payment_method,
        subtotal_cents=subtotal,
        tax_cents=tax_cents,
        total_cents=total_cents,
        discount_cents=discount_cents,
        rounding_delta_cents=rounding_delta_cents,
        created_at=timezone.now(),
        receipt_number=next_receipt,
        loyalty_redemption_cents=loyalty_redemption_cents,
        redeemed_points=redeemed_points,

    )

    items_to_create = [
        OrderItem(
            order=order,
            menu_item=si["item"],
            name_snapshot=si["item"].name,
            variant_name_snapshot=si["variant_name"],
            base_unit_price_cents=si["base"],
            unit_price_cents=si["unit"],
            qty=si["quantity"],
        )
        for si in staged_items
    ]
    created_items = OrderItem.objects.bulk_create(items_to_create)
    #lookups for groups/modifiers options
    group_ids, option_ids = set(), set()
    for si in staged_items:
        for sel in si["normalized"]:
            group_ids.add(sel["group_id"]) #(e.g., “Syrups”, “Milk”).
            option_ids.update(sel["option_ids"])#(e.g., “Caramel”, “Oat Milk”).

    #maps ids -> names/prices
    groups = {g.id: g.name for g in ModifierGroup.objects.filter(id__in=group_ids).only("id", "name")}
    options = {o.id: (o.name, o.price_cents) for o in
               ModifierOption.objects.filter(id__in=option_ids).only("id", "name", "price_cents")}

    mods_to_create = []
    #build modifier snapshot rows
    for oi, si in zip(created_items, staged_items):
        for sel in si["normalized"]:
            gname = groups.get(sel["group_id"], "")
            for oid in sel["option_ids"]:
                oname, delta = options.get(oid, ("", 0))
                mods_to_create.append(OrderItemModifier(
                    order_item=oi,
                    group_name_snapshot=gname,  # e.g. "Syrups"
                    option_name_snapshot=oname,  # e.g. "Caramel"
                    price_delta_cents_snapshot=delta,  # per-unit delta e.g.+50¢
                ))
    if mods_to_create:
        logger.debug("[PAY] saved modifier snapshots in DB:",
        OrderItemModifier.objects.bulk_create(mods_to_create))

    points_awarded, new_balance = (0, None)
    if order.customer_id and order.subtotal_cents > 0:
        pts, bal = award_points_for_order(order.pk)
        points_awarded, new_balance = pts, bal

    # build customer_out with fresh balance
    customer_out = None
    if order.customer_id:
        if redeemed_points:
            Customer.objects.filter(pk=customer.pk).update(
                points_balance=F('points_balance') - redeemed_points
            )
        c = Customer.objects.only(
            "id", "fname", "lname", "phone", "email", "points_balance"
        ).get(pk=order.customer_id)
        customer_out = customer_to_dict(c)

    # ----- clear session cart -----
    save_cart(request.session, empty_cart())
    logger.debug("SESSION %s CART %s", request.session.session_key, request.session.get("cart"))

    # --- response payload ---
    chip_method = "Cash" if payment_method == "CASH" else "Card"
    resp = {
         "ok": True,
        "order_id": order.id,
        "customer": customer_out,
        "created_by": request.user.get_full_name() or request.user.get_username(),
        "subtotal_cents": subtotal,
        "discount_cents": discount_cents,
        "tax_cents": tax_cents,
        "total_cents": total_cents,
        "rounding_delta_cents": rounding_delta_cents,
        "subtotal_label": _fmt_cents(subtotal),
        "discount_label": ("-" + _fmt_cents(discount_cents)) if discount_cents else _fmt_cents(0),
        "tax_label": _fmt_cents(tax_cents),
        "total_label": _fmt_cents(total_cents),
        "chip_label": f"{_fmt_cents(total_cents)[1:]} {chip_method}",
        "loyalty": {
            "redeemed_points": redeemed_points,
            "points_awarded": points_awarded,
            "customer_points_balance": new_balance,
            "loyalty_redemption_cents": loyalty_redemption_cents,
            "loyalty_redemption_label": _fmt_cents(loyalty_redemption_cents),
        },
        "loyalty_redemption_cents": order.loyalty_redemption_cents,
        "loyalty_redemption_label": _fmt_cents(order.loyalty_redemption_cents),
    }

    return JsonResponse(resp, status=201)

@login_required
@require_GET
def orders_list(request):
    """
    Return a paginated, newest-first list of recent orders for the current UI.

    Query parameters
    ----------------
    - limit: Optional[int]  # number of rows to return; clamped to [1, 50]
    - cursor: Optional[int] # last seen Order.id; return rows with id < cursor

    Returns
         -------
         JsonResponse

    """
    try:
        limit = max(1, min(50, int(request.GET.get("limit", 16))))
    except Exception:
        limit = 1

    cursor = request.GET.get("cursor") # last seen Order.id
    qs = (
        Order.objects
        .select_related("created_by") #joins the user table
        .prefetch_related( #pulls only the columns needed for the list ui
            Prefetch( #fetch all items for the slice of orders
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
        .order_by("-id") #newest first
    )
    if cursor:
        try:
            qs = qs.filter(id__lt=int(cursor))
        except Exception:
            pass

    out = []
    page = list(qs[:limit + 1])  # ask for one more than we plan to return
    has_more = len(page) > limit  # true if the +1 existed
    orders = page[:limit]  # trim the extra before serializing

    for o in orders: #materializes only page in settled limit with prefetched orders
        when_dt = timezone.localtime(o.created_at)  # show local time
        when_label = when_dt.strftime("%Y-%m-%d %H:%M")

        out.append({
            "id": o.id,
            "status": o.status,
            "when_iso": when_dt.isoformat(),
            "when_label": when_label,
            "payment_method": o.payment_method,
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
    logger.info(out)
    next_cursor = orders[-1].id if has_more else None
    return JsonResponse({"ok": True, "orders": out, "next_cursor": next_cursor})

@login_required
@require_GET
def order_detail(request, pk):
    """
    JSON payload for the modal

    Parameters
    ----------------
    request : HttpRequest
        Incoming GET request.
    pk : int | str
        Primary key of the Order to retrieve.
    Returns
         -------
          JsonResponse like {
          "ok": true,
          "order": {
            ...  # output of serialize_order_for_modal(order)
            "permissions": { ... }  # capabilities for the current user
          }
        }


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

    #modal payload and attaching user-specific permissions
    data = serialize_order_for_modal(order)
    data["permissions"] = compute_order_permissions(order, request.user)
    return JsonResponse({"ok": True, "order": data})

@login_required
@require_http_methods(["PATCH"])
def order_note(request, pk):
    payload = parse_json(request)

    note = payload.get("note", "")
    if not isinstance(note, str):
        return JsonResponse({"ok": False, "error": "`note` must be a string."}, status=400)

    note = note.strip().replace("\r\n", "\n")
    if len(note) > 400:
        return JsonResponse({"ok": False, "error": f"Note too long (>{400} chars)."}, status=400)


    order = get_object_or_404(Order.objects.select_for_update(), pk=pk)

    order.internal_notes = note
    order.save(update_fields=["internal_notes"])

    return JsonResponse({
        "ok": True,
        "order_id": order.id,
        "note": order.internal_notes,
    }, status=200)

@login_required
def order_receipt(request, pk):
    """
        Render an HTML receipt for printing.
        Query params:
          - save=1     -> persist the rendered HTML into order.receipt_file also persist the HTML to FileField.
        e.g. /orders/5/receipt/?save=1
        """

    items_qs = OrderItem.objects.all().prefetch_related("modifiers")

    order = get_object_or_404(Order.objects
        .select_related("customer", "created_by")
        .prefetch_related(Prefetch("items", queryset=items_qs)), pk=pk)

    # reuse serializer
    data = serialize_order_for_modal(order)

    # render template, return a string format
    html = render_to_string("receipt.html", {"order": data})

    # save html receipt to db field for audit trails and sending receipt to customer (later)
    if request.GET.get("save") == "1" and hasattr(order, "receipt_file"):
        filename = f"receipt-{order.id}.html"
        # contentFile - wraps html string as a file-like object
        #order.receipt_file.url - url to fetch, order.receipt_filename - name of file .
        order.receipt_file.save(filename, ContentFile(html), save=True)

    #return inline for future preview
    return HttpResponse(html)
@login_required
def orders_page(request):
    return render(request, "orders_page.html")
