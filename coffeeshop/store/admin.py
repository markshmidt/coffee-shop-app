from _ast import Store

from django.contrib import admin
from .models import Customer, OrderItem, Order, MenuItem, Category, PaymentRecord

# Register your models here.
admin.site.register(Customer)
admin.site.register(OrderItem)
admin.site.register(Order)
admin.site.register(MenuItem)
admin.site.register(Category)
admin.site.register(PaymentRecord)
