"""users 模块路由：全部挂载在 /api/v1/auth/ 之下（见 config/urls.py）。"""

from django.urls import path

from apps.users import views

urlpatterns = [
    path("csrf/", views.csrf_cookie, name="auth-csrf"),
    path("register/", views.register, name="auth-register"),
    path("login/", views.login_view, name="auth-login"),
    path("logout/", views.logout_view, name="auth-logout"),
    path("me/", views.me, name="auth-me"),
]
