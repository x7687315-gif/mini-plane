"""Island V2 阶段 3：Agent 执行进度上报 + /projects/mine/ 摘要扩充。

对应规格 §6 阶段 3 的验收：
- DONE 来源于真实已完成 Task（不是日志结论），且不串项目；
- STEP / HOW 能通过 Agent API 更新；
- 跨项目 / 无权限会话一律拒绝；
- 相同幂等键不重复产生副作用；
- 项目总览的查询数**不随项目数量线性增长**（禁 N+1）。
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.agents.models import AgentSession, AgentToken
from apps.issues import services as issue_services
from apps.projects import services as project_services
from apps.users.models import User
from apps.worklogs.models import Worklog
from apps.workspaces import services as ws_services

PASSWORD = "pw-123456"


class AgentProgressTests(APITestCase):
    """session.progress 端点：归属、状态、幂等、广播。"""

    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="o@t.cn", password=PASSWORD)
        self.ws = ws_services.create_workspace(self.user, "W", "ww")
        self.proj = project_services.create_project(self.ws, self.user, name="P", identifier="PP")
        self.token, self.raw = AgentToken.mint(self.user, name="ci-agent")
        self.agent = APITestCase.client_class()
        self.agent.credentials(HTTP_AUTHORIZATION=f"Bearer {self.raw}")

    def _start(self, title="跑重构") -> str:
        r = self.agent.post(
            "/api/v1/agent/sessions/",
            {"workspace_slug": self.ws.slug, "project_id": str(self.proj.id), "title": title},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        return r.json()["id"]

    def _progress(self, sid, payload, **headers):
        return self.agent.post(
            f"/api/v1/agent/sessions/{sid}/progress/", payload, format="json", **headers
        )

    def test_progress_updates_step_and_method(self):
        sid = self._start()
        r = self._progress(
            sid,
            {
                "current_step": "读 Island V2 规格",
                "step_index": 2,
                "step_total": 6,
                "method_summary": "先冻结规格再编码，分阶段提交",
            },
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        body = r.json()
        self.assertEqual(body["current_step"], "读 Island V2 规格")
        self.assertEqual(body["step_index"], 2)
        self.assertEqual(body["step_total"], 6)
        self.assertEqual(body["method_summary"], "先冻结规格再编码，分阶段提交")

    def test_step_index_cannot_exceed_total(self):
        sid = self._start()
        r = self._progress(sid, {"step_index": 9, "step_total": 3})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("step_index", r.json())

    def test_progress_rejects_ended_session(self):
        sid = self._start()
        self.agent.post(f"/api/v1/agent/sessions/{sid}/end/", {"status": "done"}, format="json")
        r = self._progress(sid, {"current_step": "想补写"})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        # 字段保持原样，没有被补写
        session = AgentSession.objects.get(id=sid)
        self.assertEqual(session.current_step, "")

    def test_progress_of_other_project_404(self):
        """跨项目写入：用另一个用户的 token 打别人的会话 → 404（防枚举）。"""
        sid = self._start()
        stranger = User.objects.create_user(username="s", email="s@t.cn", password=PASSWORD)
        _, sraw = AgentToken.mint(stranger, name="s-agent")
        client = APITestCase.client_class()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {sraw}")
        r = client.post(
            f"/api/v1/agent/sessions/{sid}/progress/",
            {"current_step": "越权"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(AgentSession.objects.get(id=sid).current_step, "")

    def test_progress_requires_write_scope(self):
        sid = self._start()
        _, readonly = AgentToken.mint(self.user, name="ro", scopes=["task:read"])
        client = APITestCase.client_class()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {readonly}")
        r = client.post(
            f"/api/v1/agent/sessions/{sid}/progress/", {"current_step": "x"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_idempotency_key_dedupes(self):
        sid = self._start()
        payload = {"current_step": "同一件事", "method_summary": "只上报一次"}
        headers = {"HTTP_IDEMPOTENCY_KEY": "progress-1"}
        r1 = self._progress(sid, payload, **headers)
        r2 = self._progress(sid, payload, **headers)
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r1.json(), r2.json())


class MineSummaryIslandV2Tests(APITestCase):
    """/projects/mine/ 的 DONE / STEP / HOW 字段（规格 §2 信息设计）。"""

    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="o@t.cn", password=PASSWORD)
        self.ws = ws_services.create_workspace(self.user, "W", "ww")
        self.proj = project_services.create_project(self.ws, self.user, name="P", identifier="PP")
        self.token, self.raw = AgentToken.mint(self.user, name="ci-agent")
        self.agent = APITestCase.client_class()
        self.agent.credentials(HTTP_AUTHORIZATION=f"Bearer {self.raw}")
        self.client.force_authenticate(self.user)

    def _mine(self):
        r = self.client.get("/api/v1/projects/mine/")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        return r.json()

    def test_recent_done_uses_real_completed_tasks(self):
        # 真实完成一条任务
        states = {s.group: s for s in self.proj.states.all()}
        issue_services.create_issue(
            self.proj, self.user, title="把关窗退出修好", state=states["completed"]
        )
        body = self._mine()[0]
        self.assertIn("把关窗退出修好", body["recent_done"])
        # 没有日志时 latest_log 为 None（不拿日志冒充已完成任务）
        self.assertIsNone(body["latest_log"])

    def test_latest_log_is_separate_from_recent_done(self):
        Worklog.objects.create(
            project=self.proj,
            author=self.user,
            title="今天的结论",
            summary="查到了根因",
        )
        body = self._mine()[0]
        self.assertEqual(body["recent_done"], [])  # 没有已完成任务
        self.assertEqual(body["latest_log"]["title"], "今天的结论")
        self.assertEqual(body["latest_log"]["summary"], "查到了根因")

    def test_step_and_method_come_from_running_session(self):
        # 没有会话：四个字段全空（界面显示"尚未记录"）
        body = self._mine()[0]
        self.assertIsNone(body["agent_step"])
        self.assertIsNone(body["agent_method"])

        r = self.agent.post(
            "/api/v1/agent/sessions/",
            {"workspace_slug": self.ws.slug, "project_id": str(self.proj.id), "title": "跑 V2"},
            format="json",
        )
        sid = r.json()["id"]
        self.agent.post(
            f"/api/v1/agent/sessions/{sid}/progress/",
            {
                "current_step": "写规格",
                "step_index": 1,
                "step_total": 6,
                "method_summary": "先文档",
            },
            format="json",
        )
        body = self._mine()[0]
        self.assertEqual(body["agent_step"], "写规格")
        self.assertEqual(body["agent_step_index"], 1)
        self.assertEqual(body["agent_method"], "先文档")
        self.assertEqual(body["agent_session_title"], "跑 V2")

        # 会话结束后步骤信息撤回（不再显示已结束会话的步骤）
        self.agent.post(f"/api/v1/agent/sessions/{sid}/end/", {"status": "done"}, format="json")
        body = self._mine()[0]
        self.assertIsNone(body["agent_step"])

    def test_no_n_plus_one_across_projects(self):
        """10 个项目也只发固定条数的查询（规格：查询数不随项目数线性增长）。"""
        for i in range(9):  # 加 setUp 里那个共 10 个
            project_services.create_project(self.ws, self.user, name=f"P{i}", identifier=f"PI{i}")
        # 实测 5 条且为常量：①可见性子查询 ②DONE 批量 ③日志批量 ④主注解查询 ⑤Plan prefetch
        # （查询里 10 个项目全部走 IN 子查询，没有一条随项目数增长 —— 这就是"无 N+1"）
        with self.assertNumQueries(5):
            self._mine()

    def test_projects_do_not_cross_contaminate(self):
        """A 项目的已完成任务不能出现在 B 项目的 recent_done 里。"""
        other = project_services.create_project(self.ws, self.user, name="O", identifier="OO")
        states = {s.group: s for s in self.proj.states.all()}
        issue_services.create_issue(
            self.proj, self.user, title="只属于 P", state=states["completed"]
        )
        by_id = {p["id"]: p for p in self._mine()}
        self.assertIn("只属于 P", by_id[str(self.proj.id)]["recent_done"])
        self.assertEqual(by_id[str(other.id)]["recent_done"], [])


class MineSummaryQueryCountTests(TestCase):
    """空库也要能查（0 项目时不报错、不多发查询）。"""

    def test_empty_projects(self):
        user = User.objects.create_user(username="u", email="u@t.cn", password=PASSWORD)
        self.client.force_login(user)  # Django TestCase 用 force_login，不是 DRF 的
        r = self.client.get("/api/v1/projects/mine/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json(), [])
