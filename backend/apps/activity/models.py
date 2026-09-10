"""活动日志模型（契约 docs/api/06-activities.md）。

ActivityLog 是 **Audit Trail**：只回答"谁在什么时候把什么改成了什么"。
写入路径唯一——`activity.services.record_activity(...)`，由 Issue / Comment / Project
的变更代码调用（见 BACKEND_PLAN §3.2）。
"""

from django.conf import settings
from django.db import models

from apps.projects.models import Project
from apps.workspaces.models import Workspace
from core.models import BaseModel


class EntityTypes(models.TextChoices):
    """被记录的对象类型。MVP 实际产出 issue / comment / project，其余为二期预留。"""

    ISSUE = "issue", "任务"
    COMMENT = "comment", "评论"
    STATE = "state", "状态"
    LABEL = "label", "标签"
    PROJECT = "project", "项目"
    WORKSPACE = "workspace", "工作区"
    MEMBER = "member", "成员"


class Actions(models.TextChoices):
    CREATED = "created", "创建"
    UPDATED = "updated", "修改"
    DELETED = "deleted", "删除"


class ActivityLog(BaseModel):
    """一条不可变的变更留痕（无更新接口，只有 created_at 有意义）。

    设计要点：
    - `entity_id` 不建外键：被记录的对象可能已被删除（deleted 事件），
      外键会导致"删对象就把它的历史一起删掉"，与审计目的冲突；
      代价是列表查询要用 ``(entity_type, entity_id)`` 组合索引（本模型已建）。
    - `issue` 是**上下文外键**（计划 §3.2 之外的补充，devlog 已说明理由）：
      Issue 时间线要长成"Issue 自身的变更 + 挂在该 Issue 下的评论事件"，
      而评论被删后 Comment 行就不在了，不能再靠子查询关联。故冗余存一列。
      用 SET_NULL 而不是 CASCADE：删 Issue 时**保留**它的 deleted 留痕，
      否则"删除"这条最重要的审计记录会被自己删掉。
    - `workspace` 冗余存一份，为二期的"工作区级活动流"留路口（计划 §3.2）。
    - `old_value` / `new_value` 里**不出现 UUID**：全部是可直接展示的值，
      翻译逻辑集中在调用方（避免前端二次回查）。
    """

    workspace = models.ForeignKey(
        Workspace,
        verbose_name="工作区",
        on_delete=models.CASCADE,
        related_name="activities",
    )
    project = models.ForeignKey(
        Project,
        verbose_name="项目",
        on_delete=models.CASCADE,
        related_name="activities",
    )
    # 上下文：这条留痕属于哪个 Issue（评论事件也归到它所属的 Issue）
    issue = models.ForeignKey(
        "issues.Issue",
        verbose_name="任务",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    # PROTECT：留痕的 actor 不允许被删除（与 Issue.created_by 同理）
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="操作人",
        on_delete=models.PROTECT,
        related_name="activities",
    )
    entity_type = models.CharField("对象类型", max_length=16, choices=EntityTypes.choices)
    entity_id = models.UUIDField("对象 id")
    action = models.CharField("动作", max_length=10, choices=Actions.choices)
    old_value = models.JSONField("变更前", null=True, blank=True)
    new_value = models.JSONField("变更后", null=True, blank=True)

    class Meta:
        indexes = [
            # 项目级活动流（倒序分页）
            models.Index(fields=["project", "-created_at"]),
            # Issue 时间线（含已删除评论的事件）
            models.Index(fields=["issue", "-created_at"]),
            # 通用对象回溯
            models.Index(fields=["entity_type", "entity_id"]),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.actor_id} {self.action} {self.entity_type}:{self.entity_id}"
