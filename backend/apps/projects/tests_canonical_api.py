"""Phase 3 · API 契约统一测试（规范路由 × 兼容路由 × 私人工程 × Agent）。

验收（计划 §Phase 3）：
- owner 可读自己的私人工程；他人 404（统一不可见语义）；
- 私人工程上全部核心端点**无需 workspace slug** 即可工作；
- 兼容路由与规范路由写同一数据、遵守相同权限（等价性抽查）；
- Agent：规范路径只凭 pid；scope/幂等不削弱；session.end 幂等回放（R-06）。
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.agents.models import AgentToken
from apps.issues import services as issue_services
from apps.projects import services as project_services

User = get_user_model()


class CanonicalProjectAPITests(APITestCase):
    """规范路由 /api/v1/projects/… 上的个人工程闭环（无 workspace 全流程）。"""

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="pw-alice-123"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="pw-bob-12345"
        )
        self.client.force_authenticate(self.alice)

    def _create_personal(self) -> str:
        r = self.client.post(
            "/api/v1/projects/", {"name": "私人工程", "identifier": "PRS"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        self.assertIsNone(r.json()["workspace"])
        self.assertEqual(r.json()["owner"], str(self.alice.id))
        return r.json()["id"]

    def test_personal_project_full_loop_without_workspace(self):
        pid = self._create_personal()

        # 详情 / 状态 / Plan
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{pid}/").status_code, status.HTTP_200_OK
        )
        self.assertEqual(self.client.get(f"/api/v1/projects/{pid}/states/").json()["count"], 5)
        r = self.client.post(f"/api/v1/projects/{pid}/plan/", {"name": "阶段一"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        sid = r.json()["id"]
        r = self.client.patch(
            f"/api/v1/projects/{pid}/plan/stages/{sid}/",
            {"progress": 40, "is_current": True},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)

        # Task 创建/列表/详情/更新 + stage 归属
        r = self.client.post(
            f"/api/v1/projects/{pid}/tasks/",
            {"title": "第一个任务", "stage_id": sid},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        self.assertEqual(r.json()["stage"]["name"], "阶段一")
        tid = r.json()["id"]
        self.assertEqual(self.client.get(f"/api/v1/projects/{pid}/tasks/").json()["count"], 1)
        # 评论
        r = self.client.post(
            f"/api/v1/projects/{pid}/tasks/{tid}/comments/",
            {"content": "开搞"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        cid = r.json()["id"]
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{pid}/tasks/{tid}/activities/").status_code,
            status.HTTP_200_OK,
        )
        # Worklog
        r = self.client.post(
            f"/api/v1/projects/{pid}/worklogs/",
            {"title": "今日", "summary": "搭好了骨架"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        # 工程活动流
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{pid}/activities/").status_code, status.HTTP_200_OK
        )
        # 评论删除（作者本人）
        self.assertEqual(
            self.client.delete(f"/api/v1/projects/{pid}/tasks/{tid}/comments/{cid}/").status_code,
            status.HTTP_204_NO_CONTENT,
        )
        # 删除 Task → 204
        self.assertEqual(
            self.client.delete(f"/api/v1/projects/{pid}/tasks/{tid}/").status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_list_scope_owned_and_accessible(self):
        self._create_personal()
        # bob 的工程对 alice 不可见
        self.client.force_authenticate(self.bob)
        self.client.post(
            "/api/v1/projects/", {"name": "Bob 的", "identifier": "BOB"}, format="json"
        )
        # bob：owned 只有自己；accessible 也只有自己的（看不到 alice 的私人工程）
        owned = self.client.get("/api/v1/projects/?scope=owned").json()["results"]
        acc = self.client.get("/api/v1/projects/?scope=accessible").json()["results"]
        self.assertEqual({p["identifier"] for p in owned}, {"BOB"})
        self.assertEqual({p["identifier"] for p in acc}, {"BOB"})

    def test_personal_project_hidden_from_others_on_canonical(self):
        pid = self._create_personal()
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{pid}/").status_code, status.HTTP_404_NOT_FOUND
        )

    def test_compat_and_canonical_same_data(self):
        """团队工程：兼容路由与规范路由读同一份数据（等价性抽查）。"""
        from apps.workspaces import services as ws_services

        ws = ws_services.create_workspace(self.alice, "团队", "team-ws")
        project = project_services.create_project(
            self.alice, workspace=ws, name="团队工程", identifier="TMA"
        )
        issue_services.create_issue(project, self.alice, title="任务一")

        canon = self.client.get(f"/api/v1/projects/{project.id}/tasks/").json()
        compat = self.client.get(f"/api/v1/workspaces/team-ws/projects/{project.id}/issues/").json()
        self.assertEqual(canon["count"], compat["count"])
        self.assertEqual(canon["results"][0]["id"], compat["results"][0]["id"])

        # 兼容路由写入 → 规范路由可见（同一存储）
        self.client.post(
            f"/api/v1/workspaces/team-ws/projects/{project.id}/issues/",
            {"title": "任务二"},
            format="json",
        )
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{project.id}/tasks/").json()["count"], 2
        )

    def test_workspace_create_requires_membership(self):
        from apps.workspaces import services as ws_services
        from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles

        ws = ws_services.create_workspace(self.alice, "团队", "team-ws")
        # bob 不是成员 → 拒绝创建团队工程
        self.client.force_authenticate(self.bob)
        r = self.client.post(
            "/api/v1/projects/",
            {"name": "偷建", "identifier": "HIJ", "workspace_id": str(ws.id)},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST, r.content)
        # 加入后（Member）可建
        WorkspaceMember.objects.create(workspace=ws, user=self.bob, role=WorkspaceRoles.MEMBER)
        r = self.client.post(
            "/api/v1/projects/",
            {"name": "正经建", "identifier": "OKP", "workspace_id": str(ws.id)},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        self.assertIsNotNone(r.json()["workspace"])


class AgentCanonicalTests(APITestCase):
    """Agent 规范路径（无 ws slug）+ session.end 幂等。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="agt", email="agt@example.com", password="pw-agt-12345"
        )
        self.outsider = User.objects.create_user(
            username="oth", email="oth@example.com", password="pw-oth-12345"
        )
        self.project = project_services.create_project(
            self.user, name="Agent 工程", identifier="AGT"
        )
        self.token, self.raw = AgentToken.mint(self.user, name="test")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.raw}")

    def test_agent_can_access_personal_project_without_slug(self):
        r = self.client.get(f"/api/v1/agent/projects/{self.project.id}/")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertEqual(r.json()["project"]["identifier"], "AGT")

    def test_agent_cannot_access_others_personal_project(self):
        token2, raw2 = AgentToken.mint(self.outsider, name="other")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw2}")
        r = self.client.get(f"/api/v1/agent/projects/{self.project.id}/")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_agent_task_create_without_slug(self):
        r = self.client.post(
            "/api/v1/agent/tasks/",
            {"project_id": str(self.project.id), "title": "Agent 建的任务"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)

    def test_session_end_idempotent_replay(self):
        """R-06：同 Idempotency-Key 重复 end → 回放首次响应，不产生副作用差异。"""
        r = self.client.post(
            "/api/v1/agent/sessions/",
            {"project_id": str(self.project.id), "title": "跑一轮"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        sid = r.json()["id"]

        h = {"HTTP_IDEMPOTENCY_KEY": "end-once"}
        first = self.client.post(
            f"/api/v1/agent/sessions/{sid}/end/", {"status": "done"}, format="json", **h
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.content)
        again = self.client.post(
            f"/api/v1/agent/sessions/{sid}/end/", {"status": "done"}, format="json", **h
        )
        self.assertEqual(first.json(), again.json())
        # 不同 key 的 end 仍是正常业务调用（重复 end 幂等于服务层：已结束不报错）
        third = self.client.post(
            f"/api/v1/agent/sessions/{sid}/end/", {"status": "stopped"}, format="json"
        )
        self.assertIn(third.status_code, (200, 400))
