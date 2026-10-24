"""Worklog 接口（Sprint 11，PRODUCT_REFACTOR_PLAN §10/§11）。

Phase 3 双路由：规范 `/api/v1/projects/{pid}/worklogs/…` + 兼容
`/workspaces/{ws}/projects/{pid}/worklogs/…`（委托同一实现）。
权限沿用项目作用域：读 ≥ Viewer，写 ≥ Member；stage 跨项目 → 404 防越权。
"""

from datetime import date as date_type

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.projects.models import ProjectRoles, ProjectStage
from apps.worklogs.models import Worklog
from apps.worklogs.serializers import WorklogSerializer, WorklogWriteSerializer
from core.pagination import StandardPagination
from core.permissions import resolve_project, resolve_project_by_id


def _require_role(role: int, threshold: int) -> None:
    if role < threshold:
        raise PermissionDenied()


def _resolve_stage(project, stage_id):
    """stage 必须属于该工程；属于别的工程 → 404（防跨项目越权/枚举）。"""
    if stage_id is None:
        return None
    return get_object_or_404(ProjectStage, id=stage_id, plan__project=project)


def _worklog_list_create_impl(request, project, role):
    if request.method == "GET":
        queryset = project.worklogs.select_related("author", "stage")
        raw = request.query_params.get("date")
        if raw == "today":
            queryset = queryset.filter(date=timezone.localdate())
        elif raw:
            try:
                queryset = queryset.filter(date=date_type.fromisoformat(raw))
            except ValueError:
                return Response(
                    {"date": ["日期格式应为 YYYY-MM-DD 或 today。"]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(WorklogSerializer(page, many=True).data)

    _require_role(role, ProjectRoles.MEMBER)
    serializer = WorklogWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    stage = _resolve_stage(project, v.get("stage_id"))
    worklog = Worklog.objects.create(
        project=project,
        author=request.user,
        stage=stage,
        date=v.get("date") or timezone.localdate(),
        title=v["title"],
        summary=v["summary"],
        details=v.get("details", ""),
        conclusion=v.get("conclusion", ""),
        next_step=v.get("next_step", ""),
        blocker=v.get("blocker", ""),
        source=v.get("source", "manual"),
    )
    return Response(WorklogSerializer(worklog).data, status=status.HTTP_201_CREATED)


def _worklog_detail_impl(request, project, role, worklog_id):
    _require_role(role, ProjectRoles.MEMBER)
    worklog = get_object_or_404(project.worklogs, id=worklog_id)

    if request.method == "DELETE":
        worklog.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = WorklogWriteSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    v = serializer.validated_data
    if "stage_id" in v:
        worklog.stage = _resolve_stage(project, v.get("stage_id"))
    for field in ("title", "summary", "details", "conclusion", "next_step", "blocker", "source"):
        if field in v:
            setattr(worklog, field, v[field])
    if v.get("date"):
        worklog.date = v["date"]
    worklog.save()
    return Response(WorklogSerializer(worklog).data)


# ── 规范路由（/api/v1/projects/{pid}/worklogs/…）───────────────────


@extend_schema(
    summary="工程日志列表 / 创建（规范路由）",
    request=WorklogWriteSerializer,
    responses={200: WorklogSerializer(many=True), 201: WorklogSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def worklog_list_create_canonical(request, project_id):
    """GET：工程日志（倒序 date → created_at），支持 ?date=today 或 ?date=YYYY-MM-DD；POST ≥ Member。"""
    return _worklog_list_create_impl(request, *resolve_project_by_id(request.user, project_id))


@extend_schema_view(
    patch=extend_schema(
        summary="修改工程日志（规范路由）",
        request=WorklogWriteSerializer,
        responses={200: WorklogSerializer},
    ),
    delete=extend_schema(summary="删除工程日志（规范路由）", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def worklog_detail_canonical(request, project_id, worklog_id):
    return _worklog_detail_impl(
        request, *resolve_project_by_id(request.user, project_id), worklog_id
    )


# ── 兼容路由（/workspaces/{ws}/projects/{pid}/worklogs/…，deprecated）──


@extend_schema(
    summary="工程日志列表 / 创建（兼容路由，deprecated）",
    deprecated=True,
    request=WorklogWriteSerializer,
    responses={200: WorklogSerializer(many=True), 201: WorklogSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def worklog_list_create(request, workspace_slug: str, project_id):
    return _worklog_list_create_impl(
        request, *resolve_project(request.user, workspace_slug, project_id)
    )


@extend_schema_view(
    patch=extend_schema(
        summary="修改工程日志（兼容路由，deprecated）",
        request=WorklogWriteSerializer,
        responses={200: WorklogSerializer},
        deprecated=True,
    ),
    delete=extend_schema(
        summary="删除工程日志（兼容路由，deprecated）", responses={204: None}, deprecated=True
    ),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def worklog_detail(request, workspace_slug: str, project_id, worklog_id):
    return _worklog_detail_impl(
        request, *resolve_project(request.user, workspace_slug, project_id), worklog_id
    )
