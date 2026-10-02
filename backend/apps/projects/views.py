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
    resolve_workspace,
)


def _require_role(role: int, threshold: int) -> None:
    if role < threshold:
        raise PermissionDenied()


@extend_schema(
    summary="项目列表 / 创建",
    request=ProjectWriteSerializer,
    responses={200: ProjectSerializer(many=True), 201: ProjectSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def project_list_create(request, workspace_slug: str):
    """GET：WS 成员可见全部项目（批量算生效角色防 N+1）；POST：WS Member+ 可创建。"""
    workspace, workspace_role = resolve_workspace(request.user, workspace_slug)

    if request.method == "GET":
        paginator = StandardPagination()
        page = paginator.paginate_queryset(workspace.projects.all(), request)

        member_roles = dict(
            ProjectMember.objects.filter(user=request.user, project__in=page).values_list(
                "project_id", "role"
            )
        )
        data = []
        for project in page:
            role = member_roles.get(project.id)
            if role is None:
                role = (
                    ProjectRoles.ADMIN
                    if workspace_role == WorkspaceRoles.ADMIN
                    else ProjectRoles.VIEWER
                )
            data.append(ProjectSerializer(project, context={"role": role}).data)
        return paginator.get_paginated_response(data)

    if workspace_role < WorkspaceRoles.MEMBER:
        raise PermissionDenied()  # WS Viewer 不能创建项目（矩阵 §4.2）
    serializer = ProjectWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    project = services.create_project(workspace, request.user, **serializer.validated_data)
    body = ProjectSerializer(project, context={"role": ProjectRoles.ADMIN})
    return Response(body.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(summary="项目详情", responses={200: ProjectSerializer}),
    patch=extend_schema(
        summary="修改项目", request=ProjectWriteSerializer, responses={200: ProjectSerializer}
    ),
    delete=extend_schema(summary="删除项目", responses={204: None}),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def project_detail(request, workspace_slug: str, project_id):
    """GET：WS 成员（走缓存，见 apps/projects/cache.py）；PATCH / DELETE：生效角色 ≥ Admin。"""
    # 命中缓存的快路径：不加载 Project 行，但**鉴权仍然实时执行**
    # （成员被移除后缓存不能继续放行）。详见 apps/projects/cache.py 的模块说明。
    if request.method == "GET":
        cached = project_cache.get_detail(workspace_slug, project_id)
        if cached is not None:
            role = get_effective_project_role_by_ids(
                request.user, workspace_id=cached["workspace"], project_id=project_id
            )
            if role is None:
                raise Http404  # 与冷路径一致：非成员一律 404（防枚举）
            return Response({**cached, "current_user_role": role})

    project, role = resolve_project(request.user, workspace_slug, project_id)

    if request.method == "GET":
        payload = project_cache.build_payload(project)
        project_cache.set_detail(workspace_slug, project.id, payload)
        return Response({**payload, "current_user_role": role})

    _require_role(role, ProjectRoles.ADMIN)

    if request.method == "PATCH":
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        project = services.update_project(project, actor=request.user, **serializer.validated_data)
        return Response(ProjectSerializer(project, context={"role": role}).data)

    # 先失效再删：删完就拿不到 workspace slug 了
    project_cache.invalidate(project.id, workspace_slug=workspace_slug)
    project.delete()  # 级联删除成员/状态/Issue
    return Response(status=status.HTTP_204_NO_CONTENT)


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


@extend_schema(summary="状态列表（预置五态，只读）", responses={200: StateSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def state_list(request, workspace_slug: str, project_id):
    project, _ = resolve_project(request.user, workspace_slug, project_id)
    queryset = project.states.all()
    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    return paginator.get_paginated_response(StateSerializer(page, many=True).data)


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
            last_activity=_issue_field("updated_at", order=("-updated_at",)),
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
        )
        # Plan/Stages 用 prefetch 一次取回（2 条额外查询），供 progress/current_stage 优先读 Plan
        .prefetch_related("plan__stages")
        .order_by("-last_activity", "name")
    )

    return Response(ProjectEngineeringSerializer(queryset, many=True).data)


# ── Sprint 10：Global Plan / Stage（PRODUCT_REFACTOR_PLAN §5/§6）──────────────


@extend_schema(
    summary="Global Plan（读）/ 新增 Stage（写）",
    request=ProjectStageWriteSerializer,
    responses={200: ProjectPlanSerializer, 201: ProjectStageSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def plan_detail(request, workspace_slug: str, project_id):
    """GET：项目 Global Plan（stages 有序 + 总进度 + 当前/下一阶段）；读 ≥ Viewer。
    POST：追加一个 Stage；写 ≥ Member（§15：Global Plan 结构由人维护）。
    """
    project, role = resolve_project(request.user, workspace_slug, project_id)
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
        order=v.get("order"),
        weight=v.get("weight", 1),
        progress=v.get("progress", 0),
        goal=v.get("goal", ""),
        is_current=v.get("is_current", False),
    )
    return Response(ProjectStageSerializer(stage).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    patch=extend_schema(
        summary="修改 Stage",
        request=ProjectStageWriteSerializer,
        responses={200: ProjectStageSerializer},
    ),
    delete=extend_schema(summary="删除 Stage", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def stage_detail(request, workspace_slug: str, project_id, stage_id):
    """改 / 删某个 Stage；写 ≥ Member。stage 必须属于该项目（否则 404 防枚举）。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    _require_role(role, ProjectRoles.MEMBER)
    stage = get_object_or_404(ProjectStage, id=stage_id, plan__project=project)

    if request.method == "PATCH":
        serializer = ProjectStageWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        stage = services.update_stage(stage, **serializer.validated_data)
        return Response(ProjectStageSerializer(stage).data)

    stage.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
