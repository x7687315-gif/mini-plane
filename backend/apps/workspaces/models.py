"""工作区与成员模型（Sprint 2，契约 docs/api/02-workspaces.md）。"""

import re

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from core.models import BaseModel

SLUG_PATTERN = r"^[a-z0-9-]{2,32}$"

workspace_slug_validator = RegexValidator(
    regex=re.compile(SLUG_PATTERN),
    message="slug 只能包含小写字母、数字和连字符，长度 2-32。",
    code="invalid_slug",
)


class WorkspaceRoles(models.IntegerChoices):
    ADMIN = 20, "管理员"
    MEMBER = 15, "成员"
    VIEWER = 5, "只读成员"


class Workspace(BaseModel):
    """工作区：多租户顶层作用域，URL 以 slug 标识（决策 D6）。"""

    name = models.CharField("名称", max_length=80)
    slug = models.SlugField(
        "标识",
        max_length=32,
        unique=True,
        validators=[workspace_slug_validator],
        help_text="URL 中的租户标识，全局唯一",
    )
    # PROTECT：工作区存在期间不允许删除所有者账号（级联语义见 Sprint 2 devlog）
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="所有者",
        on_delete=models.PROTECT,
        related_name="workspaces_owned",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name}({self.slug})"


class WorkspaceMember(BaseModel):
    """工作区成员：user 与 workspace 的多对多带角色。"""

    workspace = models.ForeignKey(
        Workspace,
        verbose_name="工作区",
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="用户",
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    role = models.IntegerField(
        "角色", choices=WorkspaceRoles.choices, default=WorkspaceRoles.MEMBER
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["workspace", "user"], name="uniq_workspace_member"),
        ]
        indexes = [
            # 高频查询：我的工作区列表 / 角色判定
            models.Index(fields=["user", "workspace"]),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user} @ {self.workspace} [{self.role}]"
