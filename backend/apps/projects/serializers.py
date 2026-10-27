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
    owner = serializers.UUIDField(source="owner_id", read_only=True)
    current_user_role = serializers.SerializerMethodField(
        help_text="当前请求用户的生效角色（20/15/5）"
    )

    class Meta:
        model = Project
        fields = [
            "id",
            "workspace",
            "owner",
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
    """创建 / 更新请求体。identifier 可省略（service 自动生成，个人版冷启动）；
    提供时唯一性（私人按 owner / 团队按 workspace）由 service 显式校验。"""

    identifier = serializers.CharField(
        max_length=5,
        validators=[identifier_validator],
        required=False,
        allow_blank=True,
        help_text="2-5 位大写字母数字，Task 前缀；省略则自动生成",
    )

    class Meta:
        model = Project
        fields = ["name", "identifier", "description"]

    def validate(self, attrs):
        # 空串统一视作「省略」：POST → 自动生成；PATCH → 不改动
        if attrs.get("identifier") == "":
            attrs.pop("identifier")
        return attrs


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


class ProjectShareSerializer(serializers.Serializer):
    """把私人工程显式加入一个团队工作区。"""

    workspace_id = serializers.UUIDField(help_text="目标工作区 id；必须是当前用户的 Member+ 工作区")


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
    workspace_slug = serializers.CharField(
        allow_null=True, help_text="团队工程归属 slug；私人工程为 null"
    )
    workspace_name = serializers.CharField(allow_null=True, help_text="团队工程名；私人工程为 null")
    total_tasks = serializers.IntegerField()
    open_tasks = serializers.IntegerField()
    done_tasks = serializers.IntegerField()
    started_tasks = serializers.IntegerField()
    progress = serializers.SerializerMethodField(
        help_text=(
            "0~100 整数（DOMAIN_MODEL §3 统一量纲）；有 Global Plan 时"
            "=Σ(weight×progress)/Σweight，否则=已完成/总数×100"
        )
    )
    progress_source = serializers.SerializerMethodField(
        help_text='"plan"（Stage 加权）或 "tasks"（任务完成率回退）——进度唯一计算来源的显式标注'
    )
    current_stage = serializers.SerializerMethodField(
        help_text="有 Plan 时为当前 Stage 名，否则回退 NOW 任务所在状态名"
    )
    now_task = serializers.CharField(allow_null=True, help_text="当前正在做的任务标题")
    now_task_id = serializers.UUIDField(
        allow_null=True,
        help_text="NOW 任务 id（点击直达任务抽屉）；语义与 now_task 同源，无则为 null",
    )
    next_task = serializers.CharField(allow_null=True, help_text="队列中下一个任务标题")
    today_logs = serializers.IntegerField(help_text="今日工程日志条数（Sprint 11）")
    agent_running = serializers.BooleanField(help_text="是否有运行中的 Agent 会话（Sprint 13）")
    last_activity = serializers.DateTimeField(allow_null=True)

    # ── Island V2 阶段 3：DONE / STEP / HOW（规格 §2 信息设计）─────────
    # DONE 必须来自**真实完成记录**：优先取最近完成的任务标题（视图注入，单次查询），
    # 没有标题时才回退为已完成计数。语义红线：Task 与 Worklog 不合并，
    # 所以这里**不**用最新日志结论冒充已完成任务。
    recent_done = serializers.SerializerMethodField(
        help_text="最近完成的任务标题（最多 3 条，真实记录；无则为空列表）"
    )
    latest_log = serializers.SerializerMethodField(
        help_text="最新工程日志：{title, summary, date}（实际做过什么、结论如何）"
    )
    # STEP / HOW 只来自 Agent 上报（运行中会话的 current_step / method_summary）
    agent_step = serializers.CharField(allow_null=True, help_text="Agent 当前执行步骤")
    agent_step_index = serializers.IntegerField(allow_null=True)
    agent_step_total = serializers.IntegerField(allow_null=True)
    agent_method = serializers.CharField(allow_null=True, help_text="Agent 执行方法简述")
    agent_session_title = serializers.CharField(allow_null=True, help_text="运行中 Agent 会话标题")

    def _plan_stages(self, obj):
        plan = getattr(obj, "plan", None)
        if plan is None:
            return []
        return list(plan.stages.all())  # prefetch 命中，无额外查询

    def get_recent_done(self, obj) -> list[str]:
        # 视图按项目批量取好后放进 context（一次查询，不是每项目一次）
        return list(self._extra(obj).get("recent_done", {}).get(str(obj.id), []))

    def get_latest_log(self, obj) -> dict | None:
        row = self._extra(obj).get("latest_log", {}).get(str(obj.id))
        if row is None:
            return None
        # updated_at 是视图合成 last_activity 用的内部字段，不进响应
        return {k: row[k] for k in ("title", "summary", "date") if k in row}

    def _extra(self, obj) -> dict:
        ctx = self.context or {}
        return {
            "recent_done": ctx.get("recent_done", {}),
            "latest_log": ctx.get("latest_log", {}),
        }

    def get_progress(self, obj) -> int:
        """0~100 整数（DOMAIN_MODEL §3：全 API 统一量纲，Plan 契约同步）。

        与 plan_progress（ProjectPlanSerializer）同一套加权规则；
        无 Stage / 零权重 → 回退任务完成率，progress_source 标注 "tasks"。
        """
        return self._progress_pair(obj)[1]

    def get_progress_source(self, obj) -> str:
        source, _ = self._progress_pair(obj)
        return source

    def _progress_pair(self, obj) -> tuple[str, int]:
        stages = self._plan_stages(obj)
        if stages:
            total_w = sum(s.weight for s in stages)
            if total_w > 0:
                weighted = sum(s.weight * s.progress for s in stages)
                return "plan", round(weighted / total_w)
        total = obj.total_tasks or 0
        if total <= 0:
            return "tasks", 0
        return "tasks", round((obj.done_tasks or 0) * 100 / total)

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
    """新增 / 修改 Stage 的请求体。is_current=true 时同 plan 其余阶段自动取消。

    `order` **不可写**（Phase 0 风险 R-05 收紧）：追加由 service 按"现有最大 +1"发号，
    重排（swap/shift）服务尚未提供；开放 order 会撞 `uniq_stage_order_per_plan` 唯一约束。
    """

    name = serializers.CharField(max_length=120)  # PATCH 由 partial=True 自然可选
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
