"""任务状态路由（挂载在 /api/v1/workspaces/<slug>/projects/<pid>/ 之下）。"""

from django.urls import path

from apps.jobs import views

urlpatterns = [
    path("<uuid:project_id>/tasks/<uuid:task_id>/", views.task_run_detail),
]
