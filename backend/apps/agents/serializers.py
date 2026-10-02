"""Agent 集成层序列化器（Sprint 12）。"""

from rest_framework import serializers

from apps.agents.models import (
    DEFAULT_AGENT_SCOPES,
    AgentScopes,
    AgentSession,
    AgentSessionStatus,
    AgentToken,
)
from apps.projects.serializers import ProjectPlanSerializer, ProjectSerializer


class AgentTokenSerializer(serializers.ModelSerializer):
    """Token 只读视图：绝不回传哈希/明文。"""

    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = AgentToken
        fields = ["id", "name", "scopes", "is_active", "last_used_at", "revoked_at", "created_at"]
        read_only_fields = fields


class AgentTokenCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    scopes = serializers.ListField(
        child=serializers.ChoiceField(choices=AgentScopes.choices),
        required=False,
        allow_empty=False,
        help_text="缺省为默认白名单（read/write task、worklog、progress）",
    )

    def validate_scopes(self, value):
        return value or list(DEFAULT_AGENT_SCOPES)


class AgentTokenCreatedSerializer(serializers.Serializer):
    """创建 Token 的响应：明文仅此一次返回。"""

    token = serializers.CharField(help_text="明文 Token，仅本次返回，请妥善保存")
    detail = AgentTokenSerializer()


class AgentProjectSnapshotSerializer(serializers.Serializer):
    """project.get 的响应：项目 + Global Plan 快照。"""

    project = ProjectSerializer()
    plan = ProjectPlanSerializer()


class AgentTaskCreateSerializer(serializers.Serializer):
    """Agent 建任务：以"工程动作"为中心，只暴露必要字段。"""

    workspace_slug = serializers.SlugField()
    project_id = serializers.UUIDField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    priority = serializers.CharField(required=False, allow_blank=True)


class AgentWorklogCreateSerializer(serializers.Serializer):
    workspace_slug = serializers.SlugField()
    project_id = serializers.UUIDField()
    title = serializers.CharField(max_length=120)
    summary = serializers.CharField()
    conclusion = serializers.CharField(required=False, allow_blank=True)
    next_step = serializers.CharField(required=False, allow_blank=True)
    blocker = serializers.CharField(required=False, allow_blank=True)
    stage_id = serializers.UUIDField(required=False, allow_null=True)
    date = serializers.DateField(required=False)


class AgentProgressSerializer(serializers.Serializer):
    """更新阶段进度 / 切换当前阶段（§13 progress.update / stage.update）。"""

    stage_id = serializers.UUIDField(required=False)
    progress = serializers.IntegerField(required=False, min_value=0, max_value=100)
    set_current = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get("stage_id"):
            raise serializers.ValidationError("stage_id 必填。")
        if "progress" not in attrs and not attrs.get("set_current"):
            raise serializers.ValidationError("progress 与 set_current 至少给一个。")
        return attrs


class AgentSessionSerializer(serializers.ModelSerializer):
    """Agent 会话只读响应体（Sprint 13）。"""

    agent = serializers.CharField(source="token.name", read_only=True, default="agent")
    elapsed_seconds = serializers.IntegerField(read_only=True)
    task = serializers.UUIDField(source="task_id", read_only=True, allow_null=True)

    class Meta:
        model = AgentSession
        fields = [
            "id",
            "project",
            "task",
            "title",
            "status",
            "started_at",
            "ended_at",
            "elapsed_seconds",
            "agent",
            "note",
        ]
        read_only_fields = fields


class AgentSessionStartSerializer(serializers.Serializer):
    workspace_slug = serializers.SlugField()
    project_id = serializers.UUIDField()
    title = serializers.CharField(max_length=120)
    task_id = serializers.UUIDField(required=False, allow_null=True)


class AgentSessionEndSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            AgentSessionStatus.DONE,
            AgentSessionStatus.FAILED,
            AgentSessionStatus.STOPPED,
        ],
        required=False,
        default=AgentSessionStatus.DONE,
    )
    note = serializers.CharField(required=False, allow_blank=True)
