"""Project 接口子路由：挂在 /api/v1/workspaces/<slug>/projects/ 之下。

- Issue / Label / Comment 子路由由 apps.issues 提供（同属项目作用域，04/05 契约）；
- 活动流子路由由 apps.activity 提供（06 契约）。
"""

from django.urls import include, path

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
    # ── Comment（Sprint 4）──────────────────────────────────────
    path("<uuid:project_id>/issues/<uuid:issue_id>/comments/", issue_views.comment_list_create),
    path(
        "<uuid:project_id>/issues/<uuid:issue_id>/comments/<uuid:comment_id>/",
        issue_views.comment_detail,
    ),
    # ── 批量操作（Sprint 6）：异步任务，返回 202 + task_id ────────
    path("<uuid:project_id>/issues/bulk/labels/", issue_views.issue_bulk_labels),
    # ── Activity（Sprint 4）：项目级活动流 + Issue 时间线 ──────────
    path("", include("apps.activity.urls")),
    # ── 任务状态（Sprint 6）──────────────────────────────────────
    path("", include("apps.jobs.urls")),
]
