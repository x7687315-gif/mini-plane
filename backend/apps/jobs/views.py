"""后台异步任务（JobRun，历史名 TaskRun）状态查询接口。

Phase 3 术语统一（计划 §3.3 / DOMAIN_MODEL §1）：
- **规范路由**：`/api/v1/projects/{pid}/jobruns/{id}/`——后台异步操作与业务 Task 严格区分；
- **兼容路由**：`/workspaces/{ws}/projects/{pid}/tasks/{id}/`（deprecated，委托同一实现）。
表名 `jobs_taskrun` 与序列化器 `TaskRun` 保留为存储实现细节。
"""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.jobs.serializers import TaskRunSerializer
from core.permissions import resolve_project, resolve_project_by_id


def _jobrun_detail_impl(request, project, jobrun_id):
    run = get_object_or_404(project.task_runs.select_related("actor"), id=jobrun_id)
    return Response(TaskRunSerializer(run).data)


@extend_schema(summary="JobRun 状态（规范路由）", responses={200: TaskRunSerializer})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def jobrun_detail(request, project_id, jobrun_id):
    """查询一个后台异步操作的状态（pending / running / success / failure）。"""
    return _jobrun_detail_impl(
        request, resolve_project_by_id(request.user, project_id)[0], jobrun_id
    )


@extend_schema(
    summary="异步任务状态（兼容路由，deprecated）",
    deprecated=True,
    responses={200: TaskRunSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def task_run_detail(request, workspace_slug: str, project_id, task_id):
    """兼容路由：与规范路由 `/api/v1/projects/{pid}/jobruns/{id}/` 委托同一实现。"""
    return _jobrun_detail_impl(
        request, resolve_project(request.user, workspace_slug, project_id)[0], task_id
    )
