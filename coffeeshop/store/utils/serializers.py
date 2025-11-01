from collections import defaultdict
from datetime import timezone

from ..services.loyalty import compute_earn_points
from ..services.pricing import _fmt_cents


def serialize_order_for_modal(order):
    """
    Return a dict with everything the modal needs.
    """
    when_dt = timezone.localtime(order.created_at)

    # ---- Items with variants + modifiers ----
    items_out = []

    #loop through all OrderItems for the current order
    for it in order.items.all():
        # fetch modifier snapshots for this order item (already prefetched by order_detail)
        try:
            mods_qs = it.modifiers.all()
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

        # unit & qty
        qty  = it.qty
        u_c  = it.unit_price_cents or 0                 # base + modifiers (per unit)

        # base may be missing on legacy rows -> derive safely
        base = getattr(it, "base_unit_price_cents", None)
        if base is None:
            base = max(0, u_c - per_unit_mod_sum)

        mods = max(0, per_unit_mod_sum)

        # extended amounts
        base_total_cents = base * qty
        mods_total_cents = mods * qty

        # group modifiers for a future cheque ui (group totals + extended totals)
        grouped = defaultdict(lambda: {"group": "", "options": [], "group_total_cents": 0})
        for modifier in modifiers_out:
            #sum per-unit deltas per group
            g = modifier["group"] or "Modifiers"
            box = grouped[g]
            box["group"] = g
            box["options"].append(modifier)
            box["group_total_cents"] += (modifier["price_cents"] or 0)

        modifier_groups = []
        for box in grouped.values():
            # for each group per-unit sum × qty
            ext = (box["group_total_cents"] or 0) * qty
            modifier_groups.append({
                **box,
                "group_total_label": _fmt_cents(box["group_total_cents"]),
                "group_total_ext_cents": ext,
                "group_total_ext_label": _fmt_cents(ext),
            })

        # final per-item dict
        items_out.append({
            "line_id": it.id,
            "name": it.name_snapshot,
            "variant": it.variant_name_snapshot or "",
            "qty": qty,

            # original totals
            "unit_cents": u_c,
            "unit_label": _fmt_cents(u_c),
            "line_cents": u_c * qty,
            "line_label": _fmt_cents(u_c * qty),

            # base vs mods (unit + extended)
            "base_unit_cents": base,
            "base_unit_label": _fmt_cents(base),
            "base_total_cents": base_total_cents,
            "base_total_label": _fmt_cents(base_total_cents),

            "mods_unit_cents": mods,
            "mods_unit_label": _fmt_cents(mods),
            "mods_total_cents": mods_total_cents,
            "mods_total_label": _fmt_cents(mods_total_cents),

            # modifiers (both flat + grouped for UI)
            "modifiers": modifiers_out,
            "modifier_groups": modifier_groups,

            "note": getattr(it, "note", ""),
        })

    # ---- Totals (use stored, compute if missing) ----
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
        "loyalty_redemption_cents": order.loyalty_redemption_cents,
        "loyalty_redemption_label": _fmt_cents(order.loyalty_redemption_cents),
    }
    # ---- Payments (if you have a relation) ----
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
    projected_pts = compute_earn_points(subtotal_cents)

    return {
        "id": order.id,
        "number": getattr(order, "receipt_number", order.id),
        "status": order.status,
        "payment_method": (getattr(order, "payment_method", "") or "").upper(),
        "created_by": order.created_by.get_username(),
        "when_iso": when_dt.isoformat(),
        "when_label": when_dt.strftime("%Y-%m-%d %H:%M"),
        "items": items_out,
        "totals": totals,
        "payments": payments_out,
        "customer": customer,
        "notes": getattr(order, "internal_notes", ""),
        "loyalty": {
            "points_earned": getattr(order, "points_earned", 0),
            "redeemed_points": getattr(order, "redeemed_points", 0),
            "projected_points": projected_pts,
        },
    }

