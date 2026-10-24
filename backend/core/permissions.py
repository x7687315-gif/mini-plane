"""作用域解析与角色判定（BACKEND_PLAN §4 · ADR-001 个人优先所有权）。

配合函数视图（FBV）采用"作用域解析函数 + 显式角色判断"：
- resolve_* 统一完成「查对象 → 404 防枚举 →（项目）计算生效角色」；
- 视图内拿生效角色与门槛比较，不足时抛 PermissionDenied → 统一 403。

角色判定规则（03 契约「生效角色」表 + ADR-001 所有权）：
- **project.owner == user → ADMIN**（owner 恒可访问自己的工程，个人/团队皆然）；
- 是 ProjectMember → 取项目角色；
- 非 ProjectMember 但 WS Admin → 视同项目 Admin；
- 非 ProjectMember 的 WS Member/Viewer → 等效 Viewer（只读）；
- 私人工程（workspace 为空）非 owner 一律不可见；非成员 → None（上层转 404，防枚举）。
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


def effective_role(user, *, workspace_id, project_id, owner_id=None) -> int | None:
    """生效角色规则的**唯一实现**（03 契约表格 + ADR-001 owner 短路）。

    刻意只依赖 id 而不是模型实例：这样"已经拿到 Project 对象"的写路径
    （`get_effective_project_role`）与"命中缓存、不想再查一次项目行"的读路径
    （`get_effective_project_role_by_ids`）能共用同一段判定逻辑，不会各写一份而漂移。
    """
    if not user.is_authenticated:
        return None
    # owner 短路：所有权优先于一切成员关系（含被移出工作区的场景）
    if owner_id is not None and owner_id == user.id:
        return ProjectRoles.ADMIN
    project_role = (
        ProjectMember.objects.filter(project_id=project_id, user=user)
        .values_list("role", flat=True)
        .first()
    )
    if project_role is not None:
        return project_role
    if workspace_id is None:
        # 私人工程：没有 WorkspaceMember 可言，owner 之外不可见
        return None

    workspace_role = (
        WorkspaceMember.objects.filter(workspace_id=workspace_id, user=user)
        .values_list("role", flat=True)
        .first()
    )
    if workspace_role == WorkspaceRoles.ADMIN:
        return ProjectRoles.ADMIN
    if workspace_role is None:
        return None
    return ProjectRoles.VIEWER


def get_effective_project_role(user, project) -> int | None:
    """项目「生效角色」——权限矩阵的单一实现点（03 契约表格）。"""
    return effective_role(
        user, workspace_id=project.workspace_id, project_id=project.id, owner_id=project.owner_id
    )


def get_effective_project_role_by_ids(
    user, *, workspace_id, project_id, owner_id=None
) -> int | None:
    """同上，但只用 id 不加载 Project 行（缓存命中路径用）。

    非成员依旧返回 None → 上层转 404，防枚举规则不受影响。
    """
    return effective_role(user, workspace_id=workspace_id, project_id=project_id, owner_id=owner_id)


def resolve_workspace(user, slug: str) -> tuple[Workspace, int]:
    """解析工作区；不存在或非成员 → Http404（对调用方表现为统一 404）。"""
    workspace = Workspace.objects.filter(slug=slug).first()
    role = get_workspace_role(user, workspace) if workspace else None
    if workspace is None or role is None:
        raise Http404
    return workspace, role


def resolve_project_by_id(user, project_id) -> tuple[Project, int]:
    """规范解析（ADR-001 / DOMAIN_MODEL §4）：只凭 Project ID。

    owner → ADMIN；团队工程按既有双层规则；私人工程非 owner → 404。
    Phase 3 的规范路由（/api/v1/projects/{pid}/…）与 Agent 无 slug 路径都走这里。
    """
    project = Project.objects.select_related("workspace").filter(id=project_id).first()
    if project is None:
        raise Http404
    role = get_effective_project_role(user, project)
    if role is None:
        raise Http404
    return project, role


def resolve_project(user, slug: str, project_id) -> tuple[Project, int]:
    """兼容解析（旧 URL /workspaces/{slug}/projects/{pid}/，决策 D6）。

    保持双重作用域校验（项目确属该工作区），角色判定复用 owner 短路版 effective_role。
    私人工程（workspace 为空）不出现在任何工作区路径下 → 404。
    """
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


def accessible_project_ids(user):
    """用户可访问的项目 id 集合（owner，或是 ProjectMember / 其 workspace 的成员）。

    与 `effective_role` 同一套可见性规则，供跨项目聚合查询（如「我的工作」）复用，
    避免在别处再写一份成员判定而漂移。未登录 → 空集。
    """
    from django.db.models import Q  # 局部导入，避免与顶部 import 组冲突

    if not user.is_authenticated:
        return Project.objects.none()
    member_pids = ProjectMember.objects.filter(user=user).values_list("project_id", flat=True)
    ws_ids = WorkspaceMember.objects.filter(user=user).values_list("workspace_id", flat=True)
    return Project.objects.filter(
        Q(owner=user) | Q(id__in=member_pids) | Q(workspace_id__in=ws_ids)
    ).values_list("id", flat=True)
