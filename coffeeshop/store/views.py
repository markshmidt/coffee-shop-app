from decimal import Decimal

from django.db.models import Prefetch, ExpressionWrapper, DecimalField, F, Value
from django.shortcuts import render

from .models import Category, MenuItem, Variant, ModifierGroup


# Create your views here.
def home(request):

    price_expr = ExpressionWrapper(
        F("price_cents") / Value(Decimal("100")),  # integer division by 100
        output_field=DecimalField(max_digits=8, decimal_places=2),
    )

    items = (
        MenuItem.objects
        .annotate(price=price_expr)
        .order_by("name")
        .select_related("category")
        .prefetch_related(
            "direct_modifier_groups__options",
            "category__modifier_groups__options",)
    )

    parents = Category.objects.filter(parent__isnull=True).order_by("position", "name")
    cats = Category.objects.values("id", "name", "parent_id").order_by("position", "name")

    variants = Variant.objects.filter(active=True).annotate(price=price_expr).values("id", "name", "price", "menu_item_id").order_by("price_cents", "name" )

    modifier_groups = ModifierGroup.objects.all()
    return render(
        request,
        "home.html",
        {
            "parents": parents,
            "items": items,
            "cats": list(cats),
            "variants": variants,
            "modifier_groups": modifier_groups,
        }
    )

def api_add_line(request):
    pass
def api_pay(request):
    pass