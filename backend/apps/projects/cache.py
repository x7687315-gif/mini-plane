"""Project 详情缓存（契约 docs/api/07-cache-and-tasks.md）。

**键**：`mini:project:{workspace_slug}:{project_id}:v{version}`
（版本键 `mini:project:{workspace_slug}:{project_id}` 不带 v 后缀，且不设 TTL）

两处刻意的设计：

1. **scope 里带 workspace_slug**：命中缓存要能**跳过"这个项目是否属于该工作区"的查询**。
   把 slug 编进键里，命中即隐含"这个 (slug, project_id) 组合曾经成立"，
   于是 `/workspaces/ws-b/projects/{属于 ws-a 的项目}/` 在 ws-b 下永远是 miss，
   不会因为缓存而跨工作区泄露（防枚举规则不被缓存绕过）。
2. **缓存的是"角色无关"的响应体片段**，不是 ORM 对象：
   - 鉴权仍然每次实时执行——成员被移除后缓存不能继续放行；
   - `current_user_role` 是**每用户**字段，绝不能进缓存（否则 B 会读到 A 的角色）。
"""

from django.core.cache import cache

from core import cache as cache_primitives

ENTITY = "project"

#: 私人工程的哨兵 slug（ADR-001：workspace 可空）。slug 校验规则要求 ≥2 字符，
#: 单字符 "-" 不可能是真实 slug，故作用域不会与任何团队工程冲突。
PERSONAL_SCOPE = "-"

#: 请求级字段：每次从生效角色注入，不写进缓存
PER_USER_FIELDS = ("current_user_role",)


def detail_scope(workspace_slug: str | None, project_id) -> str:
    """缓存作用域：工作区 slug + 项目 id（见模块 docstring 第 1 点）。

    私人工程 workspace_slug 传 None → 用哨兵 "-"（与任何真实 slug 不冲突）。
    """
    return f"{workspace_slug or PERSONAL_SCOPE}:{project_id}"


def build_payload(project) -> dict:
    """把 Project 序列化成可缓存的（角色无关的）JSON-safe 片段。

    函数内导入序列化器：apps.projects.serializers 会 import issues.models，
    放在模块顶层会把这条链拉进 models 的导入期。
    """
    from apps.projects.serializers import ProjectSerializer

    payload = dict(ProjectSerializer(project, context={"role": None}).data)
    for field in PER_USER_FIELDS:
        payload.pop(field, None)
    return cache_primitives.json_safe(payload)


def get_detail(workspace_slug: str, project_id) -> dict | None:
    scope = detail_scope(workspace_slug, project_id)
    return cache.get(cache_primitives.versioned_key(ENTITY, scope=scope))


def set_detail(workspace_slug: str, project_id, payload: dict, ttl: int | None = None) -> None:
    scope = detail_scope(workspace_slug, project_id)
    cache.set(
        cache_primitives.versioned_key(ENTITY, scope=scope),
        payload,
        cache_primitives.DEFAULT_TTL if ttl is None else ttl,
    )


def invalidate(
    project_id,
    *,
    workspace_slug: str | None = None,
    workspace=None,
    strategy: str = cache_primitives.STRATEGY_VERSION,
) -> None:
    """让某个项目的详情缓存失效。

    调用方给 `workspace_slug` 或 `workspace` 任一即可：
    - 写路径（`resolve_project` 出来的对象）已经 `select_related("workspace")`，
      用 `project.workspace.slug` 不会再产生查询；
    - 成员管理路径手上只有 Workspace 对象，直接传 `workspace=`；
    - 私人工程两者都不传 → 哨兵作用域（detail_scope 会归一到 "-"）。
    """
    if workspace_slug is None and workspace is not None:
        workspace_slug = workspace.slug  # None 保持 None（私人工程哨兵）
    cache_primitives.invalidate(
        ENTITY, scope=detail_scope(workspace_slug, project_id), strategy=strategy
    )


def cached_get_or_load(workspace_slug: str, project_id, loader):
    """Cache-Aside：命中返回 (payload, True)，未命中回填并返回 (payload, False)。"""
    scope = detail_scope(workspace_slug, project_id)
    return cache_primitives.get_or_set_versioned(ENTITY, scope=scope, loader=loader)


def invalidate_workspace(workspace) -> int:
    """工作区级失效：把它下面**所有**项目的详情缓存作废。

    用在两处只能从工作区侧发起的变更：
    - 删除工作区（项目全部级联消失）；
    - 移除工作区成员（会级联清掉其项目成员身份，可能改变生效角色）。
    返回被作废的项目数，便于调用方在日志/测试里断言。
    """
    from apps.projects.models import Project

    project_ids = list(Project.objects.filter(workspace=workspace).values_list("id", flat=True))
    for project_id in project_ids:
        invalidate(project_id, workspace_slug=workspace.slug)
    return len(project_ids)
