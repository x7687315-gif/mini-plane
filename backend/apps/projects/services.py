"""项目业务逻辑（契约 docs/api/03-projects.md）。

Sprint 4 起，创建/修改项目会写活动留痕（06 契约），与业务同事务。
"""

from django.db import IntegrityError, transaction
from django.db.models import Max
from rest_framework.exceptions import ValidationError

from apps.activity import services as activity_services
from apps.activity.models import Actions as ActivityActions
from apps.issues.models import create_default_states
from apps.projects import cache as project_cache
from apps.projects.models import Project, ProjectMember, ProjectPlan, ProjectRoles, ProjectStage
from apps.users.models import User
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles


@transaction.atomic
def create_project(
    workspace: Workspace, creator: User, *, name, identifier, description=""
) -> Project:
    """创建项目 + 创建者 ADMIN 成员 + 预置默认五态（三者必须同事务，决策 D8）。

    identifier 工作区内唯一：写入前显式校验，数据库 UniqueConstraint 兜底。
    """
    if Project.objects.filter(workspace=workspace, identifier=identifier).exists():
        raise ValidationError({"identifier": ["此字段必须唯一。"]})
    try:
        # SAVEPOINT：并发创建（双击）撞唯一约束只回滚这条 INSERT，事务内后续步骤照常
        with transaction.atomic():
            project = Project.objects.create(
                workspace=workspace,
                name=name.strip(),
                identifier=identifier,
                description=description or "",
                created_by=creator,
            )
    except IntegrityError:
        raise ValidationError({"identifier": ["此字段必须唯一。"]}) from None
    ProjectMember.objects.create(project=project, user=creator, role=ProjectRoles.ADMIN)
    create_default_states(project)

    activity_services.record_project_event(
        project,
        actor=creator,
        action=ActivityActions.CREATED,
        new_value={"name": project.name},
    )
    return project


@transaction.atomic
def update_project(
    project: Project, *, actor, name=None, identifier=None, description=None
) -> Project:
    """PATCH：改 name / identifier / description；identifier 工作区内唯一。

    留痕只记 name / identifier（描述与 Issue 的处理一致：不把长文本塞进时间线）。
    """
    old_value, new_value = {}, {}

    if name is not None:
        if not name.strip():
            raise ValidationError({"name": ["该字段是必填项。"]})
        new_name = name.strip()
        if new_name != project.name:
            old_value["name"], new_value["name"] = project.name, new_name
            project.name = new_name
    if identifier is not None and identifier != project.identifier:
        if Project.objects.filter(workspace=project.workspace, identifier=identifier).exists():
            raise ValidationError({"identifier": ["此字段必须唯一。"]})
        old_value["identifier"], new_value["identifier"] = project.identifier, identifier
        project.identifier = identifier
    if description is not None:
        project.description = description
    try:
        project.save()
    except IntegrityError:
        # 并发改到同一个 identifier：唯一约束兜底转 400（与创建路径同语义）
        raise ValidationError({"identifier": ["此字段必须唯一。"]}) from None

    if old_value:
        activity_services.record_project_event(
            project,
            actor=actor,
            action=ActivityActions.UPDATED,
            old_value=old_value,
            new_value=new_value,
        )
    # 失效放在最后且**无条件**执行：宁多失效一次（只是版本号 +1），也不要漏掉描述变更等分支
    project_cache.invalidate(project.id, workspace_slug=project.workspace.slug)
    return project


def add_member(workspace: Workspace, project: Project, user_id, role: int) -> ProjectMember:
    """添加项目成员；必须已是工作区成员（03 契约）。"""
    user = User.objects.filter(id=user_id).first()
    if user is None:
        raise ValidationError({"user_id": ["该字段是必填项。"]})
    is_workspace_member = WorkspaceMember.objects.filter(workspace=workspace, user=user).exists()
    if not is_workspace_member:
        raise ValidationError({"user_id": ["该用户不是工作区成员，请先添加到工作区。"]})
    if ProjectMember.objects.filter(project=project, user=user).exists():
        raise ValidationError({"user_id": ["该用户已是项目成员。"]})
    try:
        member = ProjectMember.objects.create(project=project, user=user, role=role)
    except IntegrityError:
        # 双击/并发添加的竞态：唯一约束兜底转 400（与预检查同文案）
        raise ValidationError({"user_id": ["该用户已是项目成员。"]}) from None
    _invalidate_project_cache(project)
    return member


