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
from core.permissions import accessible_project_ids, resolve_project

IDEM_HEADER = "HTTP_IDEMPOTENCY_KEY"


def require_scope(request, scope: str) -> None:
    token = request.auth
    if token is None or scope not in (token.scopes or []):
        raise PermissionDenied(f"Agent Token 缺少权限：{scope}。")


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


@extend_schema(
    summary="project.get：项目 + Global Plan 快照", responses={200: AgentProjectSnapshotSerializer}
)
@api_view(["GET"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_project_get(request, workspace_slug: str, project_id):
    """project.get：项目 + Global Plan 快照。"""
    require_scope(request, AgentScopes.READ_PROJECT)
    project, _ = resolve_project(request.user, workspace_slug, project_id)
    plan = get_or_create_plan(project)
    return Response(
        {"project": ProjectSerializer(project).data, "plan": ProjectPlanSerializer(plan).data}
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
    project, role = resolve_project(request.user, v["workspace_slug"], v["project_id"])
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
    project, _ = resolve_project(request.user, v["workspace_slug"], v["project_id"])

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


@extend_schema(
    summary="progress.update：改阶段进度 / 切当前阶段（幂等）",
    request=AgentProgressSerializer,
    responses={200: ProjectPlanSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_progress_update(request, workspace_slug: str, project_id):
    """progress.update / stage.update：改某阶段进度或切换当前阶段。"""
    require_scope(request, AgentScopes.UPDATE_PROGRESS)
    cached = _replay(request, "progress.update")
    if cached is not None:
        return cached

    project, _ = resolve_project(request.user, workspace_slug, project_id)
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


# ── Sprint 13：Agent Session（开始/结束 + WebSocket 实时）──────────────


@extend_schema(
    summary="agent.sessions：项目会话列表（?active=1 只看运行中）",
    responses={200: AgentSessionSerializer(many=True)},
)
@api_view(["GET"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_list(request, workspace_slug: str, project_id):
    require_scope(request, AgentScopes.READ_PROJECT)
    project, _ = resolve_project(request.user, workspace_slug, project_id)
    qs = project.agent_sessions.select_related("token")
    if request.query_params.get("active") == "1":
        qs = qs.filter(status=AgentSessionStatus.RUNNING)
    return Response(AgentSessionSerializer(qs[:50], many=True).data)


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
    project, _ = resolve_project(request.user, v["workspace_slug"], v["project_id"])
    task = None
    if v.get("task_id"):
        task = get_object_or_404(Issue, id=v["task_id"], project=project)

    session = agent_services.start_session(
        project=project, token=request.auth, title=v["title"], task=task
    )
    resp = Response(AgentSessionSerializer(session).data, status=status.HTTP_201_CREATED)
    return _remember(request, "session.start", resp)


@extend_schema(
    summary="session.end：结束会话（done/failed/stopped，广播 agent.session）",
    request=AgentSessionEndSerializer,
    responses={200: AgentSessionSerializer},
)
@api_view(["POST"])
@authentication_classes(_AGENT_AUTH)
@permission_classes([IsAuthenticated])
def agent_session_end(request, session_id):
    require_scope(request, AgentScopes.WRITE_TASK)
    session = get_object_or_404(
        AgentSession, id=session_id, project_id__in=accessible_project_ids(request.user)
    )
    serializer = AgentSessionEndSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    session = agent_services.end_session(
        session, status=v.get("status", AgentSessionStatus.DONE), note=v.get("note", "")
    )
    return Response(AgentSessionSerializer(session).data)
