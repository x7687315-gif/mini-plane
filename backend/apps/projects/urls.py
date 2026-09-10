"""Project 接口子路由：挂在 /api/v1/workspaces/<slug>/projects/ 之下。

Issue / Label 子路由由 apps.issues 提供（同属项目作用域，04 契约）。
"""

from django.urls import path

from apps.issues import views as issue_views
from apps.projects import views

urlpatterns = [
    path("", views.project_list_create),
    path("<uuid:project_id>/", views.project_detail),
    path("<uuid:project_id>/members/", views.project_member_list_create),
    path("<uuid:project_id>/members/<uuid:member_id>/", views.project_member_detail),
    path("<uuid:project_id>/states/", views.state_list),
    # ── Issue（Sprint 3）──────────────────────────────────────────
    path("<uuid:project_id>/issues/", issue_views.issue_list_create),
    path("<uuid:project_id>/issues/<uuid:issue_id>/", issue_views.issue_detail),
    # ── Label（Sprint 3）─────────────────────────────────────────
    path("<uuid:project_id>/labels/", issue_views.label_list_create),
    path("<uuid:project_id>/labels/<uuid:label_id>/", issue_views.label_detail),
]