def change_role(project: Project, member: ProjectMember, role: int) -> ProjectMember:
    member.role = role
    member.save(update_fields=["role", "updated_at"])
    _invalidate_project_cache(project)
    return member


def remove_member(project: Project, member: ProjectMember) -> None:
    """移除项目成员；至少保留一位项目 Admin（含创建者自行退出的场景，03 契约）。"""
    admin_count = ProjectMember.objects.filter(project=project, role=ProjectRoles.ADMIN).count()
    if member.role == ProjectRoles.ADMIN and admin_count <= 1:
        raise ValidationError({"detail": "至少保留一位项目管理员。"})
    member.delete()
    _invalidate_project_cache(project)


def _invalidate_project_cache(project: Project) -> None:
    """成员变更后作废详情缓存。

    **防御性失效**：当前缓存体里没有成员字段，所以严格说成员变更不影响缓存内容；
    但一旦详情体加入成员数/成员列表（二期很可能），这里就必须失效。
    计划 §Sprint 6 把 member_change_invalidates 列为验收项，故按防御性失效实现并标注。
    """
    project_cache.invalidate(project.id, workspace_slug=project.workspace.slug)


def require_workspace_write_role(workspace: Workspace, role: int) -> None:
    """创建项目要求 WS Member+（WS Viewer 403，矩阵 §4.2）。"""
    if role < WorkspaceRoles.MEMBER:
        raise ValidationError({"detail": "您没有执行该操作的权限。"})


# ── Sprint 10：Global Plan / Stage（PRODUCT_REFACTOR_PLAN §5/§6）──────────────


def get_or_create_plan(project: Project) -> ProjectPlan:
    """一个项目一份 Global Plan；读时惰性创建，避免给老项目补数据迁移。"""
    plan, _ = ProjectPlan.objects.get_or_create(project=project)
    return plan


@transaction.atomic
def add_stage(
    plan: ProjectPlan,
    *,
    name: str,
    order: int | None = None,
    weight: int = 1,
    progress: int = 0,
    goal: str = "",
    is_current: bool = False,
) -> ProjectStage:
    """追加一个 Stage；order 缺省为现有最大 +1。is_current 互斥（同 plan 仅一个）。"""
    if order is None:
        last = plan.stages.aggregate(m=Max("order"))["m"]
        order = (last or 0) + 1
    if is_current:
        plan.stages.update(is_current=False)
    return ProjectStage.objects.create(
        plan=plan,
        order=order,
        name=name,
        weight=weight,
        progress=progress,
        goal=goal,
        is_current=is_current,
    )


@transaction.atomic
def update_stage(stage: ProjectStage, **fields) -> ProjectStage:
    """更新 Stage 字段；若把 is_current 置真则先清掉同 plan 的其他 current。"""
    if fields.get("is_current"):
        stage.plan.stages.exclude(pk=stage.pk).update(is_current=False)
    for key, value in fields.items():
        setattr(stage, key, value)
    stage.save()
    return stage


def plan_progress(plan: ProjectPlan) -> int:
    """项目总进度 = Σ(weight×progress)/Σweight（§6），无 Stage 时为 0。"""
    stages = list(plan.stages.all())
    total_weight = sum(s.weight for s in stages)
    if total_weight <= 0:
        return 0
    weighted = sum(s.weight * s.progress for s in stages)
    return round(weighted / total_weight)


def current_stage(plan: ProjectPlan) -> ProjectStage | None:
    return plan.stages.filter(is_current=True).first()


def next_stage(plan: ProjectPlan) -> ProjectStage | None:
    """当前阶段之后（order 更大）的第一个 Stage；无当前阶段则取第一个。"""
    cur = current_stage(plan)
    qs = plan.stages.all()
    if cur is not None:
        nxt = qs.filter(order__gt=cur.order).first()
        if nxt is not None:
            return nxt
    return qs.first() if cur is None else None
