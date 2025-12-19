from ..apps import POS_DISCOUNT_CHOICES, POS_TAX_RATE_BPS, POS_LOYALTY_PRICE_CAP_CENTS, \
    POS_NICKEL_ROUNDING
from ..models import Customer, ModifierOption, Variant, MenuItem, ModifierGroup
from ..services.loyalty import compute_earn_points
from ..services.pricing import _bp, _nickel_round_cents, _fmt_cents


def get_cart(session):
    """
     Get cart from session; create one if missing.

    Parameters
    ----------
    session : SessionBase or Mapping
        Django session object (`request.session`).

    Returns
    -------
    dict[str, Any]
        The cart dictionary.
    """
    cart = session.get("cart")
    if not cart:
        cart = empty_cart()
        session["cart"] = cart #no session.modified needed as we assign new key
    return cart

def save_cart(session, cart):
    """
    Recomputes the subtotals from the cart. Saves in session.

    Parameters
    ----------
    session : SessionBase or Mapping
        Django session object (`request.session`).
    cart : dict[str, Any]
        The cart dictionary.

    Returns
    -------
    null
    """
    subtotal_cents = sum(line["qty"] * line["unit_total_cents"] for line in cart["lines"])
    # discount (in basis points from config)
    discount_code = POS_DISCOUNT_CHOICES.get(cart.get("discount_code") or "NONE", 0)
    discount_cents = _bp(subtotal_cents, discount_code)

    taxable = max(0, subtotal_cents - discount_cents)
    tax_cents = _bp(taxable, POS_TAX_RATE_BPS)

    pre_total = taxable + tax_cents

    loyalty_cents = 0
    cid = cart.get("customer_id")
    if cart.get("redeem") and cid:
        cust = Customer.objects.only("id", "points_balance").filter(pk=cid).first()
        if cust and cust.can_redeem():
            # policy: percent discount first, then loyalty on the remainder
            loyalty_cents = min(pre_total, POS_LOYALTY_PRICE_CAP_CENTS)


    total = max(0, pre_total - loyalty_cents)
    rounding_delta = 0
    if cart.get("payment_method") == "CASH" and POS_NICKEL_ROUNDING:
        rounded = _nickel_round_cents(pre_total)
        rounding_delta = rounded - pre_total
        total = rounded

    cart["subtotal_cents"] = subtotal_cents
    cart["discount_cents"] = discount_cents
    cart["tax_cents"] = tax_cents
    cart["total_cents"] = total
    cart["rounding_delta_cents"] = rounding_delta
    cart["loyalty_redemption_cents"] = loyalty_cents
    request_session = session
    request_session["cart"] = cart

    session.modified = True

def empty_cart():
    """
        Resets the cart to empty.

        Parameters
        ----------
        null

        Returns
        -------
        lines: [] — list of cart lines (each line is a dict with id, qty, unit_total_cents, etc.).

        discount_code: "NONE" — current percent discount code.

        payment_method: "CARD" (default)

        subtotal_cents / discount_cents / tax_cents / total_cents / rounding_delta_cents — all monetary amounts in cents (ints).

        redeem: False — whether the user intends to apply loyalty on checkout.

        loyalty_redemption_cents: 0 — amount that would be or is applied from loyalty (in cents).

        customer_id: None — attached customer (existing).

        create: None — pending “create new customer” intent payload.
        """
    return {
        "lines": [],

        "discount_code": "NONE",
        "payment_method": "CARD",

        "subtotal_cents": 0,
        "discount_cents": 0,
        "tax_cents": 0,
        "total_cents": 0,
        "rounding_delta_cents": 0,

        # loyalty
        "redeem": False,
        "loyalty_redemption_cents": 0,

        # customer
        "customer_id": None,
        "create": None,
    }

# ---- convenience function to return a uniform JSON cart snapshot
def cart_snapshot(cart):
    """
    Snapshot returned to the client after any change.
    Keep fields stable so frontend render code is simple.

        Parameters
        ----------
        cart : dict[str, Any]
        The cart dictionary.


        Returns
        -------
        dict[str, Any]
    """

    subtotal = cart.get("subtotal_cents", 0)
    discount_cents = cart.get("discount_cents", 0)
    projected_pts = compute_earn_points(subtotal)

    loyalty_preview_cents = 0

    loyalty = {"projected_points": projected_pts}
    cid = cart.get("customer_id")
    has_customer = bool(cart.get("customer_id") or cart.get("create"))
    can_redeem = False
    if cid:
        pts = (
                  Customer.objects
                  .filter(pk=cid)
                  .values_list("points_balance", flat=True)
                  .first() #avoids DoesNotExist exception.
              ) or 0

        customer = Customer.objects.only("id", "points_balance").filter(pk=cid).first()

        loyalty.update({"customer_id": cid, "points_balance": pts,  "can_redeem": customer.can_redeem() if customer else False})
        if customer and cart.get("redeem") and loyalty["can_redeem"]:
            loyalty_preview_cents = max(0, subtotal - discount_cents)
            loyalty_preview_cents = min(
                loyalty_preview_cents,
                POS_LOYALTY_PRICE_CAP_CENTS
            )
            can_redeem = True
    if not can_redeem:
        cart["redeem"] = False

    return {
         "lines": cart.get("lines", []),
        "discount_code": cart.get("discount_code", "NONE"),
        "payment_method": cart.get("payment_method", "CARD"),
        "has_customer": has_customer,

        # raw cents
        "subtotal_cents": subtotal,
        "discount_cents": discount_cents,
        "tax_cents": cart.get("tax_cents", 0),
        "total_cents": cart.get("total_cents", 0),
        "rounding_delta_cents": cart.get("rounding_delta_cents", 0),

        # labels
        "subtotal_label": _fmt_cents(subtotal),
        "discount_label": "-" + _fmt_cents(discount_cents) if discount_cents else _fmt_cents(0),
        "tax_label": _fmt_cents(cart.get("tax_cents", 0)),
        "total_label": _fmt_cents(cart.get("total_cents", 0)),
        "rounding_delta_label": _fmt_cents(cart.get("rounding_delta_cents", 0)),

        # loyalty preview for the cart UI
        "loyalty": loyalty,
        "loyalty_redemption_cents": loyalty_preview_cents,
        "loyalty_redemption_label": _fmt_cents(loyalty_preview_cents),
        "redeem": bool(cart.get("redeem")),

    }


