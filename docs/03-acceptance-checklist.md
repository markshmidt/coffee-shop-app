
## Scope & roles

 [  ] Order created only at Pay; cart is session-based.

 [  ] Guest orders have no customer link.

 [  ] One manual discount + one redemption max per order.

 [  ] Refunds are manager-only (reason + reference).

## Cart

 [  ] Add/remove/qty; attach phone; apply discount; preview redemption value; discard clears cart.

## Pay → Order

 [  ] Pay creates one Order and one PaymentRecord; double-click safe.

 [  ] For cash, amount = order.total + rounding_cents where rounding_cents ∈ {−2..+2}.

 [  ] Order lines snapshot names & prices.

 [  ] If customer attached: points_earned and redeemed_points stored; points_balance updated.

## Post-payment

 [  ] Complete hides from Active.

 [  ] Refund flips status, adds negative payment, adjusts points correctly.

## Discounts & Loyalty

 [  ] Manual discount is pre-tax and separate from loyalty value.

 [  ] Redemption respects price cap; no points on redeemed portion.

## Reporting

 [  ] Math holds: subtotal − manual_discount − loyalty_value + tax + tip = total.

 [  ] Tips reported separately (not sales).

 [  ] Cash rounding reported from payments; day reconciliation works.

[  ]  CSV matches UI.

## Data & ops

 [  ] All money ints; phone E.164 string.

 [  ] MenuItem used on orders cannot be deleted (use active=false).

 [  ] Nightly backup & restore tested.