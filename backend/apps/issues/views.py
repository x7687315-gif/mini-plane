"""Task（历史名 Issue）/ Label / Comment 接口。

路由形态（Phase 3 契约统一）：
- **规范路由**：`/api/v1/projects/{pid}/tasks/…`（个人优先，无需 workspace）；
- **兼容路由**：`/workspaces/{ws}/projects/{pid}/issues/…`（旧 URL，deprecated）。

两种路由只差「作用域解析」（resolve_project_by_id vs resolve_project），
业务体全部在 `_impl` 函数里，同一份实现（计划 §3.4：兼容层薄、可测、可退役）。
权限：读 ≥ Viewer，写 ≥ Member，评论改删仅作者或 Admin；非可见一律 404 防枚举。
"""

from django.db.models import Q
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.issues import services
from apps.issues.filters import apply_issue_filters, apply_issue_ordering
from apps.issues.models import Issue
from apps.issues.serializers import (
    CommentSerializer,
    CommentWriteSerializer,
    IssueBulkLabelsSerializer,
    IssueSerializer,
    IssueWriteSerializer,
    LabelSerializer,
    LabelWriteSerializer,
    MyIssueSerializer,
)
from apps.jobs import services as job_services
from apps.jobs.serializers import TaskRunSerializer
from apps.projects.models import ProjectRoles
from core.pagination import StandardPagination
from core.permissions import accessible_project_ids, resolve_project, resolve_project_by_id
from core.permissions import require_role as _require_role


def _issue_queryset(project):
    """列表/详情共用的查询集：一次把 state/assignee/created_by/stage 与 labels 取全，防 N+1。"""
    return project.issues.select_related(
        "state", "assignee", "created_by", "stage"
    ).prefetch_related("labels")


# ── 列表 / 创建 ─────────────────────────────────────────────────


def _task_list_create_impl(request, project, role):
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


