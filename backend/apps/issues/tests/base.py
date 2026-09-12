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

from apps.issues import services
from apps.issues.models import Issue
from apps.projects.models import ProjectMember, ProjectRoles
from apps.projects.services import create_project
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from apps.workspaces.services import create_workspace
from core.testing import TEST_PASSWORD

User = get_user_model()

DEFAULT_PASSWORD = TEST_PASSWORD


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
        cls.project_member2 = make_user("pm2")
        cls.project_viewer = make_user("pv")
        cls.ws_viewer = make_user("wsv")
        cls.outsider = make_user("outsider")

        # 工作区：owner 自动成为 ADMIN
        cls.workspace = create_workspace(cls.owner, "Amiya Workspace", slug)
        for user, role in (
            (cls.ws_admin, WorkspaceRoles.ADMIN),
            (cls.project_member, WorkspaceRoles.MEMBER),
            (cls.project_member2, WorkspaceRoles.MEMBER),
            (cls.project_viewer, WorkspaceRoles.MEMBER),
            (cls.ws_viewer, WorkspaceRoles.VIEWER),
        ):
            WorkspaceMember.objects.create(workspace=cls.workspace, user=user, role=role)

        # 项目：owner 自动成为项目 ADMIN + 预置五态
        cls.project = create_project(
            cls.workspace, cls.owner, name="Amiya Project", identifier=identifier
        )
        for user, role in (
            (cls.project_member, ProjectRoles.MEMBER),
            (cls.project_member2, ProjectRoles.MEMBER),
            (cls.project_viewer, ProjectRoles.VIEWER),
        ):
            ProjectMember.objects.create(project=cls.project, user=user, role=role)

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

    def comments_url(self, issue) -> str:
        return f"{self.issue_url(issue)}comments/"

    def comment_url(self, issue, comment) -> str:
        return f"{self.comments_url(issue)}{comment.id}/"

    def issue_activities_url(self, issue) -> str:
        return f"{self.issue_url(issue)}activities/"

    @property
    def project_activities_url(self) -> str:
        return f"{self.project_root}/activities/"

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


class IssueListAPITestCase(IssueAPITestCase):
    """列表查询类测试（过滤 / 搜索 / 排序 / 分页）的基类。

    提供两个助手：
    - `make_issue(...)`：建单并可**显式指定 created_at**——Windows 墙钟粒度约 15ms，
      连续创建的 Issue 会拿到相同时间戳，排序断言不能依赖自然时间戳；
    - `query(params)`：带查询串请求列表并返回 (状态码, body)。
    """

    def make_issue(
        self,
        *,
        title: str,
        state=None,
        priority: str = "none",
        assignee=None,
        labels=None,
        description: str = "",
        created_at=None,
    ):
        issue = services.create_issue(
            self.project,
            self.owner,
            title=title,
            description=description,
            priority=priority,
            state=state,
            assignee=assignee,
            labels=labels,
        )
        if created_at is not None:
            Issue.objects.filter(pk=issue.pk).update(created_at=created_at, updated_at=created_at)
            issue.refresh_from_db()
        return issue

    def ids_of(self, body) -> list[str]:
        return [item["id"] for item in body["results"]]

    def query(self, params: str = ""):
        self.auth(self.owner)
        url = f"{self.issues_url}?{params}" if params else self.issues_url
        response = self.client.get(url)
        if response.status_code == 200:
            return response.status_code, response.json()
        try:
            return response.status_code, response.json()
        except ValueError:  # pragma: no cover - 非 JSON 响应（如 405）
            return response.status_code, None
