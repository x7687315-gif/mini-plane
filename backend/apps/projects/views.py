"""Project 接口（docs/api/03-projects.md）。

角色判定走 core.permissions.resolve_project（生效角色：项目成员 >
WS Admin 视同 > 其他 WS 成员只读 > 非 WS 成员 404）。
"""

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.projects import services
from apps.projects.models import ProjectMember, ProjectRoles
from apps.projects.serializers import (
    ProjectMemberAddSerializer,
    ProjectMemberRoleSerializer,
    ProjectMemberSerializer,
    ProjectSerializer,
    ProjectWriteSerializer,
    StateSerializer,
)
from apps.workspaces.models import WorkspaceRoles
from core.pagination import StandardPagination
from core.permissions import resolve_project, resolve_workspace


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
    """GET：WS 成员；PATCH / DELETE：生效角色 ≥ Admin（WS Admin 视同）。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)

    if request.method == "GET":
        return Response(ProjectSerializer(project, context={"role": role}).data)

    _require_role(role, ProjectRoles.ADMIN)

    if request.method == "PATCH":
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        project = services.update_project(project, **serializer.validated_data)
        return Response(ProjectSerializer(project, context={"role": role}).data)

    project.delete()  # 级联删除成员/状态/（后续）Issue
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
    member = ProjectMember.objects.select_related("user").get(id=member_id, project=project)

    if request.method == "PATCH":
        serializer = ProjectMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = services.change_role(member, serializer.validated_data["role"])
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