@extend_schema(
    summary="Task 列表 / 创建（规范路由）",
    description="对外统一 Task 命名；对应历史模型 Issue（DOMAIN_MODEL §1）。",
    request=IssueWriteSerializer,
    responses={200: IssueSerializer(many=True), 201: IssueSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def task_list_create(request, project_id):
    project, role = resolve_project_by_id(request.user, project_id)
    return _task_list_create_impl(request, project, role)


@extend_schema(
    summary="Issue 列表 / 创建（兼容路由，deprecated）",
    deprecated=True,
    request=IssueWriteSerializer,
    responses={200: IssueSerializer(many=True), 201: IssueSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def issue_list_create(request, workspace_slug: str, project_id):
    """兼容路由：与规范路由 `/api/v1/projects/{pid}/tasks/` 委托同一实现。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _task_list_create_impl(request, project, role)


# ── 我的工作（跨项目聚合）───────────────────────────────────────


@extend_schema(
    summary="我的工作（跨项目聚合）",
    responses={200: MyIssueSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_issues(request):
    """跨用户可访问的工程，聚合「指派给我 / 我创建的」Task。

    `scope`：`assigned`（指派给我）| `created`（我创建）| `all`（默认，二者并集）。
    可见性沿用 `accessible_project_ids`（owner / ProjectMember / WS 成员），与单项目读取同一套规则；
    排序按创建时间倒序，分页沿用 StandardPagination。
    """
    scope = request.query_params.get("scope", "all")
    qs = (
        Issue.objects.filter(project_id__in=accessible_project_ids(request.user))
        .select_related("project__workspace", "state", "assignee", "created_by", "stage")
        .prefetch_related("labels")
    )
    if scope == "assigned":
        qs = qs.filter(assignee=request.user)
    elif scope == "created":
        qs = qs.filter(created_by=request.user)
    else:
        qs = qs.filter(Q(assignee=request.user) | Q(created_by=request.user))

    qs = qs.order_by("-created_at", "-sequence_id")
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    return paginator.get_paginated_response(MyIssueSerializer(page, many=True).data)


# ── 详情 / 修改 / 删除 ──────────────────────────────────────────


def _task_detail_impl(request, project, role, issue_id):
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


@extend_schema_view(
    get=extend_schema(summary="Task 详情（规范路由）", responses={200: IssueSerializer}),
    patch=extend_schema(
        summary="修改 Task（规范路由）",
        request=IssueWriteSerializer,
        responses={200: IssueSerializer},
    ),
    delete=extend_schema(summary="删除 Task（规范路由）", responses={204: None}),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def task_detail(request, project_id, task_id):
    return _task_detail_impl(request, *resolve_project_by_id(request.user, project_id), task_id)


@extend_schema_view(
    get=extend_schema(
        summary="Issue 详情（兼容路由，deprecated）",
        responses={200: IssueSerializer},
        deprecated=True,
    ),
    patch=extend_schema(
        summary="修改 Issue（兼容路由，deprecated）",
        request=IssueWriteSerializer,
        responses={200: IssueSerializer},
        deprecated=True,
    ),
    delete=extend_schema(
        summary="删除 Issue（兼容路由，deprecated）", responses={204: None}, deprecated=True
    ),
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def issue_detail(request, workspace_slug: str, project_id, issue_id):
    """兼容路由：与规范路由 `/api/v1/projects/{pid}/tasks/{tid}/` 委托同一实现。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _task_detail_impl(request, project, role, issue_id)


# ── Label ───────────────────────────────────────────────────────


def _label_list_create_impl(request, project, role):
    if request.method == "GET":
        paginator = StandardPagination()
        page = paginator.paginate_queryset(project.labels.all(), request)
        return paginator.get_paginated_response(LabelSerializer(page, many=True).data)

    _require_role(role, ProjectRoles.MEMBER)
    serializer = LabelWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    label = services.create_label(project, **serializer.validated_data)
    return Response(LabelSerializer(label).data, status=status.HTTP_201_CREATED)


@extend_schema(
    summary="Label 列表 / 创建（规范路由）",
    request=LabelWriteSerializer,
    responses={200: LabelSerializer(many=True), 201: LabelSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def label_list_create_canonical(request, project_id):
    project, role = resolve_project_by_id(request.user, project_id)
    return _label_list_create_impl(request, project, role)


@extend_schema(
    summary="Label 列表 / 创建（兼容路由，deprecated）",
    deprecated=True,
    request=LabelWriteSerializer,
    responses={200: LabelSerializer(many=True), 201: LabelSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def label_list_create(request, workspace_slug: str, project_id):
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _label_list_create_impl(request, project, role)


def _label_detail_impl(request, project, role, label_id):
    _require_role(role, ProjectRoles.MEMBER)
    label = get_object_or_404(project.labels.all(), id=label_id)

    if request.method == "PATCH":
        serializer = LabelWriteSerializer(label, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        label = services.update_label(label, **serializer.validated_data)
        return Response(LabelSerializer(label).data)

    services.delete_label(label)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    patch=extend_schema(
        summary="修改标签（规范路由）",
        request=LabelWriteSerializer,
        responses={200: LabelSerializer},
    ),
    delete=extend_schema(summary="删除标签（规范路由）", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def label_detail_canonical(request, project_id, label_id):
    project, role = resolve_project_by_id(request.user, project_id)
    return _label_detail_impl(request, project, role, label_id)


@extend_schema_view(
    patch=extend_schema(
        summary="修改标签（兼容路由，deprecated）",
        request=LabelWriteSerializer,
        responses={200: LabelSerializer},
        deprecated=True,
    ),
    delete=extend_schema(
        summary="删除标签（兼容路由，deprecated）", responses={204: None}, deprecated=True
    ),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def label_detail(request, workspace_slug: str, project_id, label_id):
    """兼容路由：改 name / color 或删除；删除标签不影响已引用它的 Task。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _label_detail_impl(request, project, role, label_id)


# ── Comment ─────────────────────────────────────────────────────


def _comment_list_create_impl(request, project, role, issue_id):
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


@extend_schema(
    summary="Task 评论列表 / 创建（规范路由，时间正序）",
    request=CommentWriteSerializer,
    responses={200: CommentSerializer(many=True), 201: CommentSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def comment_list_create_canonical(request, project_id, task_id):
    project, role = resolve_project_by_id(request.user, project_id)
    return _comment_list_create_impl(request, project, role, task_id)


@extend_schema(
    summary="评论列表 / 创建（兼容路由，deprecated）",
    deprecated=True,
    request=CommentWriteSerializer,
    responses={200: CommentSerializer(many=True), 201: CommentSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def comment_list_create(request, workspace_slug: str, project_id, issue_id):
    """兼容路由：评论区**时间正序**（对话语义）。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _comment_list_create_impl(request, project, role, issue_id)


def _comment_detail_impl(request, project, role, issue_id, comment_id):
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


@extend_schema_view(
    patch=extend_schema(
        summary="修改评论（规范路由）",
        request=CommentWriteSerializer,
        responses={200: CommentSerializer},
    ),
    delete=extend_schema(summary="删除评论（规范路由）", responses={204: None}),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def comment_detail_canonical(request, project_id, task_id, comment_id):
    """作者本人，或生效角色 = Admin（可管理他人评论）；其余 403。"""
    project, role = resolve_project_by_id(request.user, project_id)
    return _comment_detail_impl(request, project, role, task_id, comment_id)


@extend_schema_view(
    patch=extend_schema(
        summary="修改评论（兼容路由，deprecated）",
        request=CommentWriteSerializer,
        responses={200: CommentSerializer},
        deprecated=True,
    ),
    delete=extend_schema(
        summary="删除评论（兼容路由，deprecated）", responses={204: None}, deprecated=True
    ),
)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def comment_detail(request, workspace_slug: str, project_id, issue_id, comment_id):
    """兼容路由：作者本人，或生效角色 = Admin；其余 403（05 契约）。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _comment_detail_impl(request, project, role, issue_id, comment_id)


# ── 批量标签（异步 JobRun）──────────────────────────────────────


def _task_bulk_labels_impl(request, project, role):
    _require_role(role, ProjectRoles.MEMBER)
    serializer = IssueBulkLabelsSerializer(data=request.data, context={"project": project})
    serializer.is_valid(raise_exception=True)
    run = job_services.start_bulk_assign_labels(project, request.user, **serializer.validated_data)
    return Response(TaskRunSerializer(run).data, status=status.HTTP_202_ACCEPTED)


@extend_schema(
    summary="批量修改 Task 标签（异步，规范路由）",
    description="立即返回 202 + jobrun id；进度查 `GET /api/v1/projects/{pid}/jobruns/{id}/`。",
    request=IssueBulkLabelsSerializer,
    responses={202: TaskRunSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def task_bulk_labels(request, project_id):
    return _task_bulk_labels_impl(request, *resolve_project_by_id(request.user, project_id))


@extend_schema(
    summary="批量修改 Issue 标签（异步，兼容路由，deprecated）",
    deprecated=True,
    request=IssueBulkLabelsSerializer,
    responses={202: TaskRunSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def issue_bulk_labels(request, workspace_slug: str, project_id):
    """兼容路由：立即返回 **202 + task_id**，进度查 `GET …/tasks/{task_id}/`。"""
    project, role = resolve_project(request.user, workspace_slug, project_id)
    return _task_bulk_labels_impl(request, project, role)
