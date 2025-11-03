from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import ExpressionWrapper, F, Value, DecimalField
from django.shortcuts import render

from ..models import Order, MenuItem, Category, Variant, ModifierGroup


# ----- POS home page -------

@login_required
def home(request):
    new_order_count = Order.objects.count() + 1 #used in <h4> ORDER {{new_order_count}}</h4>
    price_expr = ExpressionWrapper(
        F("price_cents") * Value(Decimal("0.01")),
        output_field=DecimalField(max_digits=8, decimal_places=2),
    )

    items = ( #used in cart
        MenuItem.objects
        .annotate(price=price_expr)
        .order_by("price")
        .select_related("category")
        .prefetch_related("direct_modifier_groups", "category__modifier_groups")
    )

    parent_categories = Category.objects.filter(parent__isnull=True).order_by("position", "name")
    categories = Category.objects.values("id", "name", "parent_id").order_by("position", "name")

    variants = Variant.objects.filter(active=True).annotate(price=price_expr).values("id", "name", "price", "price_cents", "menu_item_id").order_by("price", "name" )

    modifier_groups = ModifierGroup.objects.all().order_by("name")
    return render(
        request,
        "home.html",
        {
            "parent_categories": parent_categories,
            "items": items,
            "categories": list(categories),
            "variants": variants,
            "modifier_groups": modifier_groups,
            "new_order_count": new_order_count,
        }
    )
