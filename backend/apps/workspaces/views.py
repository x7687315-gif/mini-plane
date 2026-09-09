"""Workspace 接口（docs/api/02-workspaces.md）。

权限模型（BACKEND_PLAN §4）：
- 解析与角色判定统一走 core.permissions.resolve_workspace（非成员 → 404 防枚举）；
- 角色不足 → PermissionDenied → 统一 403。
"""

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.workspaces import services
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from apps.workspaces.serializers import (
    WorkspaceMemberAddSerializer,
    WorkspaceMemberRoleSerializer,
    WorkspaceMemberSerializer,
    WorkspaceSerializer,
    WorkspaceWriteSerializer,
)
from core.pagination import StandardPagination
from core.permissions import resolve_workspace


def _require_role(role: int, threshold: int) -> None:
    if role < threshold:
        raise PermissionDenied()


@extend_schema(
    summary="工作区列表 / 创建",
    request=WorkspaceWriteSerializer,
    responses={200: WorkspaceSerializer(many=True), 201: WorkspaceSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workspace_list_create(request):
    """GET：仅返回我是成员的工作区；POST：创建并成为 ADMIN（02 契约）。"""
    if request.method == "GET":
        memberships = list(
            WorkspaceMember.objects.filter(user=request.user)
            .select_related("workspace")
            .order_by("-created_at")
        )
        role_by_workspace = {m.workspace_id: m.role for m in memberships}
        paginator = StandardPagination()
        page = paginator.paginate_queryset([m.workspace for m in memberships], request)
        data = [
            WorkspaceSerializer(w, context={"role": role_by_workspace.get(w.id)}).data for w in page
        ]
        return paginator.get_paginated_response(data)

    serializer = WorkspaceWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    workspace = services.create_workspace(request.user, **serializer.validated_data)
    body = WorkspaceSerializer(workspace, context={"role": WorkspaceRoles.ADMIN})
    return Response(body.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(summary="工作区详情", responses={200: WorkspaceSerializer}),
    patch=extend_schema(
        summary="修改工作区", request=WorkspaceWriteSerializer, responses={200: WorkspaceSerializer}
    ),
    delete=extend_schema(summary="删除工作区", responses={204: None}),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def workspace_detail(request, workspace_slug: str):
    """GET：成员可读；PATCH / DELETE：仅 Admin（非成员一律 404）。"""
    workspace, role = resolve_workspace(request.user, workspace_slug)

    if request.method == "GET":
        return Response(WorkspaceSerializer(workspace, context={"role": role}).data)

    _require_role(role, WorkspaceRoles.ADMIN)

    if request.method == "PATCH":
        serializer = WorkspaceWriteSerializer(workspace, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        workspace = services.update_workspace(workspace, **serializer.validated_data)
        return Response(WorkspaceSerializer(workspace, context={"role": role}).data)

    workspace.delete()  # 级联删除项目/成员/状态（D7：MVP 无软删除，契约已注明）
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    summary="工作区成员列表 / 添加",
    request=WorkspaceMemberAddSerializer,
    responses={200: WorkspaceMemberSerializer(many=True), 201: WorkspaceMemberSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def member_list_create(request, workspace_slug: str):
    """GET：成员可读；POST：按 email 添加，仅 Admin（02 契约）。"""
    workspace, role = resolve_workspace(request.user, workspace_slug)

    if request.method == "GET":
        queryset = workspace.members.select_related("user").all()
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(WorkspaceMemberSerializer(page, many=True).data)

    _require_role(role, WorkspaceRoles.ADMIN)
    serializer = WorkspaceMemberAddSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    member = services.add_member(workspace, **serializer.validated_data)
    return Response(WorkspaceMemberSerializer(member).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    patch=extend_schema(
        summary="修改成员角色",
        request=WorkspaceMemberRoleSerializer,
        responses={200: WorkspaceMemberSerializer},
    ),
    delete=extend_schema(summary="移除成员", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def member_detail(request, workspace_slug: str, member_id):
    """改角色 / 移除成员；仅 Admin。owner 不可动 + 至少保留一位 Admin。"""
    workspace, role = resolve_workspace(request.user, workspace_slug)
    _require_role(role, WorkspaceRoles.ADMIN)
    member = get_object_or_404(WorkspaceMember, workspace=workspace, id=member_id)

    if request.method == "PATCH":
        serializer = WorkspaceMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = services.change_role(workspace, member, serializer.validated_data["role"])
        return Response(WorkspaceMemberSerializer(member).data)

    services.remove_member(workspace, member)
    return Response(status=status.HTTP_204_NO_CONTENT)
