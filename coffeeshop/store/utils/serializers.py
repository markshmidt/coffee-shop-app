from collections import defaultdict
from django.utils import timezone

from ..services.loyalty import compute_earn_points
from ..services.pricing import _fmt_cents

tz = timezone.get_default_timezone()
def serialize_order_for_modal(order):
    """
    Return a dict with everything the Order modal needs (for order details).


    Parameters
    ----------
    order : Order - a Django Order instance

    Return
    ----------
    JSON dict

    """
    created_at = timezone.localtime(order.created_at, tz)

    # ---- Items with variants + modifiers ----
    items_out = []

    #loop through all OrderItems for the current order
    for item in order.items.all():
        # fetch modifier snapshots for this order item
        try:
            mods_qs = item.modifiers.all()
        except Exception:
            mods_qs = []

        # flat list of modifier dicts + per-unit modifier sum
        modifiers_out = []
        per_unit_mod_sum = 0
        for m in mods_qs:
            delta = getattr(m, "price_delta_cents_snapshot", 0) or 0
            per_unit_mod_sum += delta
            modifiers_out.append({
                "group": getattr(m, "group_name_snapshot", ""),
                "choice": getattr(m, "option_name_snapshot", ""),
                "price_cents": delta,
                "price_label": _fmt_cents(delta),
            })


        qty  = item.qty
        unit_price  = item.unit_price_cents or 0                 # base + modifiers (per unit)

        base = getattr(item, "base_unit_price_cents", None)
        if base is None:
            base = max(0, unit_price - per_unit_mod_sum)

        mods = max(0, per_unit_mod_sum)

        # extended amounts
        base_total_cents = base * qty
        mods_total_cents = mods * qty

        # final per-item dict
        items_out.append({
            "line_id": item.id,
            "name": item.name_snapshot,
            "variant": item.variant_name_snapshot or "",
            "qty": qty,

            # base vs mods (unit + extended)
            "base_unit_cents": base,
            "base_unit_label": _fmt_cents(base),
            "base_total_cents": base_total_cents,
            "base_total_label": _fmt_cents(base_total_cents),

            "mods_unit_cents": mods,
            "mods_unit_label": _fmt_cents(mods),
            "mods_total_cents": mods_total_cents,
            "mods_total_label": _fmt_cents(mods_total_cents),

            # modifiers
            "modifiers": modifiers_out,

            # original totals
            "unit_cents": unit_price,
            "unit_label": _fmt_cents(unit_price),
            "line_cents": unit_price * qty,
            "line_label": _fmt_cents(unit_price * qty),


        })

    # ---- Totals (use stored, compute if missing) ----
    subtotal_cents = getattr(order, "subtotal_cents", None)
    if subtotal_cents is None:
        subtotal_cents = sum(i["line_cents"] for i in items_out)

    discount_cents = getattr(order, "discount_cents", 0) or 0
    tax_cents      = getattr(order, "tax_cents", 0) or 0
    rounding_cents = getattr(order, "rounding_delta_cents", 0) or 0
    grand_cents    = getattr(order, "total_cents", 0)

    totals = {
        "subtotal_cents": subtotal_cents, "subtotal_label": _fmt_cents(subtotal_cents),
        "discount_cents": discount_cents, "discount_label": _fmt_cents(discount_cents),
        "tax_cents":      tax_cents,      "tax_label":      _fmt_cents(tax_cents),
        "rounding_cents": rounding_cents, "rounding_label": _fmt_cents(rounding_cents),
        "grand_total_cents": grand_cents, "grand_total_label": _fmt_cents(grand_cents),
        "loyalty_redemption_cents": order.loyalty_redemption_cents,
        "loyalty_redemption_label": _fmt_cents(order.loyalty_redemption_cents),
    }

    customer = None
    if getattr(order, "customer_id", None):
        c = order.customer
        customer = {
            "id": c.id,
            "fname": getattr(c, "fname", ""),
            "lname": getattr(c, "lname", ""),
            "phone": getattr(c, "phone", ""),
            "email": getattr(c, "email", ""),
            "points_balance": getattr(c, "points_balance", 0),
        }
    # projected_pts = compute_earn_points(subtotal_cents)

    return {
        "id": order.id,
        "number": getattr(order, "receipt_number", order.id),
        "status": order.status,
        "payment_method": (getattr(order, "payment_method", "") or "").upper(),
        "created_by": order.created_by.get_username(),
        "created_at_iso": created_at.isoformat(),
        "created_at_label": created_at.strftime("%Y-%m-%d %H:%M"),
        "items": items_out,
        "totals": totals,
        "customer": customer,
        "notes": getattr(order, "internal_notes", ""),
        "loyalty": {
            "points_earned": getattr(order, "points_earned", 0),
            "redeemed_points": getattr(order, "redeemed_points", 0),
            # "projected_points": projected_pts,
        },
    }

