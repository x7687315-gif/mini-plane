"""Phase 7 · Agent 幂等、Session 唯一与 Worklog 权限/审计测试。"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.activity.models import ActivityLog, EntityTypes
from apps.agents.models import AgentScopes, AgentSession, AgentToken, IdempotencyRecord
from apps.issues import services as issue_services
from apps.projects import services as project_services
from apps.projects.models import ProjectMember, ProjectRoles
from apps.worklogs.models import Worklog
from apps.workspaces import services as ws_services
from apps.workspaces.models import WorkspaceRoles

User = get_user_model()


class AgentPhase7Tests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="p7-owner", email="p7-owner@example.com", password="pw-p7-owner"
        )
        self.member = User.objects.create_user(
            username="p7-member", email="p7-member@example.com", password="pw-p7-member"
        )
        self.project = project_services.create_project(
            self.owner, name="Agent Phase7", identifier="P7A"
        )
        self.workspace = ws_services.create_workspace(self.owner, "P7 Team", "p7-team")
        ws_services.add_member(self.workspace, self.member.email, WorkspaceRoles.MEMBER)
        self.team_project = project_services.create_project(
            self.owner, workspace=self.workspace, name="Team P7", identifier="P7T"
        )
        self.token, self.raw = AgentToken.mint(self.owner, name="p7")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.raw}")

    def _headers(self, key):
        return {"HTTP_IDEMPOTENCY_KEY": key}

    def test_same_key_same_body_replays_without_duplicate(self):
        payload = {"project_id": str(self.project.id), "title": "幂等任务"}
        first = self.client.post(
            "/api/v1/agent/tasks/", payload, format="json", **self._headers("same-1")
        )
        second = self.client.post(
            "/api/v1/agent/tasks/", payload, format="json", **self._headers("same-1")
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.content)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(self.project.issues.count(), 1)

    def test_same_key_different_body_is_conflict(self):
        self.client.post(
            "/api/v1/agent/tasks/",
            {"project_id": str(self.project.id), "title": "第一版"},
            format="json",
            **self._headers("same-body"),
        )
        second = self.client.post(
            "/api/v1/agent/tasks/",
            {"project_id": str(self.project.id), "title": "第二版"},
            format="json",
            **self._headers("same-body"),
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT, second.content)
        self.assertEqual(self.project.issues.count(), 1)

    def test_same_key_different_action_is_conflict(self):
        self.client.post(
            "/api/v1/agent/tasks/",
            {"project_id": str(self.project.id), "title": "动作一"},
            format="json",
            **self._headers("same-action"),
        )
        second = self.client.post(
            "/api/v1/agent/sessions/",
            {"project_id": str(self.project.id), "title": "动作二"},
            format="json",
            **self._headers("same-action"),
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT, second.content)

    def test_in_flight_reservation_returns_conflict(self):
        IdempotencyRecord.objects.create(
            token=self.token,
            key="inflight",
            action="task.create",
            request_hash="",
            status_code=0,
            response={},
            expires_at=timezone.now() + timedelta(hours=1),
        )
        r = self.client.post(
            "/api/v1/agent/tasks/",
            {"project_id": str(self.project.id), "title": "并发占位"},
            format="json",
            **self._headers("inflight"),
        )
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT, r.content)
        self.assertEqual(self.project.issues.count(), 0)

    def test_expired_key_can_execute_again(self):
        IdempotencyRecord.objects.create(
            token=self.token,
            key="expired",
            action="task.create",
            request_hash="",
            status_code=201,
            response={"stale": True},
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        r = self.client.post(
            "/api/v1/agent/tasks/",
            {"project_id": str(self.project.id), "title": "过期后重试"},
            format="json",
            **self._headers("expired"),
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        self.assertNotIn("stale", r.json())

    def test_failed_request_is_not_cached(self):
        bad = self.client.post(
            "/api/v1/agent/worklogs/",
            {"project_id": str(self.project.id), "title": "", "summary": ""},
            format="json",
            **self._headers("retry-after-fail"),
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST, bad.content)
        good = self.client.post(
            "/api/v1/agent/worklogs/",
            {"project_id": str(self.project.id), "title": "修正后", "summary": "成功"},
            format="json",
            **self._headers("retry-after-fail"),
        )
        self.assertEqual(good.status_code, status.HTTP_201_CREATED, good.content)
        self.assertEqual(Worklog.objects.filter(project=self.project).count(), 1)

    def test_only_one_running_session_per_project(self):
        first = self.client.post(
            "/api/v1/agent/sessions/",
            {"project_id": str(self.project.id), "title": "第一轮"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        second = self.client.post(
            "/api/v1/agent/sessions/",
            {"project_id": str(self.project.id), "title": "第二轮"},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST, second.content)
        self.assertEqual(
            AgentSession.objects.filter(project=self.project, status="running").count(),
            1,
        )

    def test_repeated_session_end_is_rejected(self):
        started = self.client.post(
            "/api/v1/agent/sessions/",
            {"project_id": str(self.project.id), "title": "结束一次"},
            format="json",
        )
        sid = started.json()["id"]
        first = self.client.post(
            f"/api/v1/agent/sessions/{sid}/end/", {"status": "done"}, format="json"
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.content)
        second = self.client.post(
            f"/api/v1/agent/sessions/{sid}/end/", {"status": "stopped"}, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST, second.content)

    def test_read_task_scope_has_a_real_endpoint(self):
        issue_services.create_issue(self.project, self.owner, title="可读任务")
        token, raw = AgentToken.mint(self.owner, name="reader", scopes=[AgentScopes.READ_TASK])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
        r = self.client.get(f"/api/v1/agent/projects/{self.project.id}/tasks/")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertEqual(r.json()["count"], 1)

        token, raw = AgentToken.mint(
            self.owner, name="project-only", scopes=[AgentScopes.READ_PROJECT]
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
        r = self.client.get(f"/api/v1/agent/projects/{self.project.id}/tasks/")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN, r.content)

    def test_worklog_mutation_requires_author_or_admin(self):
        ProjectMember.objects.create(
            project=self.team_project, user=self.member, role=ProjectRoles.MEMBER
        )
        peer = User.objects.create_user(
            username="p7-peer", email="p7-peer@example.com", password="pw-p7-peer"
        )
        ws_services.add_member(self.workspace, peer.email, WorkspaceRoles.MEMBER)
        ProjectMember.objects.create(project=self.team_project, user=peer, role=ProjectRoles.MEMBER)

        self.client.force_authenticate(self.member)
        created = self.client.post(
            f"/api/v1/projects/{self.team_project.id}/worklogs/",
            {"title": "作者日志", "summary": "只有作者或管理员能改"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        worklog_id = created.json()["id"]

        self.client.force_authenticate(peer)
        denied = self.client.patch(
            f"/api/v1/projects/{self.team_project.id}/worklogs/{worklog_id}/",
            {"title": "同伴篡改"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN, denied.content)

        self.client.force_authenticate(self.owner)
        allowed = self.client.patch(
            f"/api/v1/projects/{self.team_project.id}/worklogs/{worklog_id}/",
            {"title": "管理员修订"},
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.content)

        self.client.force_authenticate(self.member)
        deleted = self.client.delete(
            f"/api/v1/projects/{self.team_project.id}/worklogs/{worklog_id}/"
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT, deleted.content)

    def test_worklog_writes_activity_and_survives_project_delete(self):
        ProjectMember.objects.create(
            project=self.team_project, user=self.member, role=ProjectRoles.MEMBER
        )
        self.client.force_authenticate(self.member)
        created = self.client.post(
            f"/api/v1/projects/{self.team_project.id}/worklogs/",
            {"title": "审计日志", "summary": "删除工程后仍应保留"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        worklog_id = created.json()["id"]
        self.assertTrue(
            ActivityLog.objects.filter(
                entity_type=EntityTypes.WORKLOG, entity_id=worklog_id
            ).exists()
        )

        self.client.force_authenticate(self.owner)
        deleted = self.client.delete(f"/api/v1/projects/{self.team_project.id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT, deleted.content)
        self.assertFalse(Worklog.objects.filter(id=worklog_id).exists())
        audit = ActivityLog.objects.get(entity_type=EntityTypes.WORKLOG, entity_id=worklog_id)
        self.assertIsNone(audit.project_id)
