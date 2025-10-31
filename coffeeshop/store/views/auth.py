# ==== LOGIN VIEWS =====
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render


def login_user(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, "You are now logged in.")
            return redirect("/")
        else:
            messages.error(request, "Invalid username or password. Try again")
    return render(request, "login.html")


def logout_user(request):
    logout(request)
    messages.success(request, "You have been logged out.")
    return redirect('login')