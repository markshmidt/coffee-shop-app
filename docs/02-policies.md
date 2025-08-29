## Money & tax

- Currency CAD; all amounts are integer cents (int).

- HST 13% (configurable); computed after manual discount, before tip.

- Rounding: for cash payments only, round tender to nearest $0.05 using PaymentRecord.rounding_cents ∈ {−2, −1, 0, +1, +2}. Order totals are not rounded.

- Tips are stored on the order but not counted as sales (reported separately).

- Totals formula (order):
total = subtotal − manual_discount − loyalty_redemption + tax + tip

## Lifecycle & permissions

- Pre-payment state is an ephemeral cart (session). No DB rows until Pay.

- States: PAID → (optional) COMPLETED → (maybe) REFUNDED.

- Refund requires Manager, reference & reason; creates a negative payment and adjusts points.

## Discounts

- Exactly one manual discount per order: STUDENT_10 or FRIENDS_FAMILY_20 (pre-tax).

- Manual discount may stack with one loyalty redemption.

## Loyalty

- Enroll by phone (E164. str, unique). First and Last name optional.

- Earn: points_earned = floor(pre-tax subtotal after manual discount and excluding redeemed drink).

- Redeem: 80 pts = 1 drink up to a price cap (configurable; customer pays difference).

- One redemption per order; no points on the free portion.

- Storage: Customer.points_balance; per-order store points_earned, redeemed_points (0|80), loyalty_redemption_cents.

## Guest policy

- Guest = no Customer link. Loyalty actions require a customer.

- Optional late-attach window (e.g., 30 min) to award points once.

## Cart policy

- Cart lives in session; barista can discard anytime; session clears on Pay/Discard/logout.

- All totals computed server-side from session.