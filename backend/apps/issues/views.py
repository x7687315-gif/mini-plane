"""Issue / Label / Comment 接口（docs/api/04-issues.md、05-comments.md）。

权限：先 resolve_project 拿「生效角色」（非 WS 成员 → 404 防枚举），
再按契约的门槛判断——读 ≥ Viewer，写 ≥ Member，评论改删仅作者或 Admin。
"""

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.issues import services
from apps.issues.filters import apply_issue_filters, apply_issue_ordering
from apps.issues.serializers import (
    CommentSerializer,
    CommentWriteSerializer,
    IssueBulkLabelsSerializer,
    IssueSerializer,
    IssueWriteSerializer,
    LabelSerializer,
    LabelWriteSerializer,
)
from apps.jobs import services as job_services
from apps.jobs.serializers import TaskRunSerializer
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
    """GET：项目成员可读（过滤 / 搜索 / 排序 / 分页，见 04 契约）；POST：生效角色 ≥ Member。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)

    if request.method == "GET":
        queryset = apply_issue_filters(
            _issue_queryset(project), request.query_params, user=request.user
        )
        queryset = apply_issue_ordering(queryset, request.query_params.get("ordering"))
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
        issue = services.update_issue(issue, actor=request.user, **serializer.validated_data)
        return Response(IssueSerializer(issue).data)

    services.delete_issue(issue, actor=request.user)
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


@extend_schema(
    summary="评论列表 / 创建",
    request=CommentWriteSerializer,
    responses={200: CommentSerializer(many=True), 201: CommentSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def comment_list_create(request, workspace_slug: str, project_id, issue_id):
    """GET：项目成员可读（**时间正序**，评论区是对话）；POST：生效角色 ≥ Member。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    issue = get_object_or_404(project.issues.all(), id=issue_id)

    if request.method == "GET":
        queryset = issue.comments.select_related("author").all()
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response(CommentSerializer(page, many=True).data)

    _require_role(role, ProjectRoles.MEMBER)
    serializer = CommentWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    comment = services.create_comment(issue, request.user, **serializer.validated_data)
    return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    patch=extend_schema(
        summary="修改评论", request=CommentWriteSerializer, responses={200: CommentSerializer}
    ),
    delete=extend_schema(summary="删除评论", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def comment_detail(request, workspace_slug: str, project_id, issue_id, comment_id):
    """作者本人，或生效角色 = Admin（可管理他人评论）；其余 403（05 契约）。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    issue = get_object_or_404(project.issues.all(), id=issue_id)
    comment = get_object_or_404(issue.comments.select_related("author"), id=comment_id)

    if comment.author_id != request.user.id:
        _require_role(role, ProjectRoles.ADMIN)

    if request.method == "PATCH":
        # content 在编辑时同样是必填项（05 契约），因此不走 partial
        serializer = CommentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = services.update_comment(comment, **serializer.validated_data)
        return Response(CommentSerializer(comment).data)

    services.delete_comment(comment, actor=request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    summary="批量修改 Issue 标签（异步）",
    request=IssueBulkLabelsSerializer,
    responses={202: TaskRunSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def issue_bulk_labels(request, workspace_slug: str, project_id):
    """生效角色 ≥ Member。立即返回 **202 + task_id**，进度查 `GET …/tasks/{task_id}/`。

    请求体 `{"issue_ids": [...], "label_ids": [...]}`（覆盖式：label_ids 为空数组表示清空）。
    """
    project, role = resolve_project(request.user, workspace_slug, project_id)
    _require_role(role, ProjectRoles.MEMBER)
    serializer = IssueBulkLabelsSerializer(data=request.data, context={"project": project})
    serializer.is_valid(raise_exception=True)
    run = job_services.start_bulk_assign_labels(project, request.user, **serializer.validated_data)
    return Response(TaskRunSerializer(run).data, status=status.HTTP_202_ACCEPTED)
