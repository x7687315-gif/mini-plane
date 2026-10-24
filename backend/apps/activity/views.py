"""活动流只读接口（契约 docs/api/06-activities.md）。

没有任何写接口：留痕只由业务代码在服务层产生。
Phase 3 双路由：规范 `/api/v1/projects/{pid}/…` + 兼容 ws 路径（同一实现）。
读权限与 Task 一致——生效角色 ≥ Viewer，非可见 404。
"""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated

from apps.activity import services
from apps.activity.serializers import ActivityLogSerializer
from core.pagination import StandardPagination
from core.permissions import resolve_project, resolve_project_by_id


def _project_activity_impl(request, project):
    paginator = StandardPagination()
    page = paginator.paginate_queryset(services.project_feed(project), request)
    return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)


def _task_activity_impl(request, project, issue_id):
    issue = get_object_or_404(project.issues.all(), id=issue_id)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(services.issue_timeline(issue), request)
    return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)


@extend_schema(
    summary="工程活动流（规范路由，倒序）",
    responses={200: ActivityLogSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def project_activity_list_canonical(request, project_id):
    return _project_activity_impl(request, resolve_project_by_id(request.user, project_id)[0])


@extend_schema(
    summary="Task 时间线（规范路由，倒序）",
    responses={200: ActivityLogSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def task_activity_list_canonical(request, project_id, task_id):
    """该 Task 自身的变更 + 挂在其下的评论事件，倒序分页。"""
    return _task_activity_impl(request, resolve_project_by_id(request.user, project_id)[0], task_id)


@extend_schema(
    summary="项目活动流（兼容路由，deprecated）",
    deprecated=True,
    responses={200: ActivityLogSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def project_activity_list(request, workspace_slug: str, project_id):
    return _project_activity_impl(
        request, resolve_project(request.user, workspace_slug, project_id)[0]
    )


@extend_schema(
    summary="Issue 时间线（兼容路由，deprecated）",
    deprecated=True,
    responses={200: ActivityLogSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def issue_activity_list(request, workspace_slug: str, project_id, issue_id):
    return _task_activity_impl(
        request, resolve_project(request.user, workspace_slug, project_id)[0], issue_id
    )
