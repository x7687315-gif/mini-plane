"""Phase 2 · 个人优先所有权测试（ADR-001 / DOMAIN_MODEL）。

覆盖：
- 私人工程（workspace=None）创建与可见性：仅 owner 可见，他人 404；
- owner 短路：owner 被移出工作区后仍可访问自己的团队工程；
- identifier 条件唯一：私人按 owner、团队按 workspace；
- /projects/mine/ 汇总包含私人工程，progress_source 与 last_activity 语义正确；
- is_current 部分唯一索引的数据库级兜底。
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.activity.models import ActivityLog
from apps.projects import services as project_services
from apps.projects.models import ProjectStage

User = get_user_model()

MINE_URL = "/api/v1/projects/mine/"


class PersonalProjectTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="pw-alice-123"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="pw-bob-12345"
        )

    def test_create_personal_project_without_workspace(self):
        project = project_services.create_project(self.alice, name="我的工程", identifier="PRS")
        self.assertIsNone(project.workspace)
        self.assertEqual(project.owner, self.alice)
        self.assertEqual(project.created_by, self.alice)
        # 预置五态 + 空 Plan（创建时显式建立，DOMAIN_MODEL §8）
        self.assertEqual(project.states.count(), 5)
        self.assertIsNotNone(project.plan)
        # 个人工程没有 ProjectMember（协作概念不进入个人路径）
        self.assertEqual(project.members.count(), 0)
        # 创建留痕正常（workspace 为空的审计行）
        self.assertTrue(
            ActivityLog.objects.filter(
                project=project, entity_type="project", action="created"
            ).exists()
        )

    def test_personal_project_visible_only_to_owner(self):
        from django.http import Http404

        from core.permissions import resolve_project_by_id

        project = project_services.create_project(self.alice, name="私有", identifier="SEC")

        resolved, role = resolve_project_by_id(self.alice, project.id)
        self.assertEqual(resolved.id, project.id)
        self.assertEqual(role, 20)  # owner → ADMIN

        with self.assertRaises(Http404):
            resolve_project_by_id(self.bob, project.id)

    def test_personal_project_not_in_old_workspace_url(self):
        """私人工程不出现在旧 /workspaces/{slug}/… 路径下（兼容路由语义不变）。"""
        from django.http import Http404

        from core.permissions import resolve_project

        project = project_services.create_project(self.alice, name="私有", identifier="SEC")
        # 私人工程没有 workspace，任何 slug 都不匹配
        with self.assertRaises(Http404):
            resolve_project(self.alice, "any-ws", project.id)

    def test_identifier_personal_scope_per_owner(self):
        """私人工程 identifier 在 owner 内唯一；不同 owner 可重名。"""
        project_services.create_project(self.alice, name="A1", identifier="DUP")
        # 同 owner 重名 → 400
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            project_services.create_project(self.alice, name="A2", identifier="DUP")
        # 不同 owner 同 identifier → 允许
        other = project_services.create_project(self.bob, name="B1", identifier="DUP")
        self.assertEqual(other.owner, self.bob)

    def test_mine_includes_personal_projects(self):
        project_services.create_project(self.alice, name="私人", identifier="PRS")
        project_services.create_project(self.bob, name="别人的", identifier="OBS")

        self.client.force_authenticate(self.alice)
        data = self.client.get(MINE_URL).json()
        names = [p["name"] for p in data]
        self.assertIn("私人", names)
        self.assertNotIn("别人的", names)
        row = next(p for p in data if p["name"] == "私人")
        self.assertIsNone(row["workspace_slug"])
        self.assertIsNone(row["workspace_name"])
        self.assertEqual(row["progress"], 0)
        self.assertEqual(row["progress_source"], "tasks")


class OwnerShortCircuitTests(APITestCase):
    """owner 优先于成员关系（ADR-001：所有权不因协作状态被剥夺）。"""

    def setUp(self):
        from apps.workspaces import services as ws_services
        from apps.workspaces.models import WorkspaceMember, WorkspaceRoles

        self.owner = User.objects.create_user(
            username="own", email="own@example.com", password="pw-own-12345"
        )
        self.teammate = User.objects.create_user(
            username="mate", email="mate@example.com", password="pw-mate-1234"
        )
        self.ws = ws_services.create_workspace(self.owner, "团队", "team-ws")
        WorkspaceMember.objects.create(
            workspace=self.ws, user=self.teammate, role=WorkspaceRoles.MEMBER
        )
        self.project = project_services.create_project(
            self.owner, workspace=self.ws, name="团队工程", identifier="TMA"
        )

    def test_owner_accessible_after_membership_removed(self):
        from apps.workspaces.models import WorkspaceMember
        from core.permissions import resolve_project_by_id

        # owner 被移出自己的工作区（防御性场景：其他管理员操作）
        WorkspaceMember.objects.filter(workspace=self.ws, user=self.owner).delete()
        resolved, role = resolve_project_by_id(self.owner, self.project.id)
        self.assertEqual(role, 20)

    def test_workspace_member_still_viewer_when_not_project_member(self):
        from core.permissions import resolve_project_by_id

        _, role = resolve_project_by_id(self.teammate, self.project.id)
        self.assertEqual(role, 5)  # WS Member → 项目 VIEWER（既有规则不变）


class StageConstraintTests(APITestCase):
    """is_current 部分唯一索引（DOMAIN_MODEL §6 的数据库级兜底）。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="stg", email="stg@example.com", password="pw-stg-12345"
        )
        self.project = project_services.create_project(self.user, name="S", identifier="STG")
        self.plan = self.project.plan

    def test_db_rejects_second_current_stage(self):
        from django.db import IntegrityError, transaction

        project_services.add_stage(self.plan, name="S1", is_current=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProjectStage.objects.create(plan=self.plan, order=2, name="S2", is_current=True)
        # service 正常路径不受影响：切换 current 会先清其余
        project_services.add_stage(self.plan, name="S3", is_current=True)
        self.assertEqual(self.plan.stages.filter(is_current=True).count(), 1)


class LastActivityTests(APITestCase):
    """last_activity 唯一定义：max(Task, Worklog, Project)（DOMAIN_MODEL §3 修订）。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="act", email="act@example.com", password="pw-act-12345"
        )
        self.project = project_services.create_project(self.user, name="L", identifier="ACT")

    def _mine_row(self):
        self.client.force_authenticate(self.user)
        return next(p for p in self.client.get(MINE_URL).json() if p["id"] == str(self.project.id))

    def test_worklog_updates_last_activity(self):
        import datetime as dt

        from apps.worklogs.models import Worklog

        # 只有 Worklog、没有 Task 的工程：last_activity 必须非空（旧实现只看 Task → None）
        Worklog.objects.create(
            project=self.project,
            author=self.user,
            date=dt.date.today(),
            title="今日日志",
            summary="做了些事",
        )
        row = self._mine_row()
        self.assertIsNotNone(row["last_activity"])
        self.assertEqual(row["today_logs"], 1)

    def test_progress_source_plan_when_stages_exist(self):
        project_services.add_stage(self.project.plan, name="阶段一", weight=1, progress=100)
        project_services.add_stage(self.project.plan, name="阶段二", weight=3, progress=0)
        row = self._mine_row()
        self.assertEqual(row["progress"], 25)
        self.assertEqual(row["progress_source"], "plan")
