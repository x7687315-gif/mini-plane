"""Issue 模块测试共用装置：一套标准场景覆盖 04 契约权限矩阵的全部身份。

| 变量 | 工作区角色 | 项目角色 | 生效角色（03 契约） |
|------|-----------|---------|-------------------|
| owner | Admin | Admin（创建者） | 20 可写 |
| ws_admin | Admin | — 未加入 | 20 可写（WS Admin 视同项目 Admin） |
| project_member | Member | Member | 15 可写 |
| project_viewer | Member | Viewer | 5 只读 |
| ws_viewer | Viewer | — 未加入 | 5 只读 |
| outsider | — 非成员 | — | None → 404 |

`other_project`（同工作区、不同项目）用于验证 state / label 的跨项目校验。
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.projects.models import ProjectMember, ProjectRoles
from apps.projects.services import create_project
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from apps.workspaces.services import create_workspace

User = get_user_model()

DEFAULT_PASSWORD = "Pw12345678"


class IssueScenarioMixin:
    """标准场景构造；子类在 setUpTestData 中调用 `cls.build_scenario()`。"""

    @classmethod
    def build_scenario(cls, *, slug: str = "amiya-ws", identifier: str = "AMI"):
        def make_user(name: str):
            return User.objects.create_user(
                username=name, email=f"{name}@example.com", password=DEFAULT_PASSWORD
            )

        cls.owner = make_user("owner")
        cls.ws_admin = make_user("wsadmin")
        cls.project_member = make_user("pm")
        cls.project_viewer = make_user("pv")
        cls.ws_viewer = make_user("wsv")
        cls.outsider = make_user("outsider")

        # 工作区：owner 自动成为 ADMIN
        cls.workspace = create_workspace(cls.owner, "Amiya Workspace", slug)
        for user, role in (
            (cls.ws_admin, WorkspaceRoles.ADMIN),
            (cls.project_member, WorkspaceRoles.MEMBER),
            (cls.project_viewer, WorkspaceRoles.MEMBER),
            (cls.ws_viewer, WorkspaceRoles.VIEWER),
        ):
            WorkspaceMember.objects.create(workspace=cls.workspace, user=user, role=role)

        # 项目：owner 自动成为项目 ADMIN + 预置五态
        cls.project = create_project(
            cls.workspace, cls.owner, name="Amiya Project", identifier=identifier
        )
        ProjectMember.objects.create(
            project=cls.project, user=cls.project_member, role=ProjectRoles.MEMBER
        )
        ProjectMember.objects.create(
            project=cls.project, user=cls.project_viewer, role=ProjectRoles.VIEWER
        )

        # 同工作区的另一个项目（跨项目校验用）
        cls.other_project = create_project(
            cls.workspace, cls.owner, name="Other Project", identifier=f"{identifier[:2]}X"
        )

    # ── URL 便捷属性 ──────────────────────────────────────────────
    @property
    def project_root(self) -> str:
        return f"/api/v1/workspaces/{self.workspace.slug}/projects/{self.project.id}"

    @property
    def issues_url(self) -> str:
        return f"{self.project_root}/issues/"

    def issue_url(self, issue) -> str:
        return f"{self.issues_url}{issue.id}/"

    @property
    def labels_url(self) -> str:
        return f"{self.project_root}/labels/"

    def label_url(self, label) -> str:
        return f"{self.labels_url}{label.id}/"

    @property
    def other_issues_url(self) -> str:
        return f"/api/v1/workspaces/{self.workspace.slug}/projects/{self.other_project.id}/issues/"

    def auth(self, user):
        """以指定用户身份发起请求（Session 认证在测试中由 force_authenticate 代替）。"""
        self.client.force_authenticate(user=user)


class IssueAPITestCase(IssueScenarioMixin, APITestCase):
    """API 层测试基类：setUpTestData 建好标准场景，同类用例共享。"""

    @classmethod
    def setUpTestData(cls):
        cls.build_scenario()
