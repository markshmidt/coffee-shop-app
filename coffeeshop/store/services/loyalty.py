from django.db import transaction
from django.db.models import F

from ..models import Order, Customer

CENTS_PER_POINT = 100       # 1 point per $1
EARN_RATE = 1               # multiplier if promos later

def compute_earn_points(subtotal_cents: int) -> int:
    return (subtotal_cents // CENTS_PER_POINT) * EARN_RATE

@transaction.atomic
def award_points_for_order(order_ref):
    """
       Accepts an Order instance or a primary-key value. Idempotent via points_earned.
       """
    if isinstance(order_ref, Order):
        pk = order_ref.pk
    else:
        pk = order_ref

    order = (Order.objects
             .select_for_update()
             .select_related('customer')
             .get(pk=pk))  # <-- pk, not id

    if order.points_earned or not order.customer_id or order.subtotal_cents <= 0:
        # Nothing to do; return current balance for convenience
        bal = None
        if order.customer_id:
            bal = Customer.objects.only('points_balance').get(pk=order.customer_id).points_balance
        return 0, bal

    pts = compute_earn_points(order.subtotal_cents)

    # Atomic increment to avoid races
    Customer.objects.filter(pk=order.customer_id).update(points_balance=F('points_balance') + pts)

    # Refresh balance from DB
    new_balance = Customer.objects.only('points_balance').get(pk=order.customer_id).points_balance

    # Mark order so we don't double-award
    order.points_earned = pts
    order.save(update_fields=['points_earned'])

    return pts, new_balance