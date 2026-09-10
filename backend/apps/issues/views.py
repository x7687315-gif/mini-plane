"""Issue / Label 接口（docs/api/04-issues.md）。

权限：先 resolve_project 拿「生效角色」（非 WS 成员 → 404 防枚举），
再按 04 契约的门槛判断——读 ≥ Viewer，写 ≥ Member。
"""

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.issues import services
from apps.issues.filters import apply_ordering
from apps.issues.serializers import (
    IssueSerializer,
    IssueWriteSerializer,
    LabelSerializer,
    LabelWriteSerializer,
)
from apps.projects.models import ProjectRoles
from core.pagination import StandardPagination
from core.permissions import resolve_project


def _require_role(role: int, threshold: int) -> None:
    if role < threshold:
        raise PermissionDenied()


def _issue_queryset(project):
    """列表/详情共用的查询集：一次把 state/assignee/created_by 与 labels 取全，防 N+1。"""
    return project.issues.select_related("state", "assignee", "created_by").prefetch_related(
        "labels"
    )


@extend_schema(
    summary="Issue 列表 / 创建",
    request=IssueWriteSerializer,
    responses={200: IssueSerializer(many=True), 201: IssueSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def issue_list_create(request, workspace_slug: str, project_id):
    """GET：项目成员可读（支持 page/per_page/ordering）；POST：生效角色 ≥ Member。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)

    if request.method == "GET":
        queryset = apply_ordering(_issue_queryset(project), request.query_params.get("ordering"))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(IssueSerializer(page, many=True).data)

    _require_role(role, ProjectRoles.MEMBER)
    serializer = IssueWriteSerializer(data=request.data, context={"project": project})
    serializer.is_valid(raise_exception=True)
    issue = services.create_issue(project, request.user, **serializer.validated_data)
    return Response(IssueSerializer(issue).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(summary="Issue 详情", responses={200: IssueSerializer}),
    patch=extend_schema(
        summary="修改 Issue", request=IssueWriteSerializer, responses={200: IssueSerializer}
    ),
    delete=extend_schema(summary="删除 Issue", responses={204: None}),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def issue_detail(request, workspace_slug: str, project_id, issue_id):
    """GET：项目成员；PATCH / DELETE：生效角色 ≥ Member。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    issue = get_object_or_404(_issue_queryset(project), id=issue_id)

    if request.method == "GET":
        return Response(IssueSerializer(issue).data)

    _require_role(role, ProjectRoles.MEMBER)

    if request.method == "PATCH":
        serializer = IssueWriteSerializer(
            issue, data=request.data, partial=True, context={"project": project}
        )
        serializer.is_valid(raise_exception=True)
        issue = services.update_issue(issue, **serializer.validated_data)
        return Response(IssueSerializer(issue).data)

    services.delete_issue(issue)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    summary="Label 列表 / 创建",
    request=LabelWriteSerializer,
    responses={200: LabelSerializer(many=True), 201: LabelSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def label_list_create(request, workspace_slug: str, project_id):
    """GET：项目成员可读；POST：生效角色 ≥ Member。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)

    if request.method == "GET":
        paginator = StandardPagination()
        page = paginator.paginate_queryset(project.labels.all(), request)
        return paginator.get_paginated_response(LabelSerializer(page, many=True).data)

    _require_role(role, ProjectRoles.MEMBER)
    serializer = LabelWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    label = services.create_label(project, **serializer.validated_data)
    return Response(LabelSerializer(label).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    patch=extend_schema(
        summary="修改标签", request=LabelWriteSerializer, responses={200: LabelSerializer}
    ),
    delete=extend_schema(summary="删除标签", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def label_detail(request, workspace_slug: str, project_id, label_id):
    """改 name / color 或删除；生效角色 ≥ Member。删除标签不影响已引用它的 Issue。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    _require_role(role, ProjectRoles.MEMBER)
    label = get_object_or_404(project.labels.all(), id=label_id)

    if request.method == "PATCH":
        serializer = LabelWriteSerializer(label, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        label = services.update_label(label, **serializer.validated_data)
        return Response(LabelSerializer(label).data)

    services.delete_label(label)
    return Response(status=status.HTTP_204_NO_CONTENT)
