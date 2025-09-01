from django.shortcuts import render

from .models import Category, MenuItem


# Create your views here.
def home(request):
    parents = (Category.objects
               .filter(parent__isnull=True)  # only top-level
               # .prefetch_related("subcategories")
               .order_by("name")
               )
    items = MenuItem.objects.all()
    return render(request, "home.html", {"categories": parents, "items": items}, )

def api_add_line(request):
    pass
def api_pay(request):
    pass