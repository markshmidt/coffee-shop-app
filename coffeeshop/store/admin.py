from django.contrib import admin
from .models import Customer, OrderItem, Order, MenuItem, Category, Variant, ModifierGroup, \
    ModifierOption, ItemModifierGroup, OrderItemModifier

# Register your models here.
admin.site.register(Customer)
admin.site.register(OrderItem)
admin.site.register(Order)
admin.site.register(MenuItem)
admin.site.register(Category)
# admin.site.register(PaymentRecord)
admin.site.register(Variant)
admin.site.register(ModifierGroup)
admin.site.register(ModifierOption)
admin.site.register(ItemModifierGroup)
admin.site.register(OrderItemModifier)