def summarize_selections(selections):
    """

    We resolve names & deltas from selections to "Milk: Oat (+$1.00); Syrups: Caramel (+$0.50), Vanilla (+$0.50)".

    Parameters
        ----------
        selections : list like [{'group_id': 5, 'option_ids': [20, 21]}, {'group_id': 7, 'option_ids':[22]}]

        Returns
        -------
       list[dict[str, Any]]
    """
    if not selections:
        return ""

    parts = []
    for sel in selections:
        group_id = sel.get("group_id")
        options_ids = sel.get("option_ids") or []
        if not group_id or not options_ids:
            continue

        try:
            g = ModifierGroup.objects.only("name").get(id=group_id)
        except ModifierGroup.DoesNotExist:
            continue

        # list like [{ "name": "Oat Milk", "price_cents": 100 }, { "name": "Vanilla", "price_cents": 50 }]
        opts = list(
            ModifierOption.objects.filter(id__in=options_ids)
            .values("name", "price_cents")
        )

        if not opts:
            continue

        labeled = []
        for o in opts:
            delta = o["price_cents"] or 0
            if delta:
                labeled.append(f"{o['name']} (+{_fmt_cents(delta)})") #like "Vanilla (+0.50)"
            else:
                labeled.append(o["name"]) #if free, just name
        parts.append(f"{g.name}: " + ", ".join(labeled))

    return " ; ".join(parts)


def price_item_validate(item: MenuItem, variant_id, selections):
    """
    Validation:
    - Variant belongs to MenuItem
    - GroupModifier is allowed to MenuItem (e.g. no syrups for the food)
    - ModifiersOptions belong to the chosen Group
    - Min/Max enforces business rule (e.g. 1 milk per item, 3 syrups max)
    - Convert all to ints
    Parameters
        ----------
        item : dict[str, Any]
        variant_id : int
        selections : list[dict[str, Any]]

    Returns
        -------
        base_cents: int - price of the drink
        options_cents: int - Sum of all selected modifier option deltas (per unit), in cents
        unit_total_cents: int - base_cents + options_cents (per-unit price)
        normalized_selections: list[dict] - list like  [{"group_id": 5, "option_ids": [20, 21]},{"group_id": 7, "option_ids": [22]}]
        variant_name: str | None - the label for the chosen variant (e.g., "12oz"), none for items without variants
    """

    #variant exists and its price is assigned to base cents
    if variant_id:
        try:
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
    groups_qs = item.applicable_modifier_groups() #for future management
    allowed_groups = {g.id: g for g in groups_qs}

    # validate selections and sum deltas
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
        normalized.append({"group_id": gid, "option_ids": option_ids}) #[{"group_id":1, "option_ids": [1,2,3]}]

    #combine variant price + modifiers prices
    unit_total_cents = base_cents + options_cents
    return base_cents, options_cents, unit_total_cents, normalized, variant_name

'''CART LOOK LIKE
lines": [
      {
        "id": "55f7b30116ac4799",
        "item_id": 4,
        "item_name": "Cortado",
        "variant_id": null,
        "variant_name": null,
        "qty": 1,
        "base_cents": 500,
        "options_cents": 0,
        "unit_total_cents": 500,
        "selections": [
          {
            "group_id": 5,
            "option_ids": [
              20
            ]
          },
          {
            "group_id": 7,
            "option_ids": [
              22
            ]
          }
        ],
        "summary": "Beans: Master Blend ; Milk: 3%"
      }
    ],
    "discount_code": "NONE",
    "payment_method": "CARD",
    "subtotal_cents": 500,
    "discount_cents": 0,
    "tax_cents": 65,
    "total_cents": 565,
    "rounding_delta_cents": 0,
    "customer_id": 3,
    "loyalty_redemption_cents": 0,
    "redeem": false
  }'''

