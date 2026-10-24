"""Agent 集成层路由：挂在 /api/v1/agent/ 之下（Sprint 12）。

Token 管理走用户会话；动作端点走 Agent Token（Bearer mpa_…）。
Phase 3：工程动作提供**规范路由**（只凭 Project ID，私人工程可访问）与
**兼容路由**（含 workspace slug，deprecated）两种形态，委托同一视图实现。
"""

from django.urls import path

from apps.agents import views

urlpatterns = [
    # Token 管理（用户会话）
    path("tokens/", views.agent_token_list_create, name="agent-token-list"),
    path("tokens/<uuid:token_id>/revoke/", views.agent_token_revoke, name="agent-token-revoke"),
    # 工程动作（Agent Token）——规范路由（Phase 3）
    path(
        "projects/<uuid:project_id>/",
        views.agent_project_get_canonical,
        name="agent-project-get-canonical",
    ),
    path(
        "projects/<uuid:project_id>/progress/",
        views.agent_progress_update_canonical,
        name="agent-progress-update-canonical",
    ),
    path(
        "projects/<uuid:project_id>/sessions/",
        views.agent_session_list_canonical,
        name="agent-session-list-canonical",
    ),
    # 工程动作——兼容路由（含 workspace slug，deprecated）
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
    # Sprint 13：Agent Session
    path(
        "projects/<slug:workspace_slug>/<uuid:project_id>/sessions/",
        views.agent_session_list,
        name="agent-session-list",
    ),
    path("sessions/", views.agent_session_start, name="agent-session-start"),
    path("sessions/<uuid:session_id>/end/", views.agent_session_end, name="agent-session-end"),
    # Island V2 阶段 3：Agent 上报当前步骤与执行方法（规格 §6.2）
    path(
        "sessions/<uuid:session_id>/progress/",
        views.agent_session_progress,
        name="agent-session-progress",
    ),
]
