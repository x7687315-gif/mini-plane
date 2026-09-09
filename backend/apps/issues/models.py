"""Issue 域模型（Sprint 2 先建 State；Issue/Label/Comment 在 Sprint 3）。"""

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
