"""Sprint 12 验收：Agent Token 认证 + 权限白名单 + 幂等 + 工程动作。"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.agents.models import AgentScopes, AgentToken
from apps.issues.models import Issue
from apps.projects import services as project_services
from apps.worklogs.models import Worklog
from apps.workspaces import services as ws_services
from core.testing import TEST_PASSWORD

User = get_user_model()
PASSWORD = TEST_PASSWORD


class AgentApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="o@t.cn", password=PASSWORD)
        self.ws = ws_services.create_workspace(self.user, "W", "ww")
        self.proj = project_services.create_project(self.ws, self.user, name="P", identifier="PP")
        self.token, self.raw = AgentToken.mint(self.user, name="ci-agent")
        self.agent = APITestCase.client_class()
        self.agent.credentials(HTTP_AUTHORIZATION=f"Bearer {self.raw}")

    def _task_payload(self, **over):
        p = {"workspace_slug": self.ws.slug, "project_id": str(self.proj.id), "title": "T"}
        p.update(over)
        return p

    def test_bad_token_rejected(self):
        client = APITestCase.client_class()
        client.credentials(HTTP_AUTHORIZATION="Bearer mpa_wrong")
        r = client.get(f"/api/v1/agent/projects/{self.ws.slug}/{self.proj.id}/")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_project_get_with_token(self):
        r = self.agent.get(f"/api/v1/agent/projects/{self.ws.slug}/{self.proj.id}/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()["project"]["name"], "P")
        self.assertIn("plan", r.json())

    def test_task_create_start_complete_lifecycle(self):
        r = self.agent.post(
            "/api/v1/agent/tasks/", self._task_payload(title="Agent 任务"), format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        issue_id = r.json()["id"]

        s = self.agent.post(f"/api/v1/agent/tasks/{issue_id}/start/")
        self.assertEqual(s.status_code, status.HTTP_200_OK)
        self.assertEqual(Issue.objects.get(id=issue_id).state.group, "started")

        c = self.agent.post(f"/api/v1/agent/tasks/{issue_id}/complete/")
        self.assertEqual(c.status_code, status.HTTP_200_OK)
        self.assertEqual(Issue.objects.get(id=issue_id).state.group, "completed")

    def test_scope_enforcement(self):
        # 只给 read_project 的 token 不能建任务
        limited, limited_raw = AgentToken.mint(
            self.user, name="reader", scopes=[AgentScopes.READ_PROJECT]
        )
        client = APITestCase.client_class()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {limited_raw}")
        r = client.post("/api/v1/agent/tasks/", self._task_payload(), format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIsNotNone(limited)

    def test_idempotency_key_dedupes(self):
        headers = {"HTTP_IDEMPOTENCY_KEY": "run-1-task-x"}
        p = self._task_payload(title="幂等任务")
        r1 = self.agent.post("/api/v1/agent/tasks/", p, format="json", **headers)
        r2 = self.agent.post("/api/v1/agent/tasks/", p, format="json", **headers)
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r1.json()["id"], r2.json()["id"])
        # 只产生一条 Issue
        self.assertEqual(Issue.objects.filter(title="幂等任务").count(), 1)

    def test_worklog_source_is_agent(self):
        r = self.agent.post(
            "/api/v1/agent/worklogs/",
            self._task_payload(title="日志", summary="Agent 写的"),
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        w = Worklog.objects.get(id=r.json()["id"])
        self.assertEqual(w.source, "agent")

    def test_progress_update(self):
        from apps.projects import services as pservices

        plan = pservices.get_or_create_plan(self.proj)
        stage = pservices.add_stage(plan, name="S1")
        r = self.agent.post(
            f"/api/v1/agent/projects/{self.ws.slug}/{self.proj.id}/progress/",
            {"stage_id": str(stage.id), "progress": 60, "set_current": True},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()["progress"], 60)
        self.assertEqual(r.json()["current_stage"]["name"], "S1")

    def test_revoke_invalidates_token(self):
        self.client.force_authenticate(self.user)
        tid = self.token.id
        self.client.post(f"/api/v1/agent/tokens/{tid}/revoke/")
        r = self.agent.get(f"/api/v1/agent/projects/{self.ws.slug}/{self.proj.id}/")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_agent_token_cannot_manage_tokens(self):
        # Agent Token 不能用来创建/列出 Token（管理走用户会话）→ 未认证被拒
        r = self.agent.get("/api/v1/agent/tokens/")
        self.assertIn(r.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
