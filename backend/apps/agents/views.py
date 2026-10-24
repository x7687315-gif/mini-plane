"""Agent Local API（Sprint 12，PRODUCT_REFACTOR_PLAN §12–§15/§24/§25）。

设计要点：
- **以工程动作为中心**（task.start / task.complete / worklog.create / progress.update），
  不是把整库 CRUD 暴露给 Agent；
- **Agent Token 与用户会话分离**：`Authorization: Bearer mpa_…`，权限白名单 scopes，
  绝不给 delete_workspace / manage_members / change_roles（§24）；
- **幂等**：带 `Idempotency-Key` 的写动作，重复请求回放首次响应（§25）；
- Agent 动作复用 issues/worklogs 的 service，**自动写 Activity 留痕**（§23 数据流）。
"""

import json

from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.agents import services as agent_services
from apps.agents.authentication import AgentTokenAuthentication
from apps.agents.models import (
    AgentScopes,
    AgentSession,
    AgentSessionStatus,
    AgentToken,
    IdempotencyRecord,
)
from apps.agents.serializers import (
    AgentProgressSerializer,
    AgentProjectSnapshotSerializer,
    AgentSessionEndSerializer,
    AgentSessionProgressSerializer,
    AgentSessionSerializer,
    AgentSessionStartSerializer,
    AgentTaskCreateSerializer,
    AgentTokenCreatedSerializer,
    AgentTokenCreateSerializer,
    AgentTokenSerializer,
    AgentWorklogCreateSerializer,
)
from apps.issues.models import Issue, StateGroups
from apps.issues.serializers import IssueSerializer
from apps.issues.services import create_issue, update_issue
from apps.projects.models import ProjectStage
from apps.projects.serializers import ProjectPlanSerializer, ProjectSerializer
from apps.projects.services import get_or_create_plan, update_stage
from apps.worklogs.models import Worklog, WorklogSource
from apps.worklogs.serializers import WorklogSerializer
from core.permissions import accessible_project_ids, resolve_project, resolve_project_by_id

IDEM_HEADER = "HTTP_IDEMPOTENCY_KEY"


def require_scope(request, scope: str) -> None:
    token = request.auth
    if token is None or scope not in (token.scopes or []):
        raise PermissionDenied(f"Agent Token 缺少权限：{scope}。")


def _resolve_agent_project(user, v):
    """按请求体定位工程（Phase 3 规范化）。

    有 workspace_slug → 旧双重作用域（兼容既有 Agent 调用）；
    没有 → 规范解析（私人工程也可被 Agent 访问，ADR-001）。
    不可见/不存在统一 404（防枚举）。
    """
    slug = v.get("workspace_slug")
    if slug:
        return resolve_project(user, slug, v["project_id"])
    return resolve_project_by_id(user, v["project_id"])


def _replay(request, action: str):
    """命中幂等键 → 直接回放首次响应；否则 None。"""
    key = request.META.get(IDEM_HEADER)
    token = request.auth
    if not key or not isinstance(token, AgentToken):
        return None
    rec = IdempotencyRecord.objects.filter(token=token, key=key, action=action).first()
    if rec is None:
        return None
    return Response(rec.response, status=rec.status_code)


def _remember(request, action: str, response: Response) -> Response:
    key = request.META.get(IDEM_HEADER)
    token = request.auth
    if key and isinstance(token, AgentToken):
        # response.data 里可能有 UUID/datetime 等原生对象，JSONField 默认编码器不认；
        # 用 DjangoJSONEncoder 落成与线上响应一致的 JSON 安全结构再存。
        payload = json.loads(json.dumps(response.data, cls=DjangoJSONEncoder))
        IdempotencyRecord.objects.get_or_create(
            token=token,
            key=key,
            action=action,
            defaults={"status_code": response.status_code, "response": payload},
        )
    return response


# ── Token 管理（用户会话，非 Agent）──────────────────────────────


