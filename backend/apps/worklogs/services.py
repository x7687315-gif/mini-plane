"""Worklog 唯一写入口（Phase 7）：用户 API 与 Agent API 共用。

规则：
- 只有作者或项目 Admin 可以修改/删除他人日志；
- 创建/修改/删除都写 Activity 并广播 `worklog.*`（事务提交后）；
- stage 必须属于同一工程（跨项目 404 防枚举）。
"""

from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.activity import services as activity_services
from apps.activity.models import Actions as ActivityActions
from apps.projects.models import ProjectRoles, ProjectStage
from apps.realtime import broadcast as realtime
from apps.worklogs.models import Worklog, WorklogSource


def _resolve_stage(project, stage_id):
    if stage_id is None:
        return None
    stage = ProjectStage.objects.filter(id=stage_id, plan__project=project).first()
    if stage is None:
        raise Http404
    return stage


def worklog_snapshot(worklog: Worklog) -> dict:
    """可直接展示的日志快照（不含 UUID）。"""
    return {
        "title": worklog.title,
        "date": worklog.date.isoformat(),
        "stage": worklog.stage.name if worklog.stage_id else None,
        "source": worklog.source,
    }


def worklog_event_payload(worklog: Worklog, *, action: str) -> dict:
    return {
        "worklog_id": str(worklog.id),
        "title": worklog.title,
        "date": worklog.date.isoformat(),
        "source": worklog.source,
        "author": {"id": str(worklog.author_id), "username": worklog.author.username},
        "action": action,
    }


def _require_mutation_permission(worklog: Worklog, actor, role: int) -> None:
    if actor.id != worklog.author_id and role < ProjectRoles.ADMIN:
        raise PermissionDenied("只有日志作者或项目管理员可以修改/删除该日志。")


def create_worklog(
    project,
    actor,
    *,
    title: str,
    summary: str,
    details: str = "",
    conclusion: str = "",
    next_step: str = "",
    blocker: str = "",
    stage_id=None,
    date=None,
    source: str = WorklogSource.MANUAL,
) -> Worklog:
    title = (title or "").strip()
    summary = (summary or "").strip()
    if not title:
        raise ValidationError({"title": ["该字段是必填项。"]})
    if not summary:
        raise ValidationError({"summary": ["该字段是必填项。"]})
    stage = _resolve_stage(project, stage_id)
    worklog = Worklog.objects.create(
        project=project,
        author=actor,
        stage=stage,
        date=date or timezone.localdate(),
        title=title,
        summary=summary,
        details=details or "",
        conclusion=conclusion or "",
        next_step=next_step or "",
        blocker=blocker or "",
        source=source,
    )
    activity_services.record_worklog_event(
        worklog,
        actor=actor,
        action=ActivityActions.CREATED,
        new_value=worklog_snapshot(worklog),
    )
    realtime.defer_worklog_changed(
        project_id=project.id,
        event=realtime.EVENT_WORKLOG_CREATED,
        payload=worklog_event_payload(worklog, action=ActivityActions.CREATED),
    )
    return worklog


def update_worklog(worklog: Worklog, *, actor, role: int, **fields) -> Worklog:
    _require_mutation_permission(worklog, actor, role)
    before = worklog_snapshot(worklog)

    if "stage_id" in fields:
        worklog.stage = _resolve_stage(worklog.project, fields.pop("stage_id"))
    for field in (
        "title",
        "summary",
        "details",
        "conclusion",
        "next_step",
        "blocker",
        "source",
    ):
        if field in fields:
            value = fields.pop(field)
            if field in ("title", "summary") and not (value or "").strip():
                raise ValidationError({field: ["该字段是必填项。"]})
            setattr(worklog, field, value.strip() if field in ("title", "summary") else value)
    if fields.get("date"):
        worklog.date = fields["date"]
    worklog.save()

    after = worklog_snapshot(worklog)
    old_value = {k: before[k] for k in before if before[k] != after[k]}
    new_value = {k: after[k] for k in after if before[k] != after[k]}
    if old_value or new_value:
        activity_services.record_worklog_event(
            worklog,
            actor=actor,
            action=ActivityActions.UPDATED,
            old_value=old_value,
            new_value=new_value,
        )
        realtime.defer_worklog_changed(
            project_id=worklog.project_id,
            event=realtime.EVENT_WORKLOG_UPDATED,
            payload=worklog_event_payload(worklog, action=ActivityActions.UPDATED),
        )
    return worklog


def delete_worklog(worklog: Worklog, *, actor, role: int) -> None:
    _require_mutation_permission(worklog, actor, role)
    activity_services.record_worklog_event(
        worklog,
        actor=actor,
        action=ActivityActions.DELETED,
        old_value=worklog_snapshot(worklog),
    )
    payload = worklog_event_payload(worklog, action=ActivityActions.DELETED)
    project_id = worklog.project_id
    worklog.delete()
    realtime.defer_worklog_changed(
        project_id=project_id,
        event=realtime.EVENT_WORKLOG_DELETED,
        payload=payload,
    )
