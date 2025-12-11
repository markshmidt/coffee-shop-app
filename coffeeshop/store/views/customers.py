
from django.contrib.auth.decorators import login_required
from django.db import transaction, IntegrityError
from django.db.models import Count, Q, Subquery, OuterRef, Prefetch
from django.db.models.functions import Coalesce
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseNotFound
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from ..models import Customer, Order, OrderItem
from ..permissions import compute_order_permissions
from ..services.cart import get_cart, save_cart
from ..services.pricing import _fmt_cents
from ..utils.http import parse_json
from ..utils.serializers import serialize_order_for_modal, customer_to_dict


@login_required
@require_GET
def customers_list(request):
    """
       Returns list of customers, newest first.
       Parameters:
         - ?limit=20          page size (1..50)
         - ?cursor=<id>       pagination cursor (return ids < cursor)
         - ?q=...             search by name/phone/email (case-insensitive)
         - ?with_orders=brief last 5 orders info
       """
    qs = Customer.objects.all().order_by("-id")

    # search
    q = (request.GET.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(fname__icontains=q) |
            Q(lname__icontains=q) |
            Q(email__icontains=q) |
            Q(phone__icontains=q)
        )
    if request.GET.get("with_orders") == "brief":
        # adds a column order_count using left outer join + group_by
        qs = qs.annotate(order_count=Coalesce(Count("orders"), 0))

        # last_order id/total/when via Subquery
        last_order = Order.objects.filter(customer_id=OuterRef("pk")).order_by("-id")
        qs = qs.annotate(
            last_order_id=Subquery(last_order.values("id")[:1]),
            last_order_total=Subquery(last_order.values("total_cents")[:5]),
            last_order_when=Subquery(last_order.values("created_at")[:5]),
        )

    # simple pagination
    limit = max(1, min(50, int(request.GET.get("limit", 16))))
    cursor = request.GET.get("cursor")
    if cursor:
       qs = qs.filter(id__lt=int(cursor))


    slice = list(qs[:limit])
    out = []
    for c in slice:
        row = {
            "id": c.id,
            "name": f"{(c.fname or '').strip()} {(c.lname or '').strip()}".strip(),
            "phone": c.phone, "email": c.email,
            "points_balance": getattr(c, "points_balance", 0),
            "can_redeem": c.can_redeem(),
            "created_at": c.created_at,
        }
        if request.GET.get("with_orders") == "brief":
            row["order_count"] = getattr(c, "order_count", 0)
            if getattr(c, "last_order_id", None):
                row["last_order"] = {
                    "id": c.last_order_id,
                    "total_cents": c.last_order_total,
                    "total_label": _fmt_cents(c.last_order_total),
                    "when": timezone.localtime(c.last_order_when).strftime("%Y-%m-%d %H:%M"),
                }

        out.append(row)

    next_cursor = out[-1]["id"] if len(out) == limit else None
    return JsonResponse({"ok": True, "customers": out, "next_cursor": next_cursor})

@login_required()
@require_GET
def customer_detail(request, pk):
    """
        Retrieve a single customer by primary key.

        Parameters
        ----------
        pk : int
            Customer primary key.

        Returns
        -------
        JsonResponse
            200 OK:
              {"ok": true, "customer": <customer_to_dict(Customer)>}
            404 Not Found:
              {"ok": false, "error": "Customer not found."}
        """
    try:
        c = Customer.objects.get(pk=pk)
    except Customer.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Customer not found."}, status=404)
    return JsonResponse({"ok": True, "customer": customer_to_dict(c)}, status=200)

