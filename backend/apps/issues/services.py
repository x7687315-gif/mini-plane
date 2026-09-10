"""Issue 域业务逻辑（契约 docs/api/04-issues.md）。

本模块承载 Sprint 3 最核心的一件事（决策 D9）：
**sequence_id 的发号必须在事务内对 Project 行加锁**，否则并发创建会重号
（见 tests/test_concurrency.py）。
"""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.issues.models import Issue, IssuePriorities, Label, State, StateGroups
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
    """创建 Issue 并发放项目内序号（决策 D9）。

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
    return issue


@transaction.atomic
def update_issue(issue: Issue, **fields) -> Issue:
    """部分更新：只处理调用方提交的字段（serializer 已做跨作用域校验）。

    可改字段白名单 = title / description / priority / state / assignee / labels；
    `sequence_id`、`created_by`、`project` 不在白名单内，天然不可改（04 契约）。
    """
    labels = fields.pop("labels", _UNSET)

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
    return issue


def delete_issue(issue: Issue) -> None:
    """删除 Issue（Sprint 4 将在此挂接 Activity 记录）。"""
    issue.delete()


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
