"""Project 接口（docs/api/03-projects.md）。

角色判定走 core.permissions.resolve_project（生效角色：项目成员 >
WS Admin 视同 > 其他 WS 成员只读 > 非 WS 成员 404）。
"""

from django.db.models import (
    CharField,
    Count,
    DateTimeField,
    Exists,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    UUIDField,
)
from django.db.models.functions import Coalesce
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.agents.models import AgentSession, AgentSessionStatus
from apps.issues.models import Issue, StateGroups
from apps.projects import cache as project_cache
from apps.projects import services
from apps.projects.models import Project, ProjectMember, ProjectRoles, ProjectStage
from apps.projects.serializers import (
    ProjectEngineeringSerializer,
    ProjectMemberAddSerializer,
    ProjectMemberRoleSerializer,
    ProjectMemberSerializer,
    ProjectPlanSerializer,
    ProjectSerializer,
    ProjectStageSerializer,
    ProjectStageWriteSerializer,
    ProjectWriteSerializer,
    StateSerializer,
)
from apps.worklogs.models import Worklog
from apps.workspaces.models import WorkspaceRoles
from core.pagination import StandardPagination
from core.permissions import (
    accessible_project_ids,
    get_effective_project_role_by_ids,
    resolve_project,
    resolve_project_by_id,
    resolve_workspace,
)
from core.permissions import (
    require_role as _require_role,
)


