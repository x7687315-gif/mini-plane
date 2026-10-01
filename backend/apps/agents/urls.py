"""Agent 集成层路由：挂在 /api/v1/agent/ 之下（Sprint 12）。

Token 管理走用户会话；动作端点走 Agent Token（Bearer mpa_…）。
"""

from django.urls import path

from apps.agents import views

urlpatterns = [
    # Token 管理（用户会话）
    path("tokens/", views.agent_token_list_create, name="agent-token-list"),
    path("tokens/<uuid:token_id>/revoke/", views.agent_token_revoke, name="agent-token-revoke"),
    # 工程动作（Agent Token）
    path(
        "projects/<slug:workspace_slug>/<uuid:project_id>/",
        views.agent_project_get,
        name="agent-project-get",
    ),
    path(
        "projects/<slug:workspace_slug>/<uuid:project_id>/progress/",
        views.agent_progress_update,
        name="agent-progress-update",
    ),
    path("tasks/", views.agent_task_create, name="agent-task-create"),
    path("tasks/<uuid:issue_id>/start/", views.agent_task_start, name="agent-task-start"),
    path("tasks/<uuid:issue_id>/complete/", views.agent_task_complete, name="agent-task-complete"),
    path("worklogs/", views.agent_worklog_create, name="agent-worklog-create"),
]
