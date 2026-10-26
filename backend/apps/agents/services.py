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


@transaction.atomic
def update_progress(
    session: AgentSession,
    *,
    current_step: str | None = None,
    step_index: int | None = None,
    step_total: int | None = None,
    method_summary: str | None = None,
) -> AgentSession:
    """Agent 上报当前执行进度（Island V2 阶段 3 · 规格 §6.2）。

    - **只允许更新运行中的会话**：已结束的会话补写会让"运行时长/步骤"与事实矛盾，
      调用方（视图）负责先拒绝，这里再兜一次底；
    - 广播走既有的 `agent.session` 事件：桌面 Island 已经在听这个通道，
      不必为新字段再开一条（规格 §5.1：复用优先）；
    - `defer_agent_session` 是"事务提交后"才发的（见 realtime/broadcast.py），
      所以这里与写库同事务，失败一起回滚 —— 与项目既有约定一致。
    """
    if session.status != AgentSessionStatus.RUNNING:
        raise ValueError("会话已结束，不能更新执行进度")

    fields: list[str] = []
    if current_step is not None:
        session.current_step = current_step
        fields.append("current_step")
    if step_index is not None:
        session.step_index = step_index
        fields.append("step_index")
    if step_total is not None:
        session.step_total = step_total
        fields.append("step_total")
    if method_summary is not None:
        session.method_summary = method_summary
        fields.append("method_summary")
    if not fields:
        return session

    fields.append("updated_at")
    session.save(update_fields=fields)
    rt.defer_agent_session(project_id=session.project_id, session=session)
    return session
