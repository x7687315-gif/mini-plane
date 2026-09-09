"""Project 模块序列化器（docs/api/03-projects.md）。"""

from rest_framework import serializers

from apps.issues.models import State
from apps.projects.models import Project, ProjectMember, ProjectRoles, identifier_validator
from apps.users.serializers import UserLiteSerializer


class ProjectSerializer(serializers.ModelSerializer):
    created_by = serializers.UUIDField(source="created_by_id", read_only=True)
    current_user_role = serializers.SerializerMethodField(
        help_text="当前请求用户的生效角色（20/15/5）"
    )

    class Meta:
        model = Project
        fields = [
            "id",
            "workspace",
            "name",
            "identifier",
            "description",
            "created_by",
            "current_user_role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_current_user_role(self, obj) -> int | None:
        return self.context.get("role")


class ProjectWriteSerializer(serializers.ModelSerializer):
    """创建 / 更新请求体。identifier 唯一性（工作区内）由 service 显式校验。"""

    identifier = serializers.CharField(
        max_length=5, validators=[identifier_validator], help_text="2-5 位大写字母数字，Issue 前缀"
    )

    class Meta:
        model = Project
        fields = ["name", "identifier", "description"]


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserLiteSerializer(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ["id", "user", "role", "created_at"]
        read_only_fields = fields


class ProjectMemberAddSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(help_text="被添加用户；必须已是工作区成员")
    role = serializers.ChoiceField(choices=ProjectRoles.choices, default=ProjectRoles.MEMBER)


class ProjectMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ProjectRoles.choices)


class StateSerializer(serializers.ModelSerializer):
    """状态只读响应体（预置五态）。"""

    class Meta:
        model = State
        fields = ["id", "name", "group", "color", "sort_order"]
        read_only_fields = fields
