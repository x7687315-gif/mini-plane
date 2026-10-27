"""项目根路由。

约定（见 BACKEND_PLAN.md §2.2）：
- 所有业务 API 以 /api/v1/ 开头；
- config/urls.py 只负责挂接各模块路由，不放业务逻辑；
- /api/schema/ 与 /api/docs/ 是前后端联调的契约入口（drf-spectacular）。
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core import views as core_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", core_views.health, name="health"),
    path("api/v1/auth/", include("apps.users.urls")),
    # 「我的工作」聚合：对外统一 Task 命名（/tasks/mine/ 为规范入口）
    path("api/v1/tasks/", include("apps.issues.urls")),
    # 旧挂载位保留为 deprecated 适配器，前端已不再调用（Phase 9 退出清单）
    path("api/v1/issues/", include("apps.issues.urls")),
    # 工程规范路由（Phase 3：/projects/ 列表/创建 + /projects/{pid}/… 全部子资源 + mine/）
    path("api/v1/projects/", include("apps.projects.urls_canonical")),
    path("api/v1/agent/", include("apps.agents.urls")),
    # 兼容路由：/workspaces/{slug}/projects/{pid}/…（deprecated，委托同一视图实现）
    path("api/v1/", include("apps.workspaces.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
