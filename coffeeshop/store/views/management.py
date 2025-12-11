from django.shortcuts import render
from ..permissions import compute_order_permissions  # your function
from ..utils.decorators import manager_required


@manager_required
def management_dashboard(request):
    perms = compute_order_permissions(request.user)
    return render(request, "dashboard.html", {"perms": perms})


def customers_manage(request):
    perms = compute_order_permissions(request.user)
    return render(request, "customers.html", {"perms": perms})

def add_customer(request):
    if request.method == "POST":
        pass
def manage_staff(request):
    pass
def add_staff(request):
    pass
def manage_order(request):
    pass
def edit_customer(request):
    pass
def edit_staff(request):
    pass


def manage_menu(request):
    return render(request, "management/placeholder.html", {"title": "Menu Management"})

def manage_modifiers(request):
    return render(request, "management/placeholder.html", {"title": "Modifier Management"})

def sales_reports(request):
    return render(request, "management/placeholder.html", {"title": "Sales Reports"})
