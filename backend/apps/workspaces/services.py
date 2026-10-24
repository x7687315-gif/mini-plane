"""工作区业务逻辑（契约 docs/api/02-workspaces.md）。

业务规则 400 一律抛 ValidationError：
- 字符串 → 响应体 {"detail": "…"}（业务守卫类错误）；
- 字典   → 字段级错误体。
"""

import secrets

from django.db import IntegrityError, transaction
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.projects.models import ProjectMember
from apps.realtime.broadcast import defer_membership_changed
from apps.users.models import User
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles

_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def generate_slug(name: str) -> str:
    """从 name 生成唯一 slug；冲突自动追加 -2/-3… 后缀（02 契约）。"""
    base = slugify(name) or "ws"
    base = base[: 32 - 3].strip("-") or "ws"  # 预留 "-NN" 后缀空间
    return _unique_slug(base)


def _unique_slug(base: str) -> str:
    base = base[: 32 - 3].strip("-") or "ws"
    slug, suffix = base, 2
    while Workspace.objects.filter(slug=slug).exists():
        slug = f"{base}-{suffix}"
        suffix += 1
        if suffix > 999:  # 兜底：极端重名时用随机后缀
            slug = f"{base}-{secrets.token_hex(2)}"
    return slug


def update_workspace(workspace: Workspace, *, name=None, slug=None) -> Workspace:
    """PATCH：改 name / slug；新 slug 以提供值为基准做唯一性自动后缀。

    slug 唯一性以数据库约束兜底：并发改到同一个 slug 时（先查后写的竞态窗口）
    IntegrityError 转成 400，而不是裸 500。
    """
    if name is not None:
        if not name.strip():
            raise ValidationError({"name": ["该字段是必填项。"]})
        workspace.name = name.strip()
    if slug is not None and slug != workspace.slug:
        workspace.slug = _unique_slug(slug)
    try:
        workspace.save()
    except IntegrityError:
        raise ValidationError({"slug": ["该 slug 已被占用。"]}) from None
    return workspace


@transaction.atomic
def create_workspace(owner: User, name: str, slug: str | None = None) -> Workspace:
    """创建工作区 + 所有者的 ADMIN 成员记录（必须同事务，决策见 §2.5 Sprint 2）。

    slug 生成的"查重 → 写入"存在竞态窗口（前端双击会并发提交两个同名请求），
    撞上唯一约束时用 SAVEPOINT 回滚本次 INSERT，重新生成后缀再试；
    重试耗尽才把错误交给上层（500 由统一异常处理器兜底并记日志）。
    """
    if not name or not name.strip():
        raise ValidationError({"name": ["该字段是必填项。"]})
    final_slug = slug.strip() if slug else None
    if final_slug:
        from apps.workspaces.models import workspace_slug_validator

        workspace_slug_validator(final_slug)
        # 显式 slug 冲突：以提供的值为基准做 -2/-3… 后缀（02 契约）
        if Workspace.objects.filter(slug=final_slug).exists():
            final_slug = _unique_slug(final_slug)
    workspace = None
    candidate = final_slug or generate_slug(name)
    for _attempt in range(3):
        try:
            # SAVEPOINT：约束冲突只回滚这条 INSERT，外层事务（成员记录）继续可用
            with transaction.atomic():
                workspace = Workspace.objects.create(name=name.strip(), slug=candidate, owner=owner)
            break
        except IntegrityError:
            candidate = _unique_slug(candidate)
    if workspace is None:
        raise ValidationError({"slug": ["slug 生成冲突，请重试。"]})
    WorkspaceMember.objects.create(workspace=workspace, user=owner, role=WorkspaceRoles.ADMIN)
    return workspace


def add_member(workspace: Workspace, email: str, role: int) -> WorkspaceMember:
    """按 email 添加成员；email 未注册 / 已是成员 → 400。

    已是成员的判断存在竞态（双击/并发添加）：数据库唯一约束兜底，
    IntegrityError 转成与预检查一致的 400 文案。
    """
    user = User.objects.filter(email=email).first()
    if user is None:
        raise ValidationError({"email": ["该邮箱尚未注册。"]})
    if WorkspaceMember.objects.filter(workspace=workspace, user=user).exists():
        raise ValidationError({"email": ["该用户已是工作区成员。"]})
    try:
        return WorkspaceMember.objects.create(workspace=workspace, user=user, role=role)
    except IntegrityError:
        raise ValidationError({"email": ["该用户已是工作区成员。"]}) from None


def change_role(workspace: Workspace, member: WorkspaceMember, role: int) -> WorkspaceMember:
    """改角色；所有者角色不可改（保证 owner 恒为 Admin 的不变量）。"""
    if member.user_id == workspace.owner_id:
        raise ValidationError({"detail": "不能修改工作区所有者的角色。"})
    member.role = role
    member.save(update_fields=["role", "updated_at"])
    return member


def delete_workspace(workspace: Workspace) -> None:
    """删除工作区（ADR-001 守卫版）。

    **仍有工程 → 400 拒绝**：工程是个人/团队资产，不允许因删工作区被级联清空
    （Phase 0 风险 R-01）。先删除或显式脱离（转私人，Phase 6 提供操作）全部工程后才能删。
    数据库层 Project.workspace 已改为 SET_NULL，本守卫之下的 workspace.delete()
    只会级联 WorkspaceMember 等协作数据，正常路径触不到 SET_NULL 兜底。
    """
    from apps.projects import cache as project_cache
    from apps.projects.models import Project

    remaining = Project.objects.filter(workspace=workspace).count()
    if remaining:
        raise ValidationError(
            {
                "detail": (
                    f"该工作区仍有 {remaining} 个工程，不能直接删除。"
                    "请先删除这些工程，或将其脱离协作（转为私人工程）后再删除工作区。"
                )
            }
        )
    project_cache.invalidate_workspace(workspace)
    workspace.delete()


def remove_member(workspace: Workspace, member: WorkspaceMember) -> None:
    """移除成员；双守卫：所有者不可移除 + 至少保留一位管理员（02 契约）。

    同步清除其项目成员身份，维持 §4.1 不变量「ProjectMember 必是 WorkspaceMember」；
    项目成员身份被清掉会改变生效角色，因此项目详情缓存必须一并作废（Sprint 6）。
    """
    if member.user_id == workspace.owner_id:
        raise ValidationError({"detail": "工作区所有者不可移除。"})
    admin_count = WorkspaceMember.objects.filter(
        workspace=workspace, role=WorkspaceRoles.ADMIN
    ).count()
    if member.role == WorkspaceRoles.ADMIN and admin_count <= 1:
        raise ValidationError({"detail": "至少保留一位管理员。"})
    ProjectMember.objects.filter(project__workspace=workspace, user=member.user).delete()
    member.delete()
    # 被移除者可能不再是任何项目的成员 → 它能看到的所有项目详情缓存都要作废
    _invalidate_projects_of(workspace)
    # Island V2 阶段 4：workspace 成员被移除 → 其全部项目访问权消失，
    # overview 连接必须重校验订阅（权限实时收敛，规格 §7.2）
    defer_membership_changed(user_ids=[member.user_id])


def _invalidate_projects_of(workspace: Workspace) -> int:
    from apps.projects import cache as project_cache

    return project_cache.invalidate_workspace(workspace)
