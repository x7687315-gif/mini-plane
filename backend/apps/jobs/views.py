"""任务状态查询接口（契约 docs/api/07-cache-and-tasks.md）。

只有一个只读端点：前端拿到 202 + task_id 之后轮询这里看进度。
权限与其它项目子资源一致——工作区成员即可读（生效角色 ≥ Viewer），非成员 404。
"""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.jobs.serializers import TaskRunSerializer
from core.permissions import resolve_project


@extend_schema(summary="异步任务状态", responses={200: TaskRunSerializer})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def task_run_detail(request, workspace_slug: str, project_id, task_id):
    """查询一个 TaskRun 的当前状态（pending / running / success / failure）。"""
    project, _ = resolve_project(request.user, workspace_slug, project_id)
    run = get_object_or_404(project.task_runs.select_related("actor"), id=task_id)
    return Response(TaskRunSerializer(run).data)
