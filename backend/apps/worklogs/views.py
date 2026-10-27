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
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.projects.models import ProjectRoles
from apps.worklogs import services
from apps.worklogs.serializers import WorklogSerializer, WorklogWriteSerializer
from core.pagination import StandardPagination
from core.permissions import require_role as _require_role
from core.permissions import resolve_project, resolve_project_by_id


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
    worklog = services.create_worklog(project, request.user, **serializer.validated_data)
    return Response(WorklogSerializer(worklog).data, status=status.HTTP_201_CREATED)


def _worklog_detail_impl(request, project, role, worklog_id):
    _require_role(role, ProjectRoles.MEMBER)
    worklog = get_object_or_404(project.worklogs.select_related("author", "stage"), id=worklog_id)

    if request.method == "DELETE":
        services.delete_worklog(worklog, actor=request.user, role=role)
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = WorklogWriteSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    worklog = services.update_worklog(
        worklog, actor=request.user, role=role, **serializer.validated_data
    )
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
    """GET：工程日志（倒序 date → created_at），?date=today 或 YYYY-MM-DD；POST ≥ Member。"""
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
