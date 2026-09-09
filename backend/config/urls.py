"""项目根路由。

约定（见 BACKEND_PLAN.md §2.2）：
- 所有业务 API 以 /api/v1/ 开头；
- config/urls.py 只负责挂接各模块路由，不放业务逻辑；
- /api/schema/ 与 /api/docs/ 是前后端联调的契约入口（drf-spectacular）。
"""

from django.contrib import admin
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core import views as core_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", core_views.health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
