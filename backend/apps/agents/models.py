"""Agent 集成层模型（Sprint 12，PRODUCT_REFACTOR_PLAN §12–§15/§24/§25）。

两个核心对象：
- `AgentToken`：独立于用户会话的 Agent 凭据，带**权限白名单**（scopes）。
  明文只在创建时返回一次，库中只存 SHA-256 哈希。
- `IdempotencyRecord`：幂等键记录。Agent 可能重试/重复发送同一动作，
  带相同 `Idempotency-Key` 的请求直接回放首次响应，不产生重复数据（§25）。
"""

import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import BaseModel

TOKEN_PREFIX = "mpa_"  # Mini Plane Agent


class AgentScopes(models.TextChoices):
    """Agent 权限白名单（§24）：只有这些能力，绝不给破坏性权限。"""

    READ_PROJECT = "read_project", "读取项目"
    READ_TASK = "read_task", "读取任务"
    WRITE_TASK = "write_task", "创建/推进任务"
    WRITE_WORKLOG = "write_worklog", "写工程日志"
    UPDATE_PROGRESS = "update_progress", "更新阶段进度"


#: 新建 Token 的默认权限（不含任何删除/成员/角色能力）
DEFAULT_AGENT_SCOPES = [
    AgentScopes.READ_PROJECT,
    AgentScopes.READ_TASK,
    AgentScopes.WRITE_TASK,
    AgentScopes.WRITE_WORKLOG,
    AgentScopes.UPDATE_PROGRESS,
]


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AgentToken(BaseModel):
    """某个用户发给 Agent 的凭据；作用域受限、可吊销。"""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="持有人",
        on_delete=models.CASCADE,
        related_name="agent_tokens",
    )
    name = models.CharField("名称", max_length=80, help_text="如：本地编码 Agent")
    token_hash = models.CharField("令牌哈希", max_length=64, unique=True)
    scopes = models.JSONField("权限白名单", default=list)
    last_used_at = models.DateTimeField("最近使用", null=True, blank=True)
    revoked_at = models.DateTimeField("吊销时间", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.owner})"

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    @classmethod
    def mint(cls, owner, *, name: str, scopes=None) -> tuple["AgentToken", str]:
        """创建 Token 并返回 (实例, 明文)。明文仅此一次可见。"""
        raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
        token = cls.objects.create(
            owner=owner,
            name=name,
            token_hash=hash_token(raw),
            scopes=list(scopes or DEFAULT_AGENT_SCOPES),
        )
        return token, raw

    def touch(self) -> None:
        AgentToken.objects.filter(pk=self.pk).update(last_used_at=timezone.now())


class IdempotencyRecord(BaseModel):
    """(token, key, action) 唯一：重复请求回放首次响应。"""

    token = models.ForeignKey(
        AgentToken, verbose_name="令牌", on_delete=models.CASCADE, related_name="idempotency"
    )
    key = models.CharField("幂等键", max_length=120)
    action = models.CharField("动作", max_length=60)
    status_code = models.PositiveIntegerField("首次状态码")
    response = models.JSONField("首次响应体", default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["token", "key", "action"], name="uniq_idempotency_per_token_action"
            ),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action}:{self.key}"


class AgentSessionStatus(models.TextChoices):
    RUNNING = "running", "运行中"
    DONE = "done", "完成"
    FAILED = "failed", "失败"
    STOPPED = "stopped", "人工停止"


class AgentSession(BaseModel):
    """一次 Agent 运行会话（Sprint 13，§13/§16）。

    开始/结束都会通过现有 WebSocket 广播 `agent.session` 事件，
    让桌面端实时看到「AGENT · RUNNING」（§14：Agent 改工程状态 → 桌面实时看到）。
    """

    project = models.ForeignKey(
        "projects.Project",
        verbose_name="项目",
        on_delete=models.CASCADE,
        related_name="agent_sessions",
    )
    token = models.ForeignKey(
        AgentToken,
        verbose_name="发起令牌",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions",
    )
    task = models.ForeignKey(
        "issues.Issue",
        verbose_name="关联任务",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_sessions",
    )
    title = models.CharField("会话标题", max_length=120)
    status = models.CharField(
        "状态",
        max_length=12,
        choices=AgentSessionStatus.choices,
        default=AgentSessionStatus.RUNNING,
    )
    started_at = models.DateTimeField("开始时间", auto_now_add=True)
    ended_at = models.DateTimeField("结束时间", null=True, blank=True)
    note = models.TextField("备注", blank=True, default="")

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["project", "status"]),
        ]

    def __str__(self):
        return f"{self.project.identifier} · {self.title} [{self.status}]"

    @property
    def elapsed_seconds(self) -> int:
        end = self.ended_at or timezone.now()
        return int((end - self.started_at).total_seconds())
