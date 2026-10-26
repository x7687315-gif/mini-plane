"""Project 规范路由（Phase 3 契约统一，ADR-001）。

挂在 `/api/v1/projects/` 之下——**个人优先**：所有工程子资源只凭 Project ID 定位，
不要求 workspace slug；私人工程与团队工程走同一套端点与授权（owner 短路 + 团队角色）。

与兼容路由（`apps/workspaces.urls → apps.projects.urls` 的 `/workspaces/{ws}/…`）的
关系：两种路由委托**同一视图实现**（views 里的 `_impl` 函数），兼容层薄、可测、可退役。
"""

from django.urls import path

from apps.activity import views as activity_views
from apps.issues import views as issue_views
from apps.jobs import views as job_views
from apps.projects import views
from apps.worklogs import views as worklog_views

urlpatterns = [
    # 列表 / 创建（GET 默认 scope=owned；POST 默认私人工程，workspace_id 可选）
    path("", views.project_list_create_canonical, name="project-list-canonical"),
    # 「我的工程」首页聚合（既有端点，保持原位）
    path("mine/", views.my_projects_summary, name="projects-mine"),
    # 详情 / 修改 / 删除
    path("<uuid:project_id>/", views.project_detail_canonical, name="project-detail-canonical"),
    # 项目成员（团队工程管理；私人工程返回 owner 隐式成员，供指派使用）
    path(
        "<uuid:project_id>/members/",
        views.project_member_list_create_canonical,
        name="project-members-canonical",
    ),
    path(
        "<uuid:project_id>/members/<uuid:member_id>/",
        views.project_member_detail_canonical,
        name="project-member-detail-canonical",
    ),
    # 预置五态（只读）
    path("<uuid:project_id>/states/", views.state_list_canonical, name="state-list-canonical"),
    # Global Plan / Stage
    path("<uuid:project_id>/plan/", views.plan_detail_canonical, name="plan-detail-canonical"),
    path(
        "<uuid:project_id>/plan/stages/<uuid:stage_id>/",
        views.stage_detail_canonical,
        name="stage-detail-canonical",
    ),
    # Task（对外统一命名；历史模型 Issue）
    path("<uuid:project_id>/tasks/", issue_views.task_list_create, name="task-list-canonical"),
    path(
        "<uuid:project_id>/tasks/<uuid:task_id>/",
        issue_views.task_detail,
        name="task-detail-canonical",
    ),
    path(
        "<uuid:project_id>/tasks/bulk/labels/",
        issue_views.task_bulk_labels,
        name="task-bulk-labels-canonical",
    ),
    # Label
    path(
        "<uuid:project_id>/labels/",
        issue_views.label_list_create_canonical,
        name="label-list-canonical",
    ),
    path(
        "<uuid:project_id>/labels/<uuid:label_id>/",
        issue_views.label_detail_canonical,
        name="label-detail-canonical",
    ),
    # Comment（Task 下的对话）
    path(
        "<uuid:project_id>/tasks/<uuid:task_id>/comments/",
        issue_views.comment_list_create_canonical,
        name="comment-list-canonical",
    ),
    path(
        "<uuid:project_id>/tasks/<uuid:task_id>/comments/<uuid:comment_id>/",
        issue_views.comment_detail_canonical,
        name="comment-detail-canonical",
    ),
    # 活动流
    path(
        "<uuid:project_id>/activities/",
        activity_views.project_activity_list_canonical,
        name="project-activities-canonical",
    ),
    path(
        "<uuid:project_id>/tasks/<uuid:task_id>/activities/",
        activity_views.task_activity_list_canonical,
        name="task-activities-canonical",
    ),
    # 工程日志
    path(
        "<uuid:project_id>/worklogs/",
        worklog_views.worklog_list_create_canonical,
        name="worklog-list-canonical",
    ),
    path(
        "<uuid:project_id>/worklogs/<uuid:worklog_id>/",
        worklog_views.worklog_detail_canonical,
        name="worklog-detail-canonical",
    ),
    # 后台异步操作（JobRun；历史名 TaskRun）
    path(
        "<uuid:project_id>/jobruns/<uuid:jobrun_id>/",
        job_views.jobrun_detail,
        name="jobrun-detail-canonical",
    ),
]
