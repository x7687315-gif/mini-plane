"""项目与项目成员模型（Sprint 2，契约 docs/api/03-projects.md）。"""

import re

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from apps.workspaces.models import Workspace
from core.models import BaseModel

IDENTIFIER_PATTERN = r"^[A-Z][A-Z0-9]{1,4}$"

identifier_validator = RegexValidator(
    regex=re.compile(IDENTIFIER_PATTERN),
    message="identifier 格式不正确，应为 2-5 位大写字母数字。",
    code="invalid_identifier",
)


class ProjectRoles(models.IntegerChoices):
    ADMIN = 20, "管理员"
    MEMBER = 15, "成员"
    VIEWER = 5, "只读成员"


class Project(BaseModel):
    """项目：工作区内的协作单元，URL 同时携带 workspace slug 与项目 id（决策 D6）。"""

    workspace = models.ForeignKey(
        Workspace,
        verbose_name="工作区",
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField("名称", max_length=120)
    identifier = models.CharField(
        "标识符",
        max_length=5,
        validators=[identifier_validator],
        help_text="2-5 位大写字母数字，用于 Issue 前缀（如 AMI-1），工作区内唯一",
    )
    description = models.TextField("描述", blank=True, default="")
    # PROTECT：项目存在期间禁止删除创建者
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="创建者",
        on_delete=models.PROTECT,
        related_name="projects_created",
    )
    # Sprint 3 的 sequence_id 发号计数器（决策 D9），只在事务内更新
    issue_sequence = models.PositiveIntegerField("Issue 序号计数器", default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "identifier"], name="uniq_project_identifier_per_workspace"
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.identifier} · {self.name}"


class ProjectMember(BaseModel):
    """项目成员：必须是 WorkspaceMember（service 层校验，见 03 契约）。"""

    project = models.ForeignKey(
        Project,
        verbose_name="项目",
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="用户",
        on_delete=models.CASCADE,
        related_name="project_memberships",
    )
    role = models.IntegerField("角色", choices=ProjectRoles.choices, default=ProjectRoles.MEMBER)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "user"], name="uniq_project_member"),
        ]
        indexes = [
            models.Index(fields=["user", "project"]),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user} @ {self.project} [{self.role}]"
