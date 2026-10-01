"""Sprint 11 验收：Worklog（工程日志）CRUD + today 过滤 + 权限 + 跨项目 stage 404。"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.projects import services as project_services
from apps.workspaces import services as ws_services
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from core.testing import TEST_PASSWORD

User = get_user_model()
PASSWORD = TEST_PASSWORD


class WorklogTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="o@t.cn", password=PASSWORD)
        self.viewer = User.objects.create_user(username="vw", email="v@t.cn", password=PASSWORD)
        self.ws = ws_services.create_workspace(self.user, "W", "ww")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.viewer, role=WorkspaceRoles.VIEWER
        )
        self.proj = project_services.create_project(self.ws, self.user, name="P", identifier="PP")
        self.url = f"/api/v1/workspaces/{self.ws.slug}/projects/{self.proj.id}/worklogs/"
        self.client.force_authenticate(self.user)

    def _create(self, **over):
        payload = {"title": "TTS 实验", "summary": "更换参考音频并重训"}
        payload.update(over)
        return self.client.post(self.url, payload, format="json")

    def test_create_and_list(self):
        r = self._create(conclusion="217 字稳定", next_step="测 260 字")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        body = r.json()
        self.assertEqual(body["title"], "TTS 实验")
        self.assertEqual(body["source"], "manual")
        self.assertEqual(body["author"]["username"], "owner")
        self.assertEqual(body["date"], str(timezone.localdate()))

        listing = self.client.get(self.url).json()
        self.assertEqual(listing["count"], 1)

    def test_today_filter(self):
        self._create()
        self._create(title="昨天的", date=str(timezone.localdate() - timedelta(days=1)))
        today = self.client.get(self.url, {"date": "today"}).json()
        self.assertEqual(today["count"], 1)
        self.assertEqual(today["results"][0]["title"], "TTS 实验")

        bad = self.client.get(self.url, {"date": "not-a-date"})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_viewer_cannot_write(self):
        self.client.force_authenticate(self.viewer)
        r = self._create()
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        # 但可读
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)

    def test_stage_of_other_project_is_404(self):
        other = project_services.create_project(self.ws, self.user, name="O", identifier="OO")
        plan = project_services.get_or_create_plan(other)
        stage = project_services.add_stage(plan, name="OS")
        r = self._create(stage_id=str(stage.id))
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_and_delete(self):
        wid = self._create().json()["id"]
        r = self.client.patch(f"{self.url}{wid}/", {"conclusion": "已收敛"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()["conclusion"], "已收敛")

        d = self.client.delete(f"{self.url}{wid}/")
        self.assertEqual(d.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get(self.url).json()["count"], 0)

    def test_mine_includes_today_logs(self):
        self._create()
        mine = self.client.get("/api/v1/projects/mine/").json()
        self.assertEqual(mine[0]["today_logs"], 1)
