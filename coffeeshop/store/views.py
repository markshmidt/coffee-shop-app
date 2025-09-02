from decimal import Decimal

from django.db.models import Prefetch, ExpressionWrapper, DecimalField, F, Value
from django.shortcuts import render

from .models import Category, MenuItem, Variant


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
        .values("id", "name", "category_id", "price")
    )

    parents = Category.objects.filter(parent__isnull=True).order_by("position", "name")
    cats = Category.objects.values("id", "name", "parent_id").order_by("position", "name")

    variants = Variant.objects.filter(active=True).annotate(price=price_expr).values("id", "name", "price", "menu_item_id").order_by("price_cents", "name" )

    return render(
        request,
        "home.html",
        {
            "parents": parents,
            "items": list(items),
            "cats": list(cats),
            "variants": variants,
        }
    )

def api_add_line(request):
    pass
def api_pay(request):
    pass