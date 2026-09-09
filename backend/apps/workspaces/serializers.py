"""Workspace 模块序列化器（docs/api/02-workspaces.md）。"""

from rest_framework import serializers

from apps.users.serializers import UserLiteSerializer
from apps.workspaces.models import (
    Workspace,
    WorkspaceMember,
    WorkspaceRoles,
    workspace_slug_validator,
)


class WorkspaceSerializer(serializers.ModelSerializer):
    """工作区响应体；current_role 由视图按请求用户注入。"""

    owner = serializers.UUIDField(source="owner_id", read_only=True)
    current_role = serializers.SerializerMethodField(help_text="当前请求用户的角色（20/15/5）")

    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "owner", "current_role", "created_at", "updated_at"]
        read_only_fields = fields

    def get_current_role(self, obj) -> int | None:
        return self.context.get("role")


class WorkspaceWriteSerializer(serializers.ModelSerializer):
    """创建 / 更新请求体。slug 可省略；唯一性冲突由 service 层做自动后缀。"""

    slug = serializers.SlugField(
        required=False,
        validators=[workspace_slug_validator],
        help_text="可省略；缺省由 name 生成，冲突自动追加 -2/-3…",
    )

    class Meta:
        model = Workspace
        fields = ["name", "slug"]


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user = UserLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "role", "created_at"]
        read_only_fields = fields


class WorkspaceMemberAddSerializer(serializers.Serializer):
    email = serializers.EmailField(help_text="被邀请用户的注册邮箱")
    role = serializers.ChoiceField(choices=WorkspaceRoles.choices, default=WorkspaceRoles.MEMBER)


class WorkspaceMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=WorkspaceRoles.choices)
