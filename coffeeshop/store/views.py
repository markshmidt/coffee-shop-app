from django.shortcuts import render

from .models import Category


# Create your views here.
def home(request):
    categories = Category.objects.prefetch_related("items").all()
    return render(request, 'home.html', {"categories": categories})

def api_add_line(request):
    pass
def api_pay(request):
    pass