"""工程日志模型（Sprint 11，PRODUCT_REFACTOR_PLAN §10）。

Worklog 与 Task(Issue) 严格分开：**Task 是计划，Worklog 是证据**（§4）。
一条 Worklog 记录"某天实际做了什么、结果如何、结论、下一步、是否被卡住"。
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.projects.models import Project, ProjectStage
from core.models import BaseModel


class WorklogSource(models.TextChoices):
    """这条日志是谁产生的（§10：将来可明确区分人工 / Agent / 导入）。"""

    MANUAL = "manual", "人工"
    AGENT = "agent", "Agent"
    IMPORTED = "imported", "导入"


class Worklog(BaseModel):
    """某项目某天的工程日志。

    - `date` 是"日志归属日"（可与 created_at 不同，允许补记）；
    - `stage` 可选关联到 Global Plan 的某个阶段；
    - `author` 用 PROTECT：日志是审计性记录，作者账号不允许被删除；
    - 结论 / 下一步 / 阻塞 都是结构化字段，供首页 Today 与 Island 直接消费。
    """

    project = models.ForeignKey(
        Project, verbose_name="项目", on_delete=models.CASCADE, related_name="worklogs"
    )
    stage = models.ForeignKey(
        ProjectStage,
        verbose_name="所属阶段",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worklogs",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="作者",
        on_delete=models.PROTECT,
        related_name="worklogs",
    )
    date = models.DateField("日志日期", default=timezone.localdate)
    title = models.CharField("标题", max_length=120)
    summary = models.TextField("完成内容")
    details = models.TextField("过程细节", blank=True, default="")
    conclusion = models.TextField("结论", blank=True, default="")
    next_step = models.TextField("下一步", blank=True, default="")
    blocker = models.TextField("阻塞", blank=True, default="")
    source = models.CharField(
        "来源", max_length=12, choices=WorklogSource.choices, default=WorklogSource.MANUAL
    )

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["project", "-date"]),
            models.Index(fields=["author", "-date"]),
        ]

    def __str__(self):
        return f"{self.date} · {self.project.identifier} · {self.title}"
