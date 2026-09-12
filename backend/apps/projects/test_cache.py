"""Project 详情缓存的集成测试（契约 docs/api/07-cache-and-tasks.md）。

验收点（计划 §Sprint 6 测试清单）：
- project_detail_cached：命中路径不再查项目行（assertNumQueries）
- patch / delete / member change 三个失效点
- 缓存体与直读响应一致（current_user_role 每次注入，不进缓存）
- 缓存不能绕过防枚举（非成员拿不到别的项目的详情）
"""

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.projects import cache as project_cache
from apps.projects.models import ProjectMember, ProjectRoles
from apps.projects.services import add_member, create_project
from apps.users.models import User
from apps.workspaces.services import create_workspace
from core import cache as cache_primitives
from core.testing import TEST_PASSWORD


def make_user(name: str) -> User:
    return User.objects.create_user(
        username=name, email=f"{name}@example.com", password=TEST_PASSWORD
    )


class ProjectDetailCacheTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = make_user("cache-owner")
        cls.member = make_user("cache-member")
        cls.stranger = make_user("cache-stranger")
        cls.workspace = create_workspace(cls.owner, "Cache Workspace", "cache-ws")
        cls.project = create_project(cls.workspace, cls.owner, name="缓存项目", identifier="CCH")
        ProjectMember.objects.create(project=cls.project, user=cls.member, role=ProjectRoles.MEMBER)

    @property
    def detail_url(self) -> str:
        return f"/api/v1/workspaces/{self.workspace.slug}/projects/{self.project.id}/"

    def as_owner(self):
        self.client.force_authenticate(user=self.owner)

    def test_cold_and_warm_reads_return_the_same_body(self):
        """两次读取响应体完全一致 —— 这是"缓存读 == 直读"的一致性验收。"""
        self.as_owner()
        cold = self.client.get(self.detail_url).json()
        warm = self.client.get(self.detail_url).json()

        self.assertEqual(cold["name"], "缓存项目")
        self.assertEqual(cold, warm)
        self.assertEqual(cold["current_user_role"], ProjectRoles.ADMIN)

    def test_warm_read_skips_the_project_row_query(self):
        """命中缓存后不再查项目行：鉴权只剩 1 条成员身份查询。"""
        self.as_owner()
        self.client.get(self.detail_url)  # 预热

        with self.assertNumQueries(1):
            response = self.client.get(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_per_user_field_is_never_cached(self):
        """`current_user_role` 必须每次注入：A 的角色不能泄露给 B。"""
        self.as_owner()
        self.client.get(self.detail_url)
        cached = project_cache.get_detail(self.workspace.slug, self.project.id)
        self.assertIsNotNone(cached)
        self.assertNotIn("current_user_role", cached)

        self.client.force_authenticate(user=self.member)
        body = self.client.get(self.detail_url).json()
        self.assertEqual(body["current_user_role"], ProjectRoles.MEMBER)
        self.assertEqual(body["name"], cached["name"])

    def test_cache_hit_cannot_bypass_workspace_scoping(self):
        """跨工作区访问（防枚举）不能被缓存绕过。"""
        other_workspace = create_workspace(self.owner, "Other WS", "other-ws")
        self.client.force_authenticate(user=self.member)

        foreign_url = f"/api/v1/workspaces/{other_workspace.slug}/projects/{self.project.id}/"
        self.assertEqual(self.client.get(foreign_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_non_member_gets_404_even_on_cache_hit(self):
        """缓存命中也要做鉴权：非成员一律 404（防枚举）。"""
        self.as_owner()
        self.client.get(self.detail_url)
        self.assertIsNotNone(project_cache.get_detail(self.workspace.slug, self.project.id))

        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.get(self.detail_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_invalidates_cache(self):
        self.as_owner()
        self.client.get(self.detail_url)  # 预热

        response = self.client.patch(self.detail_url, {"name": "改名后的项目"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        body = self.client.get(self.detail_url).json()
        self.assertEqual(body["name"], "改名后的项目")

    def test_delete_invalidates_cache(self):
        self.as_owner()
        self.client.get(self.detail_url)  # 预热
        project_id = self.project.id

        self.assertEqual(
            self.client.delete(self.detail_url).status_code, status.HTTP_204_NO_CONTENT
        )
        self.assertIsNone(project_cache.get_detail(self.workspace.slug, project_id))
        self.assertEqual(self.client.get(self.detail_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_member_change_invalidates_cache(self):
        """防御性失效：缓存体没有成员字段，
        但失效点必须预留（见 services._invalidate_project_cache）。"""
        self.as_owner()
        self.client.get(self.detail_url)  # 预热
        scope = project_cache.detail_scope(self.workspace.slug, self.project.id)
        version_before = cache.get(cache_primitives.version_key("project", scope=scope))

        # 新人必须先加入工作区（03 契约：项目成员必须是工作区成员）
        newcomer = make_user("cache-newcomer")
        from apps.workspaces.models import WorkspaceMember, WorkspaceRoles

        WorkspaceMember.objects.create(
            workspace=self.workspace, user=newcomer, role=WorkspaceRoles.MEMBER
        )
        add_member(self.workspace, self.project, str(newcomer.id), ProjectRoles.VIEWER)

        self.assertEqual(
            cache.get(cache_primitives.version_key("project", scope=scope)), version_before + 1
        )
        # 版本号前进后，旧键下的缓存读不到
        self.assertIsNone(project_cache.get_detail(self.workspace.slug, self.project.id))