@extend_schema(
    summary="项目列表 / 创建（兼容路由，deprecated）",
    deprecated=True,
    request=ProjectWriteSerializer,
    responses={200: ProjectSerializer(many=True), 201: ProjectSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def project_list_create(request, workspace_slug: str):
    """兼容路由：WS 作用域内的项目列表 / 创建；与规范路由委托同一 service。"""
    workspace, workspace_role = resolve_workspace(request.user, workspace_slug)

    if request.method == "GET":
        return _project_list_response(workspace.projects.all(), request, workspace, workspace_role)

    if workspace_role < WorkspaceRoles.MEMBER:
        raise PermissionDenied()  # WS Viewer 不能创建项目（矩阵 §4.2）
    serializer = ProjectWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    project = services.create_project(
        request.user, workspace=workspace, **serializer.validated_data
    )
    body = ProjectSerializer(project, context={"role": ProjectRoles.ADMIN})
    return Response(body.data, status=status.HTTP_201_CREATED)


def _project_list_response(queryset, request, workspace=None, workspace_role=None):
    """项目列表的统一实现：批量算生效角色防 N+1（含 owner 短路）。"""
    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset.order_by("-created_at"), request)

    member_roles = dict(
        ProjectMember.objects.filter(user=request.user, project__in=page).values_list(
            "project_id", "role"
        )
    )
    data = []
    for project in page:
        if request.user.id == project.owner_id:
            role = ProjectRoles.ADMIN
        else:
            role = member_roles.get(project.id)
            if role is None:
                if project.workspace_id is None:
                    continue  # 私人工程非 owner 不会出现在查询集里；防御性跳过
                role = (
                    ProjectRoles.ADMIN
                    if workspace_role == WorkspaceRoles.ADMIN
                    else ProjectRoles.VIEWER
                )
        data.append(ProjectSerializer(project, context={"role": role}).data)
    return paginator.get_paginated_response(data)


@extend_schema(
    summary="工程列表 / 创建（规范路由）",
    description=(
        "个人优先（ADR-001）：GET 默认返回我拥有的工程（scope=owned，含已共享到团队的）；"
        "scope=accessible 返回我可访问的全部（含他人拥有的团队工程）。"
        "POST 默认创建私人工程（不需要 workspace）；"
        "传 workspace_id 则创建该团队的工程（需成员权限）。"
    ),
    request=ProjectWriteSerializer,
    responses={200: ProjectSerializer(many=True), 201: ProjectSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def project_list_create_canonical(request):
    from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles

    scope = request.query_params.get("scope", "owned")
    if scope == "accessible":
        queryset = Project.objects.filter(id__in=accessible_project_ids(request.user))
    else:
        # owned：我拥有的（无论私人还是已共享团队）
        queryset = Project.objects.filter(owner=request.user)

    if request.method == "GET":
        return _project_list_response(queryset, request)

    serializer = ProjectWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    workspace = None
    workspace_id = request.data.get("workspace_id")
    if workspace_id is not None:
        from django.core.exceptions import ObjectDoesNotExist
        from rest_framework.exceptions import ValidationError

        try:
            workspace = Workspace.objects.get(id=workspace_id)
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise ValidationError({"workspace_id": ["工作区不存在。"]}) from None
        # 显式共享进团队：要求请求者是该 WS 的 Member+（与兼容路由创建门槛一致）
        member_role = (
            WorkspaceMember.objects.filter(workspace=workspace, user=request.user)
            .values_list("role", flat=True)
            .first()
        )
        if member_role is None:
            raise ValidationError({"workspace_id": ["你不是该工作区成员。"]})
        if member_role < WorkspaceRoles.MEMBER:
            raise PermissionDenied()
    project = services.create_project(
        request.user, workspace=workspace, **serializer.validated_data
    )
    body = ProjectSerializer(project, context={"role": ProjectRoles.ADMIN})
    return Response(body.data, status=status.HTTP_201_CREATED)


def _project_detail_impl(request, project_id, resolve_fn, cache_scope_slug):
    """详情/改/删的统一实现。resolve_fn 是 () -> (project, role) 的惰性解析；
    cache_scope_slug 仅用于 GET 缓存键（兼容路由 = ws slug；规范路由 = None → 哨兵）。"""
    # 命中缓存的快路径：不加载 Project 行，但**鉴权仍然实时执行**
    # （成员被移除后缓存不能继续放行）。详见 apps/projects/cache.py 的模块说明。
    if request.method == "GET":
        cached = project_cache.get_detail(cache_scope_slug, project_id)
        if cached is not None:
            role = get_effective_project_role_by_ids(
                request.user,
                workspace_id=cached["workspace"],
                project_id=project_id,
                owner_id=cached.get("owner"),
            )
            if role is None:
                raise Http404  # 与冷路径一致：非成员一律 404（防枚举）
            return Response({**cached, "current_user_role": role})

    project, role = resolve_fn()

    if request.method == "GET":
        payload = project_cache.build_payload(project)
        project_cache.set_detail(cache_scope_slug, project.id, payload)
        return Response({**payload, "current_user_role": role})

    _require_role(role, ProjectRoles.ADMIN)

    if request.method == "PATCH":
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        project = services.update_project(project, actor=request.user, **serializer.validated_data)
        return Response(ProjectSerializer(project, context={"role": role}).data)

    # 先失效再删：双路由两种缓存键同时作废（见 cache.invalidate_all_scopes）
    project_cache.invalidate_all_scopes(
        project.id, workspace_slug=project.workspace.slug if project.workspace_id else None
    )
    project.delete()  # 级联删除成员/状态/Task/Worklog/Plan
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(summary="工程详情（规范路由）", responses={200: ProjectSerializer}),
    patch=extend_schema(
        summary="修改工程（规范路由）",
        request=ProjectWriteSerializer,
        responses={200: ProjectSerializer},
    ),
    delete=extend_schema(summary="删除工程（规范路由）", responses={204: None}),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def project_detail_canonical(request, project_id):
    """规范路由：私人/团队工程统一只凭 Project ID；owner 恒可访问（ADR-001）。

    缓存键取舍：团队工程在旧路径下以 ws slug 为键，规范路径不查 slug、统一用
    哨兵键——首次访问冷写入、后续命中；与旧路径缓存互不干扰（同一 payload，双份
    存储，任一路径的写失效会同时作废两种键，见 update/delete 的失效实现）。
    """

    return _project_detail_impl(
        request,
        project_id,
        lambda: resolve_project_by_id(request.user, project_id),
        None,
    )


@extend_schema_view(
    get=extend_schema(
        summary="项目详情（兼容路由，deprecated）",
        responses={200: ProjectSerializer},
        deprecated=True,
    ),
    patch=extend_schema(
        summary="修改项目（兼容路由，deprecated）",
        request=ProjectWriteSerializer,
        responses={200: ProjectSerializer},
        deprecated=True,
    ),
    delete=extend_schema(
        summary="删除项目（兼容路由，deprecated）", responses={204: None}, deprecated=True
    ),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def project_detail(request, workspace_slug: str, project_id):
    """兼容路由：与规范路由委托同一实现；缓存键沿用 ws slug。"""

    def resolver():
        return resolve_project(request.user, workspace_slug, project_id)

    return _project_detail_impl(request, project_id, resolver, workspace_slug)


@extend_schema(
    summary="项目成员列表 / 添加",
    request=ProjectMemberAddSerializer,
    responses={200: ProjectMemberSerializer(many=True), 201: ProjectMemberSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def project_member_list_create(request, workspace_slug: str, project_id):
    """GET：WS 成员可读；POST：仅项目 Admin（WS Admin 视同），被添加者须是 WS 成员。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)

    if request.method == "GET":
        queryset = project.members.select_related("user").all()
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(ProjectMemberSerializer(page, many=True).data)

    _require_role(role, ProjectRoles.ADMIN)
    serializer = ProjectMemberAddSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    member = services.add_member(project.workspace, project, **serializer.validated_data)
    return Response(ProjectMemberSerializer(member).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    patch=extend_schema(
        summary="修改项目成员角色",
        request=ProjectMemberRoleSerializer,
        responses={200: ProjectMemberSerializer},
    ),
    delete=extend_schema(summary="移除项目成员", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def project_member_detail(request, workspace_slug: str, project_id, member_id):
    """仅项目 Admin；移除后至少保留一位项目 Admin。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    _require_role(role, ProjectRoles.ADMIN)
    # get_object_or_404：member_id 不存在（或属于别的项目）→ 404；
    # 裸 .get() 会抛 DoesNotExist → 500，与契约「不存在 → 404」不符
    member = get_object_or_404(
        ProjectMember.objects.select_related("user"), id=member_id, project=project
    )

    if request.method == "PATCH":
        serializer = ProjectMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = services.change_role(project, member, serializer.validated_data["role"])
        return Response(ProjectMemberSerializer(member).data)

    services.remove_member(project, member)
    return Response(status=status.HTTP_204_NO_CONTENT)


def _state_list_impl(request, project):
    queryset = project.states.all()
    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    return paginator.get_paginated_response(StateSerializer(page, many=True).data)


@extend_schema(
    summary="状态列表（规范路由，预置五态只读）", responses={200: StateSerializer(many=True)}
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def state_list_canonical(request, project_id):
    return _state_list_impl(request, resolve_project_by_id(request.user, project_id)[0])


@extend_schema(
    summary="状态列表（兼容路由，deprecated）",
    deprecated=True,
    responses={200: StateSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def state_list(request, workspace_slug: str, project_id):
    return _state_list_impl(request, resolve_project(request.user, workspace_slug, project_id)[0])


# ── Sprint 09：我的工程（个人模式首页数据）──────────────────────────
# 「轻量且高效」约束：整页数据由**一条** SQL 产出（correlated subquery 做计数与
# NOW/NEXT 取值），不按项目循环查询，避免 N+1；SQLite 与 PostgreSQL 通用。

_OPEN_GROUPS = [StateGroups.BACKLOG, StateGroups.UNSTARTED, StateGroups.STARTED]
_QUEUED_GROUPS = [StateGroups.BACKLOG, StateGroups.UNSTARTED]


def _issue_count(*conds) -> Subquery:
    """该项目满足条件的 Issue 数（correlated count subquery）。"""
    return Subquery(
        Issue.objects.filter(*conds, project=OuterRef("pk"))
        .values("project")
        .annotate(c=Count("id"))
        .values("c")[:1],
        output_field=IntegerField(),
    )


def _issue_field(field: str, *conds, order: tuple[str, ...]) -> Subquery:
    """该项目满足条件的 Issue 中按 order 取第一条的某字段（NOW/NEXT/最近活动）。"""
    return Subquery(
        Issue.objects.filter(*conds, project=OuterRef("pk")).order_by(*order).values(field)[:1],
        output_field=CharField() if field in ("title", "state__name") else DateTimeField(),
    )


@extend_schema(
    summary="我的工程（跨项目工程摘要）",
    responses={200: ProjectEngineeringSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_projects_summary(request):
    """个人模式首页数据源（Sprint 09，PRODUCT_REFACTOR_PLAN §7）。

    返回当前用户可访问的每个项目的工程摘要：任务计数、进度、当前阶段、
    NOW（正在做）/ NEXT（队列下一个）、最近活动时间。Workspace 在此被"降级"为
    归属信息（slug/name），不再要求用户先理解工作区才能看到自己的工程。
    """
    started = Q(state__group=StateGroups.STARTED)
    opened = Q(state__group__in=_OPEN_GROUPS)
    queued = Q(state__group__in=_QUEUED_GROUPS)

    queryset = (
        Project.objects.filter(id__in=accessible_project_ids(request.user))
        .annotate(
            workspace_slug=F("workspace__slug"),
            workspace_name=F("workspace__name"),
            total_tasks=Coalesce(_issue_count(), 0, output_field=IntegerField()),
            done_tasks=Coalesce(
                _issue_count(Q(state__group=StateGroups.COMPLETED)), 0, output_field=IntegerField()
            ),
            open_tasks=Coalesce(_issue_count(opened), 0, output_field=IntegerField()),
            started_tasks=Coalesce(_issue_count(started), 0, output_field=IntegerField()),
            # NOW：优先取"进行中"里最近更新的；没有则退到任意未关闭里最近更新的
            now_task=Coalesce(
                _issue_field("title", started, order=("-updated_at",)),
                _issue_field("title", opened, order=("-updated_at",)),
                output_field=CharField(),
            ),
            # NOW 任务 id（Phase 5：首页「继续」行点击直达任务抽屉）；语义与 now_task 同源
            now_task_id=Coalesce(
                _issue_field("id", started, order=("-updated_at",)),
                _issue_field("id", opened, order=("-updated_at",)),
                output_field=UUIDField(),
            ),
            current_stage=Coalesce(
                _issue_field("state__name", started, order=("-updated_at",)),
                _issue_field("state__name", opened, order=("-updated_at",)),
                output_field=CharField(),
            ),
            # NEXT：队列（待规划/未开始）里最早的；没有则取进行中里最早的
            next_task=Coalesce(
                _issue_field("title", queued, order=("created_at",)),
                _issue_field("title", started, order=("created_at",)),
                output_field=CharField(),
            ),
            last_task_activity=_issue_field("updated_at", order=("-updated_at",)),
            # Sprint 11：今日工程日志条数（首页 Today 维度）
            today_logs=Coalesce(
                Subquery(
                    Worklog.objects.filter(project=OuterRef("pk"), date=timezone.localdate())
                    .values("project")
                    .annotate(c=Count("id"))
                    .values("c")[:1],
                    output_field=IntegerField(),
                ),
                0,
                output_field=IntegerField(),
            ),
            # Sprint 13：是否有运行中的 Agent 会话（首页 "AGENT · RUNNING" 角标）
            agent_running=Exists(
                AgentSession.objects.filter(
                    project=OuterRef("pk"), status=AgentSessionStatus.RUNNING
                )
            ),
            # Island V2 阶段 3：Agent 上报的 STEP / HOW（规格 §6.1）。
            # 取"最近开始的运行中会话"的四个字段 —— 同一项目可能有多轮会话，
            # 只有正在跑的那轮有步骤可言；没有运行中会话时全部为 NULL（界面显示"尚未记录"）。
            agent_step=_agent_field("current_step"),
            agent_step_index=_agent_field("step_index"),
            agent_step_total=_agent_field("step_total"),
            agent_method=_agent_field("method_summary"),
            agent_session_title=_agent_field("title"),
        )
        # Plan/Stages 用 prefetch 一次取回（2 条额外查询），供 progress/current_stage 优先读 Plan
        .prefetch_related("plan__stages")
        .order_by()  # last_activity 在 Python 侧合成（三元 max），见下
    )

    # Island V2 阶段 3：DONE 与最新日志用**两条批量查询**取回，再按项目分组。
    # 为什么不用 ArrayAgg：桌面版跑 SQLite，没有数组聚合；而"每项目一条查询"
    # 就是规格明令禁止的 N+1。两条查询 + Python 分组 = O(1) 次查询。
    projects = list(queryset)
    project_ids = [p.id for p in projects]
    recent_done = _recent_done_titles(project_ids)
    latest_log = _latest_logs(project_ids)

    # last_activity 唯一定义（DOMAIN_MODEL §3，Phase 0 修订）：
    # max(最新 Task.updated_at, 最新 Worklog.updated_at, Project.updated_at)。
    # 不在 SQL 里用 Greatest 合成：SQLite 标量 MAX 对 NULL 传播，跨引擎行为不一致，
    # Python 侧合成一次 O(n) 更诚实（n = 个人工程数量级）。
    for p in projects:
        log_row = latest_log.get(str(p.id))
        times = [
            t
            for t in (p.last_task_activity, log_row and log_row.get("updated_at"), p.updated_at)
            if t is not None
        ]
        p.last_activity = max(times) if times else None
    projects.sort(
        key=lambda p: (-(p.last_activity.timestamp() if p.last_activity else 0.0), p.name)
    )

    return Response(
        ProjectEngineeringSerializer(
            projects,
            many=True,
            context={"recent_done": recent_done, "latest_log": latest_log},
        ).data
    )


# ── Island V2 阶段 3：批量取 DONE / 最新日志（供 /projects/mine/ 使用）─────────


def _agent_field(field: str) -> Subquery:
    """最近一个**运行中** Agent 会话的指定字段；没有则为 NULL。"""
    return Subquery(
        AgentSession.objects.filter(project=OuterRef("pk"), status=AgentSessionStatus.RUNNING)
        .order_by("-started_at")
        .values(field)[:1],
        output_field=CharField()
        if field in ("current_step", "method_summary", "title")
        else IntegerField(),
    )


def _recent_done_titles(project_ids: list) -> dict[str, list[str]]:
    """每个项目最近完成的 3 个任务标题（真实完成记录，非日志结论）。

    一条查询取回所有项目的已完成任务，再在 Python 里按项目分组并各取前 3 条。
    """
    if not project_ids:
        return {}
    rows = (
        Issue.objects.filter(project_id__in=project_ids, state__group=StateGroups.COMPLETED)
        .order_by("project_id", "-updated_at")
        .values_list("project_id", "title")
    )
    out: dict[str, list[str]] = {}
    for pid, title in rows:
        bucket = out.setdefault(str(pid), [])
        if len(bucket) < 3:  # 每个项目只要最近 3 条，卡片放得下
            bucket.append(title)
    return out


def _latest_logs(project_ids: list) -> dict[str, dict]:
    """每个项目最新一条工程日志的标题与结论（实际做了什么）。

    额外带回 `updated_at` 供视图合成 last_activity（DOMAIN_MODEL §3）；
    序列化器输出时会剥掉这个内部字段。
    """
    if not project_ids:
        return {}
    rows = (
        Worklog.objects.filter(project_id__in=project_ids)
        .order_by("project_id", "-date", "-created_at")
        .values_list("project_id", "title", "summary", "date", "updated_at")
    )
    out: dict[str, dict] = {}
    for pid, title, summary, date, updated_at in rows:
        key = str(pid)
        if key in out:
            continue  # 已按 (project, -date) 排序，第一个就是最新
        out[key] = {
            "title": title,
            "summary": summary,
            "date": date.isoformat(),
            "updated_at": updated_at,
        }
    return out


# ── Sprint 10：Global Plan / Stage（PRODUCT_REFACTOR_PLAN §5/§6）──────────────


def _plan_detail_impl(request, project, role):
    """GET：Global Plan（stages 有序 + 总进度 + 当前/下一阶段）；读 ≥ Viewer。
    POST：追加一个 Stage；写 ≥ Member（§15：Global Plan 结构由人维护）。"""
    plan = services.get_or_create_plan(project)

    if request.method == "GET":
        return Response(ProjectPlanSerializer(plan).data)

    _require_role(role, ProjectRoles.MEMBER)
    serializer = ProjectStageWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    stage = services.add_stage(
        plan,
        name=v["name"],
        weight=v.get("weight", 1),
        progress=v.get("progress", 0),
        goal=v.get("goal", ""),
        is_current=v.get("is_current", False),
    )
    return Response(ProjectStageSerializer(stage).data, status=status.HTTP_201_CREATED)


@extend_schema(
    summary="Global Plan（读）/ 新增 Stage（规范路由）",
    request=ProjectStageWriteSerializer,
    responses={200: ProjectPlanSerializer, 201: ProjectStageSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def plan_detail_canonical(request, project_id):
    return _plan_detail_impl(request, *resolve_project_by_id(request.user, project_id))


@extend_schema(
    summary="Global Plan（读）/ 新增 Stage（兼容路由，deprecated）",
    deprecated=True,
    request=ProjectStageWriteSerializer,
    responses={200: ProjectPlanSerializer, 201: ProjectStageSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def plan_detail(request, workspace_slug: str, project_id):
    return _plan_detail_impl(request, *resolve_project(request.user, workspace_slug, project_id))


def _stage_detail_impl(request, project, role, stage_id):
    """改 / 删某个 Stage；写 ≥ Member。stage 必须属于该工程（否则 404 防枚举）。"""
    _require_role(role, ProjectRoles.MEMBER)
    stage = get_object_or_404(ProjectStage, id=stage_id, plan__project=project)

    if request.method == "PATCH":
        serializer = ProjectStageWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        stage = services.update_stage(stage, **serializer.validated_data)
        return Response(ProjectStageSerializer(stage).data)

    stage.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    patch=extend_schema(
        summary="修改 Stage（规范路由）",
        request=ProjectStageWriteSerializer,
        responses={200: ProjectStageSerializer},
    ),
    delete=extend_schema(summary="删除 Stage（规范路由）", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def stage_detail_canonical(request, project_id, stage_id):
    return _stage_detail_impl(request, *resolve_project_by_id(request.user, project_id), stage_id)


@extend_schema_view(
    patch=extend_schema(
        summary="修改 Stage（兼容路由，deprecated）",
        request=ProjectStageWriteSerializer,
        responses={200: ProjectStageSerializer},
        deprecated=True,
    ),
    delete=extend_schema(
        summary="删除 Stage（兼容路由，deprecated）", responses={204: None}, deprecated=True
    ),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def stage_detail(request, workspace_slug: str, project_id, stage_id):
    return _stage_detail_impl(
        request, *resolve_project(request.user, workspace_slug, project_id), stage_id
    )