@extend_schema(
    summary="Agent Token 列表 / 创建",
    request=AgentTokenCreateSerializer,
    responses={200: AgentTokenSerializer(many=True), 201: AgentTokenCreatedSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def agent_token_list_create(request):
    """GET 我的 Token 列表；POST 新建并**一次性**返回明文。"""
    if request.method == "GET":
        qs = request.user.agent_tokens.all()
        return Response(AgentTokenSerializer(qs, many=True).data)

    serializer = AgentTokenCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    token, raw = AgentToken.mint(
        request.user,
        name=serializer.validated_data["name"],
        scopes=serializer.validated_data.get("scopes"),
    )
    return Response(
        {"token": raw, "detail": AgentTokenSerializer(token).data},
        status=status.HTTP_201_CREATED,
    )


@extend_schema(summary="吊销 Agent Token", request=None, responses={200: AgentTokenSerializer})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def agent_token_revoke(request, token_id):
    token = get_object_or_404(AgentToken, id=token_id, owner=request.user)
    token.revoked_at = timezone.now()
    token.save(update_fields=["revoked_at"])
    return Response(AgentTokenSerializer(token).data)


# ── Agent 动作端点 ────────────────────────────────────────────

_AGENT_AUTH = [AgentTokenAuthentication]


def _agent_project_get_impl(request, project):
    require_scope(request, AgentScopes.READ_PROJECT)
    plan = get_or_create_plan(project)
    return Response(
        {"project": ProjectSerializer(project).data, "plan": ProjectPlanSerializer(plan).data}
    )


@extend_schema(
    summary="project.get：工程 + Global Plan 快照（规范路由）",
    operation_id="agent_project_get_canonical",
    responses={200: AgentProjectSnapshotSerializer},
)
@api_view(["GET"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_project_get_canonical(request, project_id):
    """规范路由：只凭 Project ID；私人工程对 owner 的 Token 可见（ADR-001）。"""
    return _agent_project_get_impl(request, resolve_project_by_id(request.user, project_id)[0])


@extend_schema(
    summary="project.get：项目 + Global Plan 快照（兼容路由，deprecated）",
    deprecated=True,
    responses={200: AgentProjectSnapshotSerializer},
)
@api_view(["GET"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_project_get(request, workspace_slug: str, project_id):
    """兼容路由：含 workspace slug 的旧路径，委托同一实现。"""
    return _agent_project_get_impl(
        request, resolve_project(request.user, workspace_slug, project_id)[0]
    )


@extend_schema(
    summary="task.create：建任务（幂等）",
    request=AgentTaskCreateSerializer,
    responses={201: IssueSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_task_create(request):
    """task.create：建任务（写 Activity）。幂等键防重复建。"""
    require_scope(request, AgentScopes.WRITE_TASK)
    cached = _replay(request, "task.create")
    if cached is not None:
        return cached

    serializer = AgentTaskCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    project, role = _resolve_agent_project(request.user, v)
    kwargs = {"title": v["title"], "description": v.get("description", "")}
    if v.get("priority"):
        kwargs["priority"] = v["priority"]
    issue = create_issue(project, request.user, **kwargs)
    resp = Response(IssueSerializer(issue).data, status=status.HTTP_201_CREATED)
    return _remember(request, "task.create", resp)


def _transition(request, issue_id, group: str, action: str):
    require_scope(request, AgentScopes.WRITE_TASK)
    cached = _replay(request, action)
    if cached is not None:
        return cached

    issue = (
        Issue.objects.filter(id=issue_id, project_id__in=accessible_project_ids(request.user))
        .select_related("project")
        .first()
    )
    if issue is None:
        return Response({"detail": "未找到。"}, status=status.HTTP_404_NOT_FOUND)
    state = issue.project.states.filter(group=group).order_by("sort_order").first()
    if state is None:
        raise ValidationError({"detail": f"项目缺少 group={group} 的状态。"})
    issue = update_issue(issue, actor=request.user, state=state)
    resp = Response(IssueSerializer(issue).data)
    return _remember(request, action, resp)


@extend_schema(summary="task.start：推进到进行中", request=None, responses={200: IssueSerializer})
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_task_start(request, issue_id):
    """task.start：把任务推进到「进行中」组的首个状态。"""
    return _transition(request, issue_id, StateGroups.STARTED, "task.start")


@extend_schema(
    summary="task.complete：推进到已完成", request=None, responses={200: IssueSerializer}
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_task_complete(request, issue_id):
    """task.complete：把任务推进到「已完成」组的首个状态。"""
    return _transition(request, issue_id, StateGroups.COMPLETED, "task.complete")


@extend_schema(
    summary="worklog.create：Agent 写工程日志（幂等）",
    request=AgentWorklogCreateSerializer,
    responses={201: WorklogSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_worklog_create(request):
    """worklog.create：Agent 写工程日志（source=agent）。"""
    require_scope(request, AgentScopes.WRITE_WORKLOG)
    cached = _replay(request, "worklog.create")
    if cached is not None:
        return cached

    serializer = AgentWorklogCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    project, _ = _resolve_agent_project(request.user, v)

    stage = None
    if v.get("stage_id"):
        stage = get_object_or_404(ProjectStage, id=v["stage_id"], plan__project=project)

    worklog = Worklog.objects.create(
        project=project,
        author=request.user,
        stage=stage,
        date=v.get("date") or timezone.localdate(),
        title=v["title"],
        summary=v["summary"],
        conclusion=v.get("conclusion", ""),
        next_step=v.get("next_step", ""),
        blocker=v.get("blocker", ""),
        source=WorklogSource.AGENT,
    )
    resp = Response(WorklogSerializer(worklog).data, status=status.HTTP_201_CREATED)
    return _remember(request, "worklog.create", resp)


def _agent_progress_update_impl(request, project):
    require_scope(request, AgentScopes.UPDATE_PROGRESS)
    cached = _replay(request, "progress.update")
    if cached is not None:
        return cached

    serializer = AgentProgressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    stage = get_object_or_404(ProjectStage, id=v["stage_id"], plan__project=project)

    fields = {}
    if "progress" in v:
        fields["progress"] = v["progress"]
    if v.get("set_current"):
        fields["is_current"] = True
    update_stage(stage, **fields)

    plan = get_or_create_plan(project)
    resp = Response(ProjectPlanSerializer(plan).data)
    return _remember(request, "progress.update", resp)


@extend_schema(
    summary="progress.update：改阶段进度 / 切当前阶段（规范路由，幂等）",
    operation_id="agent_progress_update_canonical",
    request=AgentProgressSerializer,
    responses={200: ProjectPlanSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_progress_update_canonical(request, project_id):
    return _agent_progress_update_impl(request, resolve_project_by_id(request.user, project_id)[0])


@extend_schema(
    summary="progress.update：改阶段进度 / 切当前阶段（兼容路由，deprecated，幂等）",
    deprecated=True,
    request=AgentProgressSerializer,
    responses={200: ProjectPlanSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_progress_update(request, workspace_slug: str, project_id):
    """兼容路由：含 workspace slug 的旧路径，委托同一实现。"""
    return _agent_progress_update_impl(
        request, resolve_project(request.user, workspace_slug, project_id)[0]
    )


# ── Sprint 13：Agent Session（开始/结束 + WebSocket 实时）──────────────


def _agent_session_list_impl(request, project):
    require_scope(request, AgentScopes.READ_PROJECT)
    qs = project.agent_sessions.select_related("token")
    if request.query_params.get("active") == "1":
        qs = qs.filter(status=AgentSessionStatus.RUNNING)
    return Response(AgentSessionSerializer(qs[:50], many=True).data)


@extend_schema(
    summary="agent.sessions：工程会话列表（规范路由，?active=1 只看运行中）",
    operation_id="agent_session_list_canonical",
    responses={200: AgentSessionSerializer(many=True)},
)
@api_view(["GET"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_list_canonical(request, project_id):
    return _agent_session_list_impl(request, resolve_project_by_id(request.user, project_id)[0])


@extend_schema(
    summary="agent.sessions：项目会话列表（兼容路由，deprecated）",
    deprecated=True,
    responses={200: AgentSessionSerializer(many=True)},
)
@api_view(["GET"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_list(request, workspace_slug: str, project_id):
    """兼容路由：含 workspace slug 的旧路径，委托同一实现。"""
    return _agent_session_list_impl(
        request, resolve_project(request.user, workspace_slug, project_id)[0]
    )


@extend_schema(
    summary="session.start：开始一次 Agent 运行（广播 agent.session）",
    request=AgentSessionStartSerializer,
    responses={201: AgentSessionSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_start(request):
    require_scope(request, AgentScopes.WRITE_TASK)
    cached = _replay(request, "session.start")
    if cached is not None:
        return cached

    serializer = AgentSessionStartSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    project, _ = _resolve_agent_project(request.user, v)
    task = None
    if v.get("task_id"):
        task = get_object_or_404(Issue, id=v["task_id"], project=project)

    session = agent_services.start_session(
        project=project, token=request.auth, title=v["title"], task=task
    )
    resp = Response(AgentSessionSerializer(session).data, status=status.HTTP_201_CREATED)
    return _remember(request, "session.start", resp)


@extend_schema(
    summary="session.end：结束会话（done/failed/stopped，广播 agent.session，幂等）",
    request=AgentSessionEndSerializer,
    responses={200: AgentSessionSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_end(request, session_id):
    """Phase 3 补齐幂等（Phase 0 风险 R-06）：与其余 7 个写动作一致，
    带 Idempotency-Key 的重复 end 直接回放首次响应。"""
    require_scope(request, AgentScopes.WRITE_TASK)
    cached = _replay(request, "session.end")
    if cached is not None:
        return cached

    session = get_object_or_404(
        AgentSession, id=session_id, project_id__in=accessible_project_ids(request.user)
    )
    serializer = AgentSessionEndSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    session = agent_services.end_session(
        session, status=v.get("status", AgentSessionStatus.DONE), note=v.get("note", "")
    )
    resp = Response(AgentSessionSerializer(session).data)
    return _remember(request, "session.end", resp)


@extend_schema(
    summary="session.progress：上报当前执行步骤与方法（Island V2 阶段 3）",
    request=AgentSessionProgressSerializer,
    responses={200: AgentSessionSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_progress(request, session_id):
    """Agent 上报 STEP / HOW（规格 §6.2）。

    四条硬约束，逐条对应规格：
    1. 认证走现有 Agent Token，scope 取现有的最小写权限（不新增 scope）；
    2. 会话必须属于该 token **有权访问的项目** —— 跨项目写入一律 404（防枚举）；
    3. **已结束的会话拒绝补写**（400）：否则步骤与运行时长会和事实矛盾；
    4. 遵守现有 `Idempotency-Key` 约定，重复上报直接回放首次响应。
    """
    require_scope(request, AgentScopes.WRITE_TASK)
    cached = _replay(request, "session.progress")
    if cached is not None:
        return cached

    session = get_object_or_404(
        AgentSession, id=session_id, project_id__in=accessible_project_ids(request.user)
    )
    if session.status != AgentSessionStatus.RUNNING:
        return Response(
            {"detail": f"会话已结束（{session.get_status_display()}），不能更新执行进度。"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = AgentSessionProgressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    session = agent_services.update_progress(session, **serializer.validated_data)
    resp = Response(AgentSessionSerializer(session).data)
    return _remember(request, "session.progress", resp)
