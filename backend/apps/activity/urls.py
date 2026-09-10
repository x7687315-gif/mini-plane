"""活动流路由（挂载在 /api/v1/workspaces/<slug>/projects/<pid>/ 之下）。

全部路径都带项目作用域，权限判定走 core.permissions.resolve_project。
"""

from django.urls import path

from apps.activity import views

urlpatterns = [
    # 跨 Issue 的项目级活动流
    path("<uuid:project_id>/activities/", views.project_activity_list),
    # 单个 Issue 的时间线
    path("<uuid:project_id>/issues/<uuid:issue_id>/activities/", views.issue_activity_list),
]