@login_required
@require_GET
def customer_orders(request, pk):
    """
        List a customer's orders (newest first), serialized for the modal/detail UI.

        Query Parameters
        ----------------
        limit : int, optional
            Page size, clamped to [1, 50]. Defaults to 20.
        cursor : int, optional
            Keyset pagination cursor. When provided, returns orders with id < cursor.

        Returns
        -------
        JsonResponse
            {
              "ok": true,
              "orders": [ <serialize_order_for_modal(o)>, ... ],
              "next_cursor": int | null
            }
"""

    # base orders for this customer
    orders_qs = (
        Order.objects
        .filter(customer_id=pk)
        .select_related("created_by")             # 1 extra join for creator
        .prefetch_related(
            Prefetch(
                "items",
                queryset=OrderItem.objects
                    .only("order_id","name_snapshot","variant_name_snapshot","qty","unit_price_cents")
                    .prefetch_related("modifiers")
            )
        )
        .order_by("-id")
    )

    # pagination
    limit = max(1, min(50, int(request.GET.get("limit", 20))))
    cursor = request.GET.get("cursor")
    if cursor:
        orders_qs = orders_qs.filter(id__lt=int(cursor))

    orders = list(orders_qs[:limit])

    out = [serialize_order_for_modal(o) for o in orders]
    next_cursor = out[-1]["id"] if len(out) == limit else None
    return JsonResponse({"ok": True, "orders": out, "next_cursor": next_cursor})

@login_required
@require_POST
def cart_assign_customer(request):
    """
    Assign or clear a customer on the in-session cart (not in the DB, because order is not created yer).
    The cart is stored in request.session["cart"] and later used by checkout
    to create an Order with the already-chosen customer.
    Body:
      {"customer_id": 123}                -> attach existing
      {"customer_id": null}               -> remove
      {"create": {fname, lname, phone, email}} -> remember intended new customer
    """
    payload = parse_json(request)

    cart = get_cart(request.session)


    if "customer_id" in payload:
        cart.pop("create", None)
        #  attach existing customer or remove assignment
        cid = payload["customer_id"]
        if cid is None:
            cart["customer_id"] = None
        else:
            # to ensure the referenced customer actually exists
            if not Customer.objects.filter(pk=cid).exists():
                return HttpResponseBadRequest("Customer not found")
            cart["customer_id"] = cid

    #create new customer
    elif "create" in payload:
        data = payload["create"] or {}
        phone = (data.get("phone", "")).strip()
        email = (data.get("email") or "").strip().lower()
        if not phone:
            return HttpResponseBadRequest("Phone is required")
        cart["customer_id"] = None
        # store the create-intent - creation only after order_payment
        cart["create"] = {
            "fname": (data.get("fname") or "").strip(),
            "lname": (data.get("lname") or "").strip(),
            "phone": phone,
            "email": email,
        }
    else:
        return HttpResponseBadRequest("Provide 'customer_id' or 'create'")

    save_cart(request.session, cart)
    return JsonResponse({"ok": True, "cart": {"customer_id": cart.get("customer_id"), "create": cart.get("create")}})

