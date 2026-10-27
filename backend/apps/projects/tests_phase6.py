"""Phase 6 · 团队模式降级与兼容验收测试。"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.projects import services as project_services
from apps.projects.models import ProjectMember, ProjectRoles
from apps.workspaces import services as ws_services
from apps.workspaces.models import WorkspaceRoles

User = get_user_model()


class TeamModePhase6Tests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="p6-owner", email="p6-owner@example.com", password="pw-p6-owner"
        )
        self.member = User.objects.create_user(
            username="p6-member", email="p6-member@example.com", password="pw-p6-member"
        )
        self.outsider = User.objects.create_user(
            username="p6-outsider", email="p6-outsider@example.com", password="pw-p6-outsider"
        )
        self.client.force_authenticate(self.owner)
        self.workspace = ws_services.create_workspace(self.owner, "Phase6 Team", "phase6-team")
        ws_services.add_member(self.workspace, self.member.email, WorkspaceRoles.MEMBER)

    def _team_project(self, owner=None):
        return project_services.create_project(
            owner or self.owner,
            workspace=self.workspace,
            name="团队工程",
            identifier="P6T",
        )

    def test_canonical_list_workspace_filter_and_anti_enumeration(self):
        project = self._team_project()

        rows = self.client.get("/api/v1/projects/?scope=accessible&workspace=phase6-team").json()[
            "results"
        ]
        self.assertEqual([row["id"] for row in rows], [str(project.id)])

        # owned + workspace filter 只返回自己拥有的；accessible 才包含他人工程。
        self.client.force_authenticate(self.member)
        owned = self.client.get("/api/v1/projects/?scope=owned&workspace=phase6-team").json()[
            "results"
        ]
        accessible = self.client.get(
            "/api/v1/projects/?scope=accessible&workspace=phase6-team"
        ).json()["results"]
        self.assertEqual(owned, [])
        self.assertEqual([row["id"] for row in accessible], [str(project.id)])

        self.client.force_authenticate(self.outsider)
        self.assertEqual(
            self.client.get("/api/v1/projects/?scope=accessible&workspace=phase6-team").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_project_member_override_wins_over_workspace_role(self):
        # 工程属于 WS Member；WS Admin 被项目显式降级为 VIEWER。
        project = self._team_project(owner=self.member)
        ProjectMember.objects.create(project=project, user=self.owner, role=ProjectRoles.VIEWER)

        self.client.force_authenticate(self.owner)
        row = self.client.get(f"/api/v1/projects/{project.id}/").json()
        self.assertEqual(row["current_user_role"], ProjectRoles.VIEWER)

        # 工程所有者的 owner 短路仍为 ADMIN（ProjectMember 也不能把 owner 降级）。
        self.client.force_authenticate(self.member)
        row = self.client.get(f"/api/v1/projects/{project.id}/").json()
        self.assertEqual(row["current_user_role"], ProjectRoles.ADMIN)

    def test_share_requires_owner_and_is_explicit(self):
        project = project_services.create_project(self.owner, name="私人", identifier="P6P")
        payload = dict(workspace_id=str(self.workspace.id))

        # 非 owner 连私人工程都不可见（防枚举 404），更不可能共享
        self.client.force_authenticate(self.member)
        r = self.client.post(f"/api/v1/projects/{project.id}/share/", payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND, r.content)

        self.client.force_authenticate(self.owner)
        r = self.client.post(f"/api/v1/projects/{project.id}/share/", payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertEqual(r.json()["workspace"], str(self.workspace.id))
        self.assertTrue(
            ProjectMember.objects.filter(
                project=project, user=self.owner, role=ProjectRoles.ADMIN
            ).exists()
        )

        # 团队成员获得可见性（WS Member 默认为 Viewer）
        self.client.force_authenticate(self.member)
        detail = self.client.get(f"/api/v1/projects/{project.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertEqual(detail.json()["current_user_role"], ProjectRoles.VIEWER)

        # 已属于团队后不能直接共享到另一个工作区（必须先脱离）
        other = ws_services.create_workspace(self.owner, "Other Team", "phase6-other")
        self.client.force_authenticate(self.owner)
        r = self.client.post(
            f"/api/v1/projects/{project.id}/share/",
            dict(workspace_id=str(other.id)),
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST, r.content)

    def test_detach_clears_members_and_keeps_owner_access(self):
        project = self._team_project()
        ProjectMember.objects.create(project=project, user=self.member, role=ProjectRoles.ADMIN)

        self.client.force_authenticate(self.owner)
        r = self.client.post(f"/api/v1/projects/{project.id}/detach/", dict(), format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertIsNone(r.json()["workspace"])
        self.assertFalse(ProjectMember.objects.filter(project=project).exists())

        self.assertEqual(
            self.client.get(f"/api/v1/projects/{project.id}/").status_code, status.HTTP_200_OK
        )
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{project.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_only_owner_can_detach(self):
        project = self._team_project()
        self.client.force_authenticate(self.member)
        r = self.client.post(f"/api/v1/projects/{project.id}/detach/", dict(), format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN, r.content)
