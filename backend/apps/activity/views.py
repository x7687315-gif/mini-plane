"""活动流只读接口（契约 docs/api/06-activities.md）。

没有任何写接口：留痕只由业务代码在服务层产生。
读权限与 Issue 一致——工作区成员即可看（生效角色 ≥ Viewer），非成员 404。
"""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated

from apps.activity import services
from apps.activity.serializers import ActivityLogSerializer
from core.pagination import StandardPagination
from core.permissions import resolve_project


@extend_schema(
    summary="项目活动流（倒序）",
    responses={200: ActivityLogSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def project_activity_list(request, workspace_slug: str, project_id):
    """跨 Issue 的项目级活动流，倒序分页。"""
    project, _ = resolve_project(request.user, workspace_slug, project_id)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(services.project_feed(project), request)
    return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)


@extend_schema(
    summary="Issue 时间线（倒序）",
    responses={200: ActivityLogSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def issue_activity_list(request, workspace_slug: str, project_id, issue_id):
    """该 Issue 自身的变更 + 挂在其下的评论事件，倒序分页。"""
    project, _ = resolve_project(request.user, workspace_slug, project_id)
    issue = get_object_or_404(project.issues.all(), id=issue_id)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(services.issue_timeline(issue), request)
    return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)
