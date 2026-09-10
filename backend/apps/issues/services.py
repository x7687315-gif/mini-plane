"""Issue / Label / Comment 业务逻辑（契约 docs/api/04-issues.md、05-comments.md）。

本模块承载两件事：
1. Sprint 3 决策 D9：**sequence_id 的发号必须在事务内对 Project 行加锁**，
   否则并发创建会重号（见 tests/test_concurrency.py）。
2. Sprint 4：本模块是 Issue / Comment 的**唯一写入口**，活动留痕（06 契约）
   全部挂在这里——视图层只负责权限与序列化，不直接写库。

留痕与业务同事务：这些函数带 @transaction.atomic，record_activity 刻意不带，
所以写留痕失败会让业务变更一起回滚（计划 §Sprint 4 测试清单）。
"""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.activity import services as activity_services
from apps.activity.models import Actions as ActivityActions
from apps.issues.models import Comment, Issue, IssuePriorities, Label, State, StateGroups
from apps.jobs.tasks import notify_comment_created
from apps.projects.models import Project

# 哨兵：区分「未提交该字段」与「显式提交 null / 空列表」
_UNSET = object()


def get_default_state(project: Project) -> State:
    """创建 Issue 时的缺省状态：项目里 group=backlog 的第一个状态（即 Backlog）。"""
    state = (
        State.objects.filter(project=project, group=StateGroups.BACKLOG)
        .order_by("sort_order")
        .first()
    )
    if state is None:
        # 理论上不会发生（创建项目必预置五态），兜底避免 500
        state = State.objects.filter(project=project).order_by("sort_order").first()
    if state is None:
        raise ValidationError({"state": ["项目尚未初始化状态，无法创建 Issue。"]})
    return state


# ── Issue ──────────────────────────────────────────────────────


@transaction.atomic
def create_issue(
    project: Project,
    actor,
    *,
    title: str,
    description: str = "",
    priority: str = IssuePriorities.NONE,
    state: State | None = None,
    assignee=None,
    labels=None,
) -> Issue:
    """创建 Issue 并发放项目内序号（决策 D9），写一条 `issue.created` 留痕。

    `select_for_update()` 锁住 Project 行 → 同一项目的并发创建被串行化 →
    `issue_sequence` 自增与 Issue 落库在同一事务里，不会出现重号。
    发号用的是重新读取的 `locked` 实例，避免使用调用方手上可能过期的对象。
    """
    locked = Project.objects.select_for_update().get(pk=project.pk)
    locked.issue_sequence += 1
    locked.save(update_fields=["issue_sequence", "updated_at"])

    issue = Issue.objects.create(
        project=locked,
        sequence_id=locked.issue_sequence,
        title=title.strip(),
        description=description or "",
        priority=priority,
        state=state or get_default_state(locked),
        assignee=assignee,
        created_by=actor,
    )
    if labels:
        issue.labels.set(labels)

    activity_services.record_issue_event(
        issue,
        actor=actor,
        action=ActivityActions.CREATED,
        new_value=activity_services.capture_issue_snapshot(
            issue, labels=[label.name for label in labels or []]
        ),
    )
    return issue


@transaction.atomic
def update_issue(issue: Issue, *, actor, **fields) -> Issue:
    """部分更新：只处理调用方提交的字段（serializer 已做跨作用域校验）。

    可改字段白名单 = title / description / priority / state / assignee / labels；
    `sequence_id`、`created_by`、`project` 不在白名单内，天然不可改（04 契约）。

    留痕规则（06 契约）：取更新前后的快照做 diff，**只记录真正变化的字段**；
    全部没变则不产生活动记录。
    """
    labels = fields.pop("labels", _UNSET)
    before = activity_services.capture_issue_snapshot(issue)

    if "title" in fields:
        title = fields["title"]
        if not title or not title.strip():
            raise ValidationError({"title": ["该字段是必填项。"]})
        issue.title = title.strip()

    for key in ("description", "priority", "state", "assignee"):
        if key in fields:
            setattr(issue, key, fields[key])

    issue.save()

    if labels is not _UNSET:
        issue.labels.set(labels)

    old_value, new_value = activity_services.diff_snapshots(
        before, activity_services.capture_issue_snapshot(issue)
    )
    if old_value or new_value:
        activity_services.record_issue_event(
            issue,
            actor=actor,
            action=ActivityActions.UPDATED,
            old_value=old_value,
            new_value=new_value,
        )
    return issue


@transaction.atomic
def delete_issue(issue: Issue, *, actor) -> None:
    """删除 Issue，并留下 `issue.deleted` 留痕。

    必须在 `issue.delete()` **之前**写：Django 删除后会把主键置空，
    那时再写留痕就拿不到 entity_id 了。
    """
    activity_services.record_issue_event(
        issue,
        actor=actor,
        action=ActivityActions.DELETED,
        old_value=activity_services.capture_issue_snapshot(issue),
    )
    issue.delete()


# ── Comment ────────────────────────────────────────────────────


@transaction.atomic
def create_comment(issue: Issue, author, *, content: str) -> Comment:
    """创建评论，写 `comment.created` 留痕（05 / 06 契约），并投递通知任务（Sprint 6）。"""
    content = (content or "").strip()
    if not content:
        raise ValidationError({"content": ["该字段是必填项。"]})
    comment = Comment.objects.create(issue=issue, author=author, content=content)
    activity_services.record_comment_event(comment, actor=author, action=ActivityActions.CREATED)
    # 投递必须等到事务提交：否则 worker 可能抢在提交前读这条评论（读不到 → 通知丢失）
    transaction.on_commit(lambda: notify_comment_created.delay(str(comment.id)))
    return comment


@transaction.atomic
def update_comment(comment: Comment, *, content: str) -> Comment:
    """编辑评论内容。**不产生活动记录**（06 契约「有意不记录的事件」）。"""
    content = (content or "").strip()
    if not content:
        raise ValidationError({"content": ["该字段是必填项。"]})
    comment.content = content
    comment.save(update_fields=["content", "updated_at"])
    return comment


@transaction.atomic
def delete_comment(comment: Comment, *, actor) -> None:
    """删除评论并写 `comment.deleted` 留痕（同样要在 delete 之前写）。"""
    activity_services.record_comment_event(comment, actor=actor, action=ActivityActions.DELETED)
    comment.delete()


# ── Label（Sprint 4 范围：不产生活动记录，见 06 契约）────────────


def create_label(project: Project, *, name: str, color: str = "#64748b") -> Label:
    """创建标签；项目内 name 唯一（04 契约）。"""
    name = (name or "").strip()
    if not name:
        raise ValidationError({"name": ["该字段是必填项。"]})
    if Label.objects.filter(project=project, name=name).exists():
        raise ValidationError({"name": ["该项目下已存在同名标签。"]})
    return Label.objects.create(project=project, name=name, color=color or "#64748b")


def update_label(label: Label, *, name: str | None = None, color: str | None = None) -> Label:
    """改标签名 / 颜色；重名同样 400。"""
    if name is not None:
        name = name.strip()
        if not name:
            raise ValidationError({"name": ["该字段是必填项。"]})
        if Label.objects.filter(project=label.project, name=name).exclude(pk=label.pk).exists():
            raise ValidationError({"name": ["该项目下已存在同名标签。"]})
        label.name = name
    if color is not None:
        label.color = color
    label.save()
    return label


def delete_label(label: Label) -> None:
    """删除标签；M2M 通过表随之清理，已引用的 Issue 不受影响（04 契约）。"""
    label.delete()