@login_required
@require_POST
@transaction.atomic
def order_assign_customer(request, pk: int):
    """
    Attach/change/remove the customer to existing order
    Body (one of):
      {"customer_id": 123}
      {"customer_id": null}
      {"create": {fname, lname, phone, email}}  # find-by-phone or create, then assign

     Permissions
    -----------
    Requires `compute_order_permissions(order, user)["can_assign_customer"]` to be truthy.

    """
    # lock the order to avoid race conditions
    try:
        order = Order.objects.select_for_update().get(pk=pk)
    except Order.DoesNotExist:
        return HttpResponseNotFound("Order not found")

    # permission required
    perms = compute_order_permissions(order, request.user)
    if not perms.get("can_assign_customer"):
        return HttpResponseBadRequest("Missing permission: can_assign_customer")

    payload = parse_json(request)

    # remove
    if "customer_id" in payload and payload["customer_id"] is None:
        # idempotent no-op: all good even if no customer was attached
        if order.customer_id is None:
            return JsonResponse({"ok": True, "order": serialize_order_for_modal(order)})
        order.customer = None
        order.save(update_fields=["customer"])
        return JsonResponse({"ok": True, "order": serialize_order_for_modal(order)})

    # assign existing
    if "customer_id" in payload:
        cid = payload["customer_id"]
        try:
            cust = Customer.objects.get(pk=cid)
        except Customer.DoesNotExist:
            return HttpResponseBadRequest("Customer not found")
        if order.customer_id == cust.id:  # idempotent, ok if same customer was assigned
            return JsonResponse({"ok": True, "order": serialize_order_for_modal(order)})
        order.customer = cust
        order.save(update_fields=["customer"])
        return JsonResponse({"ok": True, "order": serialize_order_for_modal(order)})

    # create-and-assign
    if "create" in payload:
        data = payload["create"] or {}
        phone = data.get("phone", "").strip()
        email = (data.get("email") or "").strip().lower()
        if not phone:
            return HttpResponseBadRequest("Phone is required")

        # check phone , if no, create new customer
        cust = Customer.objects.filter(phone=phone).first()
        if not cust:
            cust = Customer.objects.create(
                fname=(data.get("fname") or "").strip(),
                lname=(data.get("lname") or "").strip(),
                phone=phone,
                email=email,
            )

        if order.customer_id == cust.id:  # idempotent
            return JsonResponse({"ok": True, "order": serialize_order_for_modal(order)})

        order.customer = cust
        order.save(update_fields=["customer"])
        return JsonResponse({"ok": True, "order": serialize_order_for_modal(order)})

    return HttpResponseBadRequest("Provide 'customer_id', 'customer_id': null, or 'create'")


@login_required
@require_POST
def customer_add(request):
    """
        Create a customer from a JSON or form POST.
        Returns: {ok, id, fname, lname, phone, email}
        """
    if request.content_type and "application/json" in request.content_type:
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"ok": False, "error": "Invalid JSON"}, status=400)
        fname = (payload.get("fname"))
        lname = (payload.get("lname"))
        email = (payload.get("email"))
        phone = (payload.get("phone"))
    else:
        fname = (request.POST.get("fname"))
        lname = (request.POST.get("lname"))
        email = (request.POST.get("email"))
        phone = (request.POST.get("phone"))
    if not (phone):
        return JsonResponse({"ok": False, "error": "Phone is required"}, status=400)
    try:
        with transaction.atomic():
            customer = Customer.objects.create(
                fname=fname,
                lname = lname,
                phone=phone,
                email=email,
            )
    except IntegrityError:
        # unique phone conflict
        return JsonResponse({"ok": False, "error": "Customer already exists:"}, status=409)

    return JsonResponse(
            {
                "ok": True,
                "id": customer.id,
                "first_name": customer.fname,
                "last_name": customer.lname,
                "phone": customer.phone,
                "email": customer.email,
            },
            status=201,
        )

@login_required
@require_POST
def customer_update(request, pk):
    if not request.user.has_perm("store.manage_customers"):
        return HttpResponseBadRequest("Missing permission: manage_customers")

    try:
        c = Customer.objects.get(pk=pk)
    except Customer.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Customer not found"}, status=404)

    payload = parse_json(request)
    c.fname = (payload.get("fname") or "").strip()
    c.lname = (payload.get("lname") or "").strip()
    c.phone = (payload.get("phone") or "").strip()
    c.email = (payload.get("email") or "").strip().lower()
    c.points_balance = int(payload.get("points_balance") or 0)

    try:
        c.save()
    except IntegrityError:
        return JsonResponse({"ok": False, "error": "Phone already used by another customer"}, status=409)

    return JsonResponse({"ok": True, "customer": customer_to_dict(c)})


@login_required
@require_POST
def customer_delete(request, pk):
    if not request.user.has_perm("store.manage_customers"):
        return HttpResponseBadRequest("Missing permission: manage_customers")

    try:
        c = Customer.objects.get(pk=pk)
    except Customer.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Customer not found"}, status=404)

    c.delete()
    return JsonResponse({"ok": True})