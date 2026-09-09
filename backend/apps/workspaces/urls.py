"""Workspace 接口路由（挂载在 /api/v1/ 下；项目子路由见 apps/projects/urls.py）。"""

from django.urls import include, path

from apps.workspaces import views

urlpatterns = [
    path("workspaces/", views.workspace_list_create),
    path("workspaces/<slug:workspace_slug>/", views.workspace_detail),
    path("workspaces/<slug:workspace_slug>/members/", views.member_list_create),
    path("workspaces/<slug:workspace_slug>/members/<uuid:member_id>/", views.member_detail),
    path("workspaces/<slug:workspace_slug>/projects/", include("apps.projects.urls")),
]
