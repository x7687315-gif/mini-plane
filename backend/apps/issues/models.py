"""Issue 域模型（Sprint 2 建 State；Sprint 3 补 Label / Issue；Sprint 4 补 Comment）。"""

from django.conf import settings
from django.db import models

from apps.projects.models import Project
from core.models import BaseModel


class StateGroups(models.TextChoices):
    """状态分组，对齐 Plane 的 state.group 概念（决策 D8）。"""

    BACKLOG = "backlog", "待规划"
    UNSTARTED = "unstarted", "未开始"
    STARTED = "started", "进行中"
    COMPLETED = "completed", "已完成"
    CANCELLED = "cancelled", "已取消"


class State(BaseModel):
    """项目内的任务状态。MVP 只读（创建项目时预置 5 个），自定义管理放二期。"""

    project = models.ForeignKey(
        Project,
        verbose_name="项目",
        on_delete=models.CASCADE,
        related_name="states",
    )
    name = models.CharField("名称", max_length=60)
    group = models.CharField("分组", max_length=12, choices=StateGroups.choices)
    color = models.CharField("颜色", max_length=9, default="#94a3b8", help_text="#RRGGBB")
    sort_order = models.PositiveIntegerField("排序", default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "name"], name="uniq_state_name_per_project"),
        ]
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.project_id} · {self.name}"


# 预置状态定义：(name, group, color, sort_order)
DEFAULT_STATES = [
    ("Backlog", StateGroups.BACKLOG, "#94a3b8", 1),
    ("Todo", StateGroups.UNSTARTED, "#eab308", 2),
    ("In Progress", StateGroups.STARTED, "#3b82f6", 3),
    ("Done", StateGroups.COMPLETED, "#22c55e", 4),
    ("Cancelled", StateGroups.CANCELLED, "#64748b", 5),
]


def create_default_states(project: Project, created_by: settings.AUTH_USER_MODEL = None) -> None:
    """为项目创建默认五态（在 create_project 的事务内调用，见决策 D8）。"""
    State.objects.bulk_create(
        State(project=project, name=name, group=group, color=color, sort_order=order)
        for name, group, color, order in DEFAULT_STATES
    )


class Label(BaseModel):
    """项目内标签；name 在项目内唯一（04 契约）。"""

    project = models.ForeignKey(
        Project,
        verbose_name="项目",
        on_delete=models.CASCADE,
        related_name="labels",
    )
    name = models.CharField("名称", max_length=60)
    color = models.CharField("颜色", max_length=9, default="#64748b", help_text="#RRGGBB")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "name"], name="uniq_label_name_per_project"),
        ]
        ordering = ["name"]

    def __str__(self):
        return f"{self.project_id} · {self.name}"


class IssuePriorities(models.TextChoices):
    """优先级枚举（04 契约表格，字符串值直接进 JSON）。"""

    NONE = "none", "无"
    URGENT = "urgent", "紧急"
    HIGH = "high", "高"
    MEDIUM = "medium", "中"
    LOW = "low", "低"


class Issue(BaseModel):
    """任务：Mini Plane 的核心实体。

    设计要点：
    - `sequence_id`：项目内自增编号（决策 D9），由 services.create_issue 在
      事务内对 Project 行加锁后发号，并发不重号；客户端传入一律忽略。
    - `state` 用 RESTRICT：防止误删仍有 Issue 的状态（决策 D7）；项目级联删除时
      Issue 与 State 同批被 CASCADE 收集，Django 允许 RESTRICT 放行
      （见 test_models.ProjectCascadeTests）。
    - `assignee` 用 SET_NULL：指派人的账号被删不应删掉 Issue，只解除指派。
    - `created_by` 用 PROTECT：Issue 的创建者是审计信息，不允许被删除。
    """

    project = models.ForeignKey(
        Project,
        verbose_name="项目",
        on_delete=models.CASCADE,
        related_name="issues",
    )
    sequence_id = models.PositiveIntegerField("项目内序号")
    title = models.CharField("标题", max_length=255)
    description = models.TextField("描述", blank=True, default="")
    priority = models.CharField(
        "优先级",
        max_length=10,
        choices=IssuePriorities.choices,
        default=IssuePriorities.NONE,
    )
    state = models.ForeignKey(
        State,
        verbose_name="状态",
        on_delete=models.RESTRICT,
        related_name="issues",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="指派人",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_issues",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="创建者",
        on_delete=models.PROTECT,
        related_name="issues_created",
    )
    labels = models.ManyToManyField(
        Label,
        verbose_name="标签",
        blank=True,
        related_name="issues",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "sequence_id"], name="uniq_issue_sequence_per_project"
            ),
        ]
        indexes = [
            # Sprint 5 用 EXPLAIN 验证的查询路径（§7.5 索引验证）
            models.Index(fields=["project", "state"]),
            models.Index(fields=["project", "priority"]),
            models.Index(fields=["project", "-created_at"]),
        ]
        ordering = ["-sequence_id"]

    def __str__(self):
        return f"#{self.sequence_id} {self.title}"


class Comment(BaseModel):
    """Issue 下的评论（契约 docs/api/05-comments.md）。

    设计要点：
    - `author` 用 PROTECT：评论是审计信息，作者账号不允许被删除；
    - `(issue, created_at)` 组合索引：评论区恒定按"某 Issue + 时间正序"读取；
    - 正文不做长度限制（TextField），但**活动流不存正文**（见 06 契约）。
    """

    issue = models.ForeignKey(
        Issue,
        verbose_name="任务",
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="作者",
        on_delete=models.PROTECT,
        related_name="comments",
    )
    content = models.TextField("内容")

    class Meta:
        indexes = [
            models.Index(fields=["issue", "created_at"]),
        ]
        # 评论区是对话：旧的在前（与 Issue 列表的倒序相反，见 05 契约）
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.author_id} on #{self.issue_id}"
