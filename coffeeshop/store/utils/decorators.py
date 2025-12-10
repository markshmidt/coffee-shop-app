from django.http import HttpResponseForbidden
from django.contrib.auth.decorators import login_required
from ..permissions import is_manager   # your helper

def manager_required(view_func):
    @login_required
    def _wrapped(request, *args, **kwargs):
        if not is_manager(request.user):
            return HttpResponseForbidden("You do not have permission to access this page.")
        return view_func(request, *args, **kwargs)
    return _wrapped
