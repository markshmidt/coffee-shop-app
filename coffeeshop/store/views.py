from django.db.models import Prefetch, ExpressionWrapper, DecimalField, F, Value
from django.shortcuts import render

from .models import Category, MenuItem


# Create your views here.
def home(request):

    price_expr = ExpressionWrapper(
        F("price_cents") / Value(100),  # integer division by 100
        output_field=DecimalField(max_digits=8, decimal_places=2),
    )

    items = (
        MenuItem.objects
        .annotate(price=price_expr)
        .only("name", "category_id")  # keep load light
        .order_by("name")
        .values("id", "name", "category_id", "price")
    )

    parents = Category.objects.filter(parent__isnull=True).order_by("position", "name")
    cats = Category.objects.values("id", "name", "parent_id").order_by("position", "name")

    return render(
        request,
        "home.html",
        {
            "parents": parents,
            "items": list(items),
            "cats": list(cats),
        }
    )

def api_add_line(request):
    pass
def api_pay(request):
    pass