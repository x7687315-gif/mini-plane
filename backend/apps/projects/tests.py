"""Sprint 2 验收测试：Project / 项目成员 / 预置状态（契约 docs/api/03-projects.md）。

角色矩阵逐格覆盖见 ProjectPermissionMatrixTests（§4.2 / 03 契约「生效角色」表）。
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.issues.models import State
from apps.projects import services
from apps.projects.models import Project, ProjectMember, ProjectRoles
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from core.testing import TEST_PASSWORD

User = get_user_model()

PASSWORD = TEST_PASSWORD
IDENTIFIER = "AMI"


class ProjectTestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.users = {}
        for name in ("a_admin", "b_member", "c_viewer", "d_outsider"):
            cls.users[name] = User.objects.create_user(
                username=name, email=f"{name}@test.cn", password=PASSWORD
            )
        cls.a = cls.users["a_admin"]
        cls.b = cls.users["b_member"]
        cls.c = cls.users["c_viewer"]
        cls.d = cls.users["d_outsider"]

    @classmethod
    def _build_workspace(cls):
        from apps.workspaces import services as ws_services

        cls.workspace = ws_services.create_workspace(cls.a, "Amiya 工作区", "amiya")
        WorkspaceMember.objects.create(
            workspace=cls.workspace, user=cls.b, role=WorkspaceRoles.MEMBER
        )
        WorkspaceMember.objects.create(
            workspace=cls.workspace, user=cls.c, role=WorkspaceRoles.VIEWER
        )

    def setUp(self):
        self.client = APIClient()

    def client_as(self, user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def projects_url(self, workspace=None) -> str:
        return f"/api/v1/workspaces/{(workspace or self.workspace).slug}/projects/"

    def project_url(self, project=None) -> str:
        return f"{self.projects_url()}{(project or self.project).id}/"

    def members_url(self, project=None) -> str:
        return f"{self.project_url(project)}members/"

    def member_url(self, member, project=None) -> str:
        return f"{self.members_url(project)}{member.id}/"


class ProjectCRUDTests(ProjectTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls._build_workspace()
        cls.project = services.create_project(
            cls.workspace, cls.b, name="成员的项目", identifier=IDENTIFIER
        )

    def test_create_project_creator_admin_and_five_states(self):
        response = self.client_as(self.b).post(
            self.projects_url(),
            {"name": "新项目", "identifier": "NEW", "description": "d"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["current_user_role"], ProjectRoles.ADMIN)
        states = State.objects.filter(project_id=body["id"]).order_by("sort_order")
        self.assertEqual(
            [(s.name, s.group) for s in states],
            [
                ("Backlog", "backlog"),
                ("Todo", "unstarted"),
                ("In Progress", "started"),
                ("Done", "completed"),
                ("Cancelled", "cancelled"),
            ],
        )

    def test_create_by_ws_viewer_403(self):
        response = self.client_as(self.c).post(
            self.projects_url(), {"name": "x", "identifier": "VVV"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_by_outsider_404(self):
        response = self.client_as(self.d).post(
            self.projects_url(), {"name": "x", "identifier": "OOO"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_identifier_duplicate_400_within_workspace(self):
        response = self.client_as(self.a).post(
            self.projects_url(), {"name": "重复", "identifier": IDENTIFIER}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("identifier", response.json())

    def test_identifier_lowercase_400(self):
        response = self.client_as(self.a).post(
            self.projects_url(), {"name": "小写", "identifier": "ami"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("identifier", response.json())

    def test_identifier_unique_per_workspace_not_global(self):
        """identifier 只要求工作区内唯一（跨工作区允许重复）。"""
        from apps.workspaces import services as ws_services

        other_ws = ws_services.create_workspace(self.d, "另一个工作区", "other-ws")
        response = self.client_as(self.d).post(
            self.projects_url(other_ws),
            {"name": "跨工作区同名", "identifier": IDENTIFIER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_detail_readonly_roles(self):
        """生效角色：项目成员取项目角色；非成员的 WS Member/Viewer 等效只读。"""
        cases = {
            self.b: ProjectRoles.ADMIN,  # 项目创建者
            self.a: ProjectRoles.ADMIN,  # WS Admin 视同
            self.c: ProjectRoles.VIEWER,  # WS Viewer 等效只读
        }
        for user, expected in cases.items():
            with self.subTest(user=user.username, expected=expected):
                response = self.client_as(user).get(self.project_url())
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.json()["current_user_role"], expected)

    def test_detail_outsider_404(self):
        response = self.client_as(self.d).get(self.project_url())
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_by_project_admin_200(self):
        response = self.client_as(self.b).patch(
            self.project_url(), {"name": "改名成功"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["name"], "改名成功")

    def test_patch_by_ws_admin_200(self):
        """A 不是项目成员，但 WS Admin 视同项目 Admin（03 契约）。"""
        response = self.client_as(self.a).patch(
            self.project_url(), {"description": "WS Admin 改的"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_delete_by_project_admin_204(self):
        response = self.client_as(self.b).delete(self.project_url())
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.filter(id=self.project.id).exists())

    def test_states_list_for_member(self):
        response = self.client_as(self.c).get(f"{self.project_url()}states/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["count"], 5)

    def test_states_list_for_outsider_404(self):
        response = self.client_as(self.d).get(f"{self.project_url()}states/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ProjectPermissionMatrixTests(ProjectTestBase):
    """03 契约「生效角色」× PATCH/DELETE 的逐格参数化验证。"""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls._build_workspace()
        cls.project = services.create_project(cls.workspace, cls.a, name="矩阵", identifier="MTX")
        cls.member_b = ProjectMember.objects.create(
            project=cls.project, user=cls.b, role=ProjectRoles.MEMBER
        )
        cls.member_c = ProjectMember.objects.create(
            project=cls.project, user=cls.c, role=ProjectRoles.VIEWER
        )

    def test_write_matrix(self):
        """(用户, 期望状态码)：写操作需生效角色 ≥ 项目 Admin。"""
        matrix = [
            (self.a, status.HTTP_200_OK),  # WS Admin 视同 Admin
            (self.b, status.HTTP_403_FORBIDDEN),  # 项目 Member
            (self.c, status.HTTP_403_FORBIDDEN),  # 项目 Viewer
            (self.d, status.HTTP_404_NOT_FOUND),  # 非 WS 成员
        ]
        for user, expected in matrix:
            with self.subTest(user=user.username, expected=expected):
                response = self.client_as(user).patch(
                    self.project_url(), {"name": "矩阵改"}, format="json"
                )
                self.assertEqual(response.status_code, expected)

    def test_read_matrix(self):
        """读操作：任何 WS 成员可读，外人 404。"""
        matrix = [
            (self.a, status.HTTP_200_OK),
            (self.b, status.HTTP_200_OK),
            (self.c, status.HTTP_200_OK),
            (self.d, status.HTTP_404_NOT_FOUND),
        ]
        for user, expected in matrix:
            with self.subTest(user=user.username, expected=expected):
                response = self.client_as(user).get(self.project_url())
                self.assertEqual(response.status_code, expected)


class ProjectMemberTests(ProjectTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls._build_workspace()
        cls.project = services.create_project(
            cls.workspace, cls.a, name="成员测试", identifier="MBR"
        )
        cls.member_b = ProjectMember.objects.create(
            project=cls.project, user=cls.b, role=ProjectRoles.MEMBER
        )

    def test_add_ws_member_201(self):
        response = self.client_as(self.a).post(
            self.members_url(),
            {"user_id": str(self.c.id), "role": ProjectRoles.VIEWER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["user"]["username"], "c_viewer")

    def test_add_non_workspace_user_400(self):
        response = self.client_as(self.a).post(
            self.members_url(),
            {"user_id": str(self.d.id), "role": ProjectRoles.MEMBER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_id", response.json())

    def test_add_by_project_member_403(self):
        """项目 Member 无权管理成员（03 契约）。"""
        response = self.client_as(self.b).post(
            self.members_url(),
            {"user_id": str(self.c.id), "role": ProjectRoles.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_add_by_ws_admin_201(self):
        """A 不是项目成员，但 WS Admin 视同项目 Admin，可添加成员（03 契约）。"""
        response = self.client_as(self.a).post(
            self.members_url(),
            {"user_id": str(self.c.id), "role": ProjectRoles.VIEWER},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_change_role_200(self):
        response = self.client_as(self.a).patch(
            self.member_url(self.member_b),
            {"role": ProjectRoles.ADMIN},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["role"], ProjectRoles.ADMIN)

    def test_remove_creator_last_admin_400(self):
        """创建者（唯一 Admin）自行退出 → 400，保证项目始终有管理员。"""
        creator_member = ProjectMember.objects.get(project=self.project, user=self.a)
        response = self.client_as(self.a).delete(self.member_url(creator_member))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "至少保留一位项目管理员。")

    def test_project_list_query_count_no_n_plus_one(self):
        """项目列表：5 个项目时查询数与 1 个项目时一致（角色映射批量计算）。"""
        for i in range(4):
            services.create_project(self.workspace, self.a, name=f"P{i}", identifier=f"P{i}X")
        url = self.projects_url()
        client = self.client_as(self.c)

        with self.assertNumQueries(5):
            client.get(url)
