"""Sprint 2 验收测试：Workspace 与成员管理（契约 docs/api/02-workspaces.md）。

用户角色约定：A=所有者/Admin，B=成员(15)，C=只读(5)，D=未入工作区（外人）。
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.projects.models import Project
from apps.workspaces import services
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles
from core.testing import TEST_PASSWORD

User = get_user_model()

PASSWORD = TEST_PASSWORD
LIST_URL = "/api/v1/workspaces/"


class WorkspaceTestBase(APITestCase):
    """公共夹具：四个用户 + 一个带三种角色成员的工作区。"""

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

        cls.workspace = services.create_workspace(cls.a, "Amiya 工作区", "amiya")
        cls.member_b = WorkspaceMember.objects.create(
            workspace=cls.workspace, user=cls.b, role=WorkspaceRoles.MEMBER
        )
        cls.member_c = WorkspaceMember.objects.create(
            workspace=cls.workspace, user=cls.c, role=WorkspaceRoles.VIEWER
        )

    def setUp(self):
        self.client = APIClient()

    def client_as(self, user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def detail_url(self, workspace=None) -> str:
        return f"{LIST_URL}{(workspace or self.workspace).slug}/"

    def member_url(self, member, workspace=None) -> str:
        return f"{self.detail_url(workspace)}members/{member.id}/"


class WorkspaceCRUDTests(WorkspaceTestBase):
    def test_create_returns_201_and_creator_is_admin(self):
        response = self.client_as(self.d).post(
            LIST_URL, {"name": "新工作区", "slug": "new-ws"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["slug"], "new-ws")
        self.assertEqual(body["current_role"], WorkspaceRoles.ADMIN)
        self.assertTrue(
            WorkspaceMember.objects.filter(
                workspace_id=body["id"], user=self.d, role=WorkspaceRoles.ADMIN
            ).exists()
        )

    def test_create_slug_conflict_auto_suffix(self):
        client = self.client_as(self.d)
        first = client.post(LIST_URL, {"name": "Demo", "slug": "demo"}, format="json")
        second = client.post(LIST_URL, {"name": "Demo2", "slug": "demo"}, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.json()["slug"], "demo-2")

    def test_create_invalid_slug_400(self):
        response = self.client_as(self.d).post(
            LIST_URL, {"name": "坏 slug", "slug": "AB!"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slug", response.json())

    def test_list_only_shows_mine(self):
        outsider_body = self.client_as(self.d).get(LIST_URL).json()
        admin_body = self.client_as(self.a).get(LIST_URL).json()

        self.assertEqual(outsider_body["count"], 0)
        self.assertEqual(admin_body["count"], 1)
        self.assertEqual(admin_body["results"][0]["current_role"], WorkspaceRoles.ADMIN)

    def test_detail_member_200_with_current_role(self):
        response = self.client_as(self.b).get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["current_role"], WorkspaceRoles.MEMBER)

    def test_detail_outsider_404(self):
        """外人访问一律 404，不暴露资源存在性（§4.3 防枚举）。"""
        response = self.client_as(self.d).get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_by_admin_200(self):
        response = self.client_as(self.a).patch(self.detail_url(), {"name": "改名"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["name"], "改名")

    def test_patch_by_member_403(self):
        response = self.client_as(self.b).patch(self.detail_url(), {"name": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_slug_conflict_auto_suffix(self):
        other = services.create_workspace(self.d, "Other", "other")
        response = self.client_as(self.d).patch(
            self.detail_url(other), {"slug": "amiya"}, format="json"
        )
        self.assertEqual(response.json()["slug"], "amiya-2")

    def test_delete_by_admin_204_and_cascades(self):
        from apps.projects import services as project_services

        project_services.create_project(self.workspace, self.a, name="P", identifier="DEL")
        response = self.client_as(self.a).delete(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Workspace.objects.filter(slug=self.workspace.slug).count(), 0)
        self.assertEqual(Project.objects.filter(workspace_id=self.workspace.id).count(), 0)
        self.assertEqual(WorkspaceMember.objects.filter(workspace_id=self.workspace.id).count(), 0)

    def test_delete_by_member_403(self):
        response = self.client_as(self.b).delete(self.detail_url())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class WorkspaceMemberTests(WorkspaceTestBase):
    def members_url(self, workspace=None) -> str:
        return f"{self.detail_url(workspace)}members/"

    def test_add_member_by_email_201(self):
        response = self.client_as(self.a).post(
            self.members_url(), {"email": "d_outsider@test.cn", "role": 15}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["user"]["username"], "d_outsider")
        self.assertEqual(response.json()["role"], WorkspaceRoles.MEMBER)

    def test_add_unknown_email_400(self):
        response = self.client_as(self.a).post(
            self.members_url(), {"email": "ghost@test.cn", "role": 15}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.json())

    def test_add_duplicate_member_400(self):
        response = self.client_as(self.a).post(
            self.members_url(), {"email": "b_member@test.cn", "role": 15}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_add_by_non_admin_403(self):
        response = self.client_as(self.b).post(
            self.members_url(), {"email": "d_outsider@test.cn", "role": 15}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_change_role_200(self):
        response = self.client_as(self.a).patch(
            self.member_url(self.member_c), {"role": WorkspaceRoles.MEMBER}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["role"], WorkspaceRoles.MEMBER)

    def test_change_owner_role_400(self):
        owner_member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.a)
        response = self.client_as(self.a).patch(
            self.member_url(owner_member), {"role": WorkspaceRoles.VIEWER}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.json())

    def test_remove_member_204(self):
        response = self.client_as(self.a).delete(self.member_url(self.member_c))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorkspaceMember.objects.filter(id=self.member_c.id).exists())

    def test_remove_owner_400(self):
        owner_member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.a)
        response = self.client_as(self.a).delete(self.member_url(owner_member))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "工作区所有者不可移除。")

    def test_remove_last_admin_guard_400(self):
        """守卫在服务层：构造『owner 被降级』的历史状态后，最后一个 Admin 移除自己 → 400。"""
        # 模拟所有者角色被历史操作降级（正常流程不可达，守卫为不变量兜底）
        WorkspaceMember.objects.filter(workspace=self.workspace, user=self.a).update(
            role=WorkspaceRoles.MEMBER
        )
        self.member_b.role = WorkspaceRoles.ADMIN
        self.member_b.save(update_fields=["role"])

        response = self.client_as(self.b).delete(self.member_url(self.member_b))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["detail"], "至少保留一位管理员。")

    def test_remove_ws_member_cascades_project_memberships(self):
        """不变量：非工作区成员不能再持有项目成员身份（§4.1）。"""
        from apps.projects import services as project_services
        from apps.projects.models import ProjectMember, ProjectRoles

        project = project_services.create_project(
            self.workspace, self.a, name="P2", identifier="PCC"
        )
        membership = ProjectMember.objects.create(
            project=project, user=self.b, role=ProjectRoles.MEMBER
        )

        response = self.client_as(self.a).delete(self.member_url(self.member_b))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectMember.objects.filter(id=membership.id).exists())

    def test_member_list_no_n_plus_one(self):
        """成员列表固定查询数：select_related(user) 生效，人数增加不增加查询。"""
        url = self.members_url()
        client = self.client_as(self.a)

        with self.assertNumQueries(4):
            client.get(url)

        # 再加 5 名成员后查询数不变（无 N+1）
        for i in range(5):
            user = User.objects.create_user(
                username=f"extra{i}", email=f"extra{i}@test.cn", password=PASSWORD
            )
            WorkspaceMember.objects.create(workspace=self.workspace, user=user)

        with self.assertNumQueries(4):
            client.get(url)
