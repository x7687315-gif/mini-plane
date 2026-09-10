"""项目业务逻辑（契约 docs/api/03-projects.md）。

Sprint 4 起，创建/修改项目会写活动留痕（06 契约），与业务同事务。
"""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.activity import services as activity_services
from apps.activity.models import Actions as ActivityActions
from apps.issues.models import create_default_states
from apps.projects.models import Project, ProjectMember, ProjectRoles
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
    project = Project.objects.create(
        workspace=workspace,
        name=name.strip(),
        identifier=identifier,
        description=description or "",
        created_by=creator,
    )
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
    project.save()

    if old_value:
        activity_services.record_project_event(
            project,
            actor=actor,
            action=ActivityActions.UPDATED,
            old_value=old_value,
            new_value=new_value,
        )
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
    return ProjectMember.objects.create(project=project, user=user, role=role)


def change_role(member: ProjectMember, role: int) -> ProjectMember:
    member.role = role
    member.save(update_fields=["role", "updated_at"])
    return member


def remove_member(project: Project, member: ProjectMember) -> None:
    """移除项目成员；至少保留一位项目 Admin（含创建者自行退出的场景，03 契约）。"""
    admin_count = ProjectMember.objects.filter(project=project, role=ProjectRoles.ADMIN).count()
    if member.role == ProjectRoles.ADMIN and admin_count <= 1:
        raise ValidationError({"detail": "至少保留一位项目管理员。"})
    member.delete()


def require_workspace_write_role(workspace: Workspace, role: int) -> None:
    """创建项目要求 WS Member+（WS Viewer 403，矩阵 §4.2）。"""
    if role < WorkspaceRoles.MEMBER:
        raise ValidationError({"detail": "您没有执行该操作的权限。"})
