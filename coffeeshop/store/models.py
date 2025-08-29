from django.core.exceptions import ValidationError
from django.db import models
from django.conf import settings

# Create your models here.

class Customer(models.Model):
    id = models.AutoField(primary_key=True)
    fname = models.CharField(max_length=100, blank=True)
    lname = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=100, unique=True) # E.164 like "+1416..."
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    points_balance = models.IntegerField(default=0)

    def __str__(self):
        return self.fname or self.phone

    def can_redeem(self) -> bool:
        return self.points_balance >= 80

# class User(models.Model):
#     first_name = models.CharField(max_length=100)
#     last_name = models.CharField(max_length=100)

class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    position = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.name
    def rename(self, new_name):
        self.name = new_name
    def reorder(self):
        self.position += 1

class MenuItem(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=120)
    price_cents = models.IntegerField()
    active = models.BooleanField(default=True)
    description = models.TextField(blank=True)


class Order(models.Model):
    STATUS_PAID = "PAID"
    STATUS_COMPLETED = "COMPLETED"
    STATUS_REFUNDED = "REFUNDED"
    STATUS_CHOICES = [
        (STATUS_PAID, "Paid"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_REFUNDED, "Refunded"),
    ]

    status = models.CharField(max_length=10,
                              choices=STATUS_CHOICES,
                              default=STATUS_PAID)

    # id = models.AutoField(primary_key=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")

    #money
    subtotal_cents = models.IntegerField()
    manual_discount_type = models.CharField(
        max_length=32,
        choices=[("NONE", "None"), ("STUDENT_10", "Student -10%"), ("FRIENDS_FAMILY_20", "Friends/Family -20%")],
        default="NONE",
    )
    manual_discount_cents = models.IntegerField(default=0)
    loyalty_redemption_cents = models.IntegerField(default=0)
    tax_cents = models.IntegerField()
    tip_cents = models.IntegerField(default=0)
    total_cents = models.IntegerField()

    # loyalty
    points_earned = models.IntegerField(default=0)
    redeemed_points = models.IntegerField(default=0)  # 0 or 80

    # ops / receipts
    paid_at = models.DateTimeField()
    receipt_number = models.IntegerField()
    payment_method = models.CharField(
        max_length=8, choices=[("CASH", "Cash"), ("CARD", "Card"), ("COMP", "Comp")]
    )
    refund_reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def mark_completed(self):
        if self.status == self.STATUS_PAID:
            self.status = self.STATUS_COMPLETED
            self.save(update_fields=["status"])

    def mark_refunded(self, reason: str):
        if self.status in (self.STATUS_PAID, self.STATUS_COMPLETED):
            self.status = self.STATUS_REFUNDED
            self.save(update_fields=["status"])

    def validate_totals(self):
        expected = (self.subtotal_cents
                    - self.manual_discount_cents
                    - self.loyalty_redemption_cents
                    + self.tax_cents
                    + self.tip_cents)
        if expected != self.total_cents:
            raise ValidationError("Order totals invariant failed.")

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT, related_name="order_lines")
    name_snapshot = models.CharField(max_length=120)
    unit_price_cents = models.IntegerField()
    qty = models.PositiveIntegerField()

class PaymentRecord(models.Model):
    id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=8, choices=[("CASH", "Cash"), ("CARD", "Card"), ("COMP", "Comp")])
    amount_cents = models.IntegerField()
    rounding_cents = models.IntegerField(default=0)  # CASH only: −2..+2; 0 for CARD/COMP
    reference = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.id}"

    @property
    def is_refund(self) -> bool:
        return self.amount_cents < 0


