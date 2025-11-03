from django.contrib.auth.decorators import login_required
from django.http import JsonResponse

@login_required
def debug_cart(request):
    cart = request.session.get("cart")
    return JsonResponse({"cart": cart}, json_dumps_params={"indent": 2})