"""Project 模块序列化器（docs/api/03-projects.md）。"""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.issues.models import State
from apps.projects import services as project_services
from apps.projects.models import (
    Project,
    ProjectMember,
    ProjectPlan,
    ProjectRoles,
    ProjectStage,
    identifier_validator,
)
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


class ProjectEngineeringSerializer(serializers.Serializer):
    """「我的工程」首页的项目工程摘要（Sprint 09，PRODUCT_REFACTOR_PLAN §7/§9）。

    字段全部由视图里**一条聚合查询**注解而来（correlated subquery，无 N+1）：
    任务计数 / 进度 / 当前阶段 / NOW / NEXT / 最近活动。进度 = 已完成 / 总数。
    """

    id = serializers.UUIDField()
    name = serializers.CharField()
    identifier = serializers.CharField()
    workspace_slug = serializers.CharField()
    workspace_name = serializers.CharField()
    total_tasks = serializers.IntegerField()
    open_tasks = serializers.IntegerField()
    done_tasks = serializers.IntegerField()
    started_tasks = serializers.IntegerField()
    progress = serializers.SerializerMethodField(
        help_text="0~1；有 Global Plan 时=Σ(weight×progress)/Σweight，否则=已完成/总数"
    )
    current_stage = serializers.SerializerMethodField(
        help_text="有 Plan 时为当前 Stage 名，否则回退 NOW 任务所在状态名"
    )
    now_task = serializers.CharField(allow_null=True, help_text="当前正在做的任务标题")
    next_task = serializers.CharField(allow_null=True, help_text="队列中下一个任务标题")
    today_logs = serializers.IntegerField(help_text="今日工程日志条数（Sprint 11）")
    agent_running = serializers.BooleanField(help_text="是否有运行中的 Agent 会话（Sprint 13）")
    last_activity = serializers.DateTimeField(allow_null=True)

    def _plan_stages(self, obj):
        plan = getattr(obj, "plan", None)
        if plan is None:
            return []
        return list(plan.stages.all())  # prefetch 命中，无额外查询

    def get_progress(self, obj) -> float:
        stages = self._plan_stages(obj)
        if stages:
            total_w = sum(s.weight for s in stages)
            if total_w > 0:
                return round(sum(s.weight * s.progress for s in stages) / total_w / 100, 4)
        total = obj.total_tasks or 0
        if total <= 0:
            return 0.0
        return round((obj.done_tasks or 0) / total, 4)

    def get_current_stage(self, obj) -> str | None:
        for s in self._plan_stages(obj):
            if s.is_current:
                return s.name
        return obj.current_stage


class ProjectStageSerializer(serializers.ModelSerializer):
    """Global Plan 的单个阶段（只读响应体）。"""

    class Meta:
        model = ProjectStage
        fields = ["id", "order", "name", "goal", "weight", "progress", "is_current", "created_at"]
        read_only_fields = fields


class ProjectStageWriteSerializer(serializers.Serializer):
    """新增 / 修改 Stage 的请求体。is_current=true 时同 plan 其余阶段自动取消。"""

    name = serializers.CharField(max_length=120)
    order = serializers.IntegerField(required=False, min_value=0)
    weight = serializers.IntegerField(required=False, min_value=1)
    progress = serializers.IntegerField(required=False, min_value=0, max_value=100)
    goal = serializers.CharField(required=False, allow_blank=True)
    is_current = serializers.BooleanField(required=False)


class ProjectPlanSerializer(serializers.ModelSerializer):
    """Global Plan 响应体：stages 有序 + 派生的总进度 / 当前 / 下一阶段。"""

    stages = ProjectStageSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField(help_text="Σ(weight×progress)/Σweight，0~100")
    current_stage = serializers.SerializerMethodField(help_text="当前所处阶段")
    next_stage = serializers.SerializerMethodField(help_text="当前阶段之后的下一阶段")

    class Meta:
        model = ProjectPlan
        fields = ["id", "title", "stages", "progress", "current_stage", "next_stage"]
        read_only_fields = fields

    def get_progress(self, obj) -> int:
        return project_services.plan_progress(obj)

    @extend_schema_field(ProjectStageSerializer)
    def get_current_stage(self, obj):
        stage = project_services.current_stage(obj)
        return ProjectStageSerializer(stage).data if stage else None

    @extend_schema_field(ProjectStageSerializer)
    def get_next_stage(self, obj):
        stage = project_services.next_stage(obj)
        return ProjectStageSerializer(stage).data if stage else None
