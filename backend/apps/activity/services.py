"""活动留痕的写入与读取（契约 docs/api/06-activities.md）。

写入路径唯一：所有留痕都经由本模块，业务代码（Issue / Comment / Project 的 services）
调用它，不暴露创建 API。

**刻意不给 record_activity 加 @transaction.atomic**：留痕必须与业务变更同事务，
写留痕失败要让业务一起回滚，所以由调用方的事务域决定（计划 §Sprint 4 测试清单）。
"""

from apps.activity.models import Actions, ActivityLog, EntityTypes

# 06 契约「字段 diff 白名单」：只有这些字段的变化会进活动流
TRACKED_ISSUE_FIELDS = ("title", "description", "state", "priority", "assignee", "labels")


def record_activity(
    *,
    actor,
    project,
    entity_type: str,
    entity_id,
    action: str,
    issue=None,
    old_value=None,
    new_value=None,
) -> ActivityLog:
    """写一条留痕。

    `workspace_id` 直接从 project 取，避免为了拿工作区再查一次库。
    """
    return ActivityLog.objects.create(
        workspace_id=project.workspace_id,
        project=project,
        issue=issue,
        actor=actor,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
    )


# ── 各实体的写入便捷函数（业务代码只调这几个）──────────────────────


def record_issue_event(issue, *, actor, action: str, old_value=None, new_value=None):
    return record_activity(
        actor=actor,
        project=issue.project,
        issue=issue,
        entity_type=EntityTypes.ISSUE,
        entity_id=issue.id,
        action=action,
        old_value=old_value,
        new_value=new_value,
    )


def record_comment_event(comment, *, actor, action: str):
    """评论事件也归到它所属的 Issue 上，这样 Issue 时间线是一条完整的叙事。"""
    return record_activity(
        actor=actor,
        project=comment.issue.project,
        issue=comment.issue,
        entity_type=EntityTypes.COMMENT,
        entity_id=comment.id,
        action=action,
    )


def record_project_event(project, *, actor, action: str, old_value=None, new_value=None):
    return record_activity(
        actor=actor,
        project=project,
        entity_type=EntityTypes.PROJECT,
        entity_id=project.id,
        action=action,
        old_value=old_value,
        new_value=new_value,
    )


# ── 值翻译与 diff（06 契约字段表）─────────────────────────────────


def describe_description(text: str) -> str:
    """描述只记字数摘要，不存全文（06 契约产品决策 1）。"""
    return f"{len(text or '')} 字"


def capture_issue_snapshot(issue, *, labels=None) -> dict:
    """把 Issue 的受关注字段翻成「可直接展示」的值（不含任何 UUID）。

    `labels` 显式传入可省一次查询（创建/更新路径上标签本来就在手里）；
    不传则现查一次。
    """
    if labels is None:
        labels = issue.labels.values_list("name", flat=True)
    return {
        "title": issue.title,
        "description": describe_description(issue.description),
        "state": issue.state.name,
        "priority": issue.priority,
        "assignee": issue.assignee.username if issue.assignee_id else None,
        "labels": sorted(labels),
    }


def diff_snapshots(before: dict, after: dict) -> tuple[dict, dict]:
    """只保留**真正变化**的字段（06 契约产品决策 2）；无变化返回两个空 dict。"""
    old_value, new_value = {}, {}
    for field in TRACKED_ISSUE_FIELDS:
        if before.get(field) != after.get(field):
            old_value[field] = before.get(field)
            new_value[field] = after.get(field)
    return old_value, new_value


# ── 读取 ────────────────────────────────────────────────────────


def issue_timeline(issue):
    """Issue 时间线：靠冗余的 issue 外键一次取全，评论删除后其历史仍在。"""
    return ActivityLog.objects.filter(issue=issue).select_related("actor")


def project_feed(project):
    """项目级活动流（跨 Issue）。"""
    return ActivityLog.objects.filter(project=project).select_related("actor")


__all__ = [
    "Actions",
    "EntityTypes",
    "capture_issue_snapshot",
    "describe_description",
    "diff_snapshots",
    "issue_timeline",
    "project_feed",
    "record_activity",
    "record_comment_event",
    "record_issue_event",
    "record_project_event",
]
