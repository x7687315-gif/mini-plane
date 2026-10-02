"""Agent 会话业务逻辑（Sprint 13）。

开始/结束会话都通过 realtime.broadcast.defer_agent_session 推送 `agent.session`，
复用现有 WebSocket 通道（§14：Agent 改工程状态 → 桌面实时看到）。
"""

from django.db import transaction
from django.utils import timezone

from apps.agents.models import AgentSession, AgentSessionStatus
from apps.realtime import broadcast as rt


@transaction.atomic
def start_session(*, project, token, title: str, task=None) -> AgentSession:
    session = AgentSession.objects.create(
        project=project,
        token=token,
        task=task,
        title=title,
        status=AgentSessionStatus.RUNNING,
    )
    rt.defer_agent_session(project_id=project.id, session=session)
    return session


@transaction.atomic
def end_session(
    session: AgentSession, *, status: str = AgentSessionStatus.DONE, note: str = ""
) -> AgentSession:
    session.status = status
    session.ended_at = timezone.now()
    if note:
        session.note = note
    session.save(update_fields=["status", "ended_at", "note", "updated_at"])
    rt.defer_agent_session(project_id=session.project_id, session=session)
    return session
