from django.core.exceptions import ValidationError
from django.db import models
from django.conf import settings
from django.db.models import Q


# Create your models here.

class Customer(models.Model):
    id = models.AutoField(primary_key=True)
    fname = models.CharField(max_length=100, blank=True)
    lname = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, unique=True) # E.164 like "+1416..."
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
    # image = models.ImageField(upload_to='images/category/', blank=True, null=True)

    # self-referencing FK
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcategories"
    )

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return f"{self.parent} → {self.name}" if self.parent else self.name
    def rename(self, new_name):
        self.name = new_name
    def reorder(self):
        self.position += 1

class MenuItem(models.Model):
    # For modifiers filtering
    FOOD = "FOOD"
    DRINK = "DRINK"
    KIND_CHOICES = [(FOOD, "Food"), (DRINK, "Drink")]
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=DRINK)

    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=120)
    price_cents = models.IntegerField()
    active = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["category__position", "position", "name"]
        constraints = [
            models.UniqueConstraint(fields=["category", "name"], name="uniq_item_per_category"),
        ]

    def __str__(self):
        return self.name

    def applicable_modifier_groups(self):
        # Use the item's kind (FOOD/DRINK)
        kind = self.kind

        return (
            ModifierGroup.objects
            .filter(
                # group must apply to BOTH or to this item's kind
                Q(applies_to="BOTH") | Q(applies_to=kind)
            )
            .filter(
                # and it must be either:
                # - explicitly linked to this item, OR
                # - linked to this item's category, OR
                # - completely untargeted (no item/category links at all)
                Q(items=self)
                | Q(categories=self.category)
                | (Q(items__isnull=True) & Q(categories__isnull=True))
            )
            .distinct()
            .order_by("position", "name")
        )


class Variant(models.Model):
    """
    A purchasable size for a DRINK menu item (e.g., 8oz/12oz/16oz) with its own base price.
    Food items have no variants.
    """
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=40)                                  # e.g., "12oz"
    price_cents = models.IntegerField()
    position = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["menu_item", "position", "name"]
        constraints = [
            models.UniqueConstraint(fields=["menu_item", "name"], name="uniq_variant_per_item"),
        ]

    def __str__(self):
        return f"{self.menu_item.name} – {self.name}"


class ModifierGroup(models.Model):
    SINGLE = "SINGLE"
    MULTI = "MULTI"
    SELECTION_CHOICES = [(SINGLE, "Single"), (MULTI, "Multi")]

    name = models.CharField(max_length=80)                                  # e.g., "Milk", "Syrups"
    selection_type = models.CharField(max_length=10, choices=SELECTION_CHOICES, default=SINGLE)
    min_select = models.PositiveIntegerField(default=0)
    max_select = models.PositiveIntegerField(default=1)
    position = models.PositiveIntegerField(default=0)

    applies_to = models.CharField(
        max_length=10,
        choices=[("FOOD", "Food"), ("DRINK", "Drink"), ("BOTH", "Both")],
        default="BOTH",
    )
    categories = models.ManyToManyField("Category", blank=True, related_name="modifier_groups")
    items = models.ManyToManyField("MenuItem", blank=True, related_name="direct_modifier_groups")

    class Meta:
        ordering = ["position", "name"]
        verbose_name = "Modifier group"

    def __str__(self):
        return self.name


class ModifierOption(models.Model):
    group = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=80)                                  # e.g., "Oat", "Vanilla"
    price_cents = models.IntegerField(default=0)
    position = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)                         # for required SINGLE groups

    class Meta:
        ordering = ["group__position", "group__name", "position", "name"]
        constraints = [
            models.UniqueConstraint(fields=["group", "name"], name="uniq_option_per_group"),
        ]

    def __str__(self):
        return f"{self.group.name}: {self.name}"


class ItemModifierGroup(models.Model):
    """
    Attaches a ModifierGroup to a specific drink MenuItem.
    """
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="modifier_groups")
    group = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name="attached_items")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["menu_item", "position"]
        constraints = [
            models.UniqueConstraint(fields=["menu_item", "group"], name="uniq_group_per_item"),
        ]

    def __str__(self):
        return f"{self.menu_item.name} ↔ {self.group.name}"


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
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders")
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
    register_id = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["paid_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["created_by"]),
            models.Index(fields=["customer"]),
        ]
        ordering = ["-paid_at", "-id"]

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
    variant_name_snapshot = models.CharField(max_length=40, blank=True)  # e.g., "12oz" or blank for food
    base_unit_price_cents = models.IntegerField(default=0)
    unit_price_cents = models.IntegerField()
    qty = models.PositiveIntegerField()

    class Meta:
        indexes = [models.Index(fields=["order"])]

    def __str__(self):
        label = self.name_snapshot
        if self.variant_name_snapshot:
            label += f" {self.variant_name_snapshot}"
        return label

class OrderItemModifier(models.Model):
    """
    Snapshot of a chosen modifier option for an OrderItem.
    One row per selected option. Deltas are per-unit (multiply by qty when totaling).
    """
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="modifiers")
    group_name_snapshot = models.CharField(max_length=80)                    # e.g., "Milk"
    option_name_snapshot = models.CharField(max_length=80)                   # e.g., "Oat"
    price_delta_cents_snapshot = models.IntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["order_item"])]

    def __str__(self):
        sign = "+" if self.price_delta_cents_snapshot >= 0 else "-"
        cents = abs(self.price_delta_cents_snapshot)
        return f"{self.group_name_snapshot}: {self.option_name_snapshot} ({sign}{cents}¢)"


class PaymentRecord(models.Model):
    id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payments")
    method = models.CharField(max_length=8, choices=[("CASH", "Cash"), ("CARD", "Card"), ("COMP", "Comp")])
    amount_cents = models.IntegerField()
    rounding_cents = models.IntegerField(default=0)  # CASH only: −2..+2; 0 for CARD/COMP
    reference = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.id}"

    @property
    def is_refund(self) -> bool:
        return self.amount_cents < 0


