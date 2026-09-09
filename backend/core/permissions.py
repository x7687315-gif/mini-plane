"""多租户作用域解析与角色判定（BACKEND_PLAN §4）。

配合函数视图（FBV）采用"作用域解析函数 + 显式角色判断"：
- resolve_* 统一完成「查对象 → 404 防枚举 →（项目）计算生效角色」；
- 视图内拿生效角色与门槛比较，不足时抛 PermissionDenied → 统一 403。

角色判定规则（03 契约「生效角色」表）：
- 是 ProjectMember → 取项目角色；
- 非 ProjectMember 但 WS Admin → 视同项目 Admin；
- 非 ProjectMember 的 WS Member/Viewer → 等效 Viewer（只读）；
- 非 WS 成员 → None（上层转 404，防止资源枚举，见 §4.3）。
"""

from django.http import Http404

from apps.projects.models import Project, ProjectMember, ProjectRoles
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles


def get_workspace_role(user, workspace) -> int | None:
    """用户在某工作区的角色；非成员返回 None。"""
    if not user.is_authenticated:
        return None
    return (
        WorkspaceMember.objects.filter(workspace=workspace, user=user)
        .values_list("role", flat=True)
        .first()
    )


def get_effective_project_role(user, project) -> int | None:
    """项目「生效角色」——权限矩阵的单一实现点（03 契约表格）。"""
    if not user.is_authenticated:
        return None
    project_role = (
        ProjectMember.objects.filter(project=project, user=user)
        .values_list("role", flat=True)
        .first()
    )
    if project_role is not None:
        return project_role

    workspace_role = get_workspace_role(user, project.workspace)
    if workspace_role == WorkspaceRoles.ADMIN:
        return ProjectRoles.ADMIN
    if workspace_role is None:
        return None
    return ProjectRoles.VIEWER


def resolve_workspace(user, slug: str) -> tuple[Workspace, int]:
    """解析工作区；不存在或非成员 → Http404（对调用方表现为统一 404）。"""
    workspace = Workspace.objects.filter(slug=slug).first()
    role = get_workspace_role(user, workspace) if workspace else None
    if workspace is None or role is None:
        raise Http404
    return workspace, role


def resolve_project(user, slug: str, project_id) -> tuple[Project, int]:
    """解析项目并校验它确属于该工作区（URL 双重作用域，决策 D6）。"""
    project = (
        Project.objects.select_related("workspace")
        .filter(id=project_id, workspace__slug=slug)
        .first()
    )
    if project is None:
        raise Http404
    role = get_effective_project_role(user, project)
    if role is None:
        raise Http404
    return project, role
