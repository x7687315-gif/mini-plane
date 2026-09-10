"""后台任务与通知的模型（契约 docs/api/07-cache-and-tasks.md）。"""

from django.conf import settings
from django.db import models

from apps.projects.models import Project
from core.models import BaseModel


class TaskKind(models.TextChoices):
    BULK_ASSIGN_LABELS = "bulk_assign_labels", "批量修改标签"


class TaskStatus(models.TextChoices):
    PENDING = "pending", "排队中"
    RUNNING = "running", "执行中"
    SUCCESS = "success", "已完成"
    FAILURE = "failure", "失败"


class TaskRun(BaseModel):
    """异步任务的**持久化状态**，前端据此轮询进度。

    为什么不用 Celery 的 `AsyncResult`：
    - 状态要能落库、可查、可审计（"昨天那批批量操作到底成没成"）；
    - `CELERY_TASK_ALWAYS_EAGER=True` 时 `AsyncResult` 恒为 SUCCESS，
      测不出 pending → running → success 的流转，而计划 §Sprint 6 要求测这个流转。

    代价：任务自己负责维护状态机（见 tasks.py 的 `_mark`）。
    """

    project = models.ForeignKey(
        Project, verbose_name="项目", on_delete=models.CASCADE, related_name="task_runs"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="发起人",
        on_delete=models.PROTECT,
        related_name="task_runs",
    )
    kind = models.CharField("任务类型", max_length=40, choices=TaskKind.choices)
    status = models.CharField(
        "状态", max_length=10, choices=TaskStatus.choices, default=TaskStatus.PENDING
    )
    params = models.JSONField("入参", default=dict, blank=True)
    result = models.JSONField("结果摘要", null=True, blank=True)
    error = models.TextField("失败原因", blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["project", "-created_at"]),
            models.Index(fields=["status"]),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.kind} {self.status} ({self.id})"


class Notification(BaseModel):
    """通知占位表（MVP 只落库，邮件/推送在二期）。

    **幂等靠 `dedupe_key` 的唯一约束**，而不是靠 task_id：
    Celery 的语义是 at-least-once，同一个逻辑事件可能因为重试、worker 重启、
    手动重投而到达多次；同一个 task_id 也可能在重试时复用。真正稳定的幂等键是
    业务事件本身："哪条评论、通知谁" —— 重复投递时 `get_or_create` 直接跳过。
    """

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="收件人",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="触发人",
        on_delete=models.PROTECT,
        related_name="notifications_sent",
    )
    project = models.ForeignKey(
        Project, verbose_name="项目", on_delete=models.CASCADE, related_name="notifications"
    )
    event = models.CharField("事件", max_length=40)
    payload = models.JSONField("载荷", default=dict, blank=True)
    dedupe_key = models.CharField("幂等键", max_length=160, unique=True)

    class Meta:
        indexes = [
            models.Index(fields=["recipient", "-created_at"]),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.event} → {self.recipient_id}"
