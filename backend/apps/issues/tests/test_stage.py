"""Phase 2 · Task↔Stage 关联测试（DOMAIN_MODEL §2 / ADR-001）。

覆盖：创建/更新时可选归属 Stage；跨项目 Stage → 400 字段错误（与 state/labels 同语义）；
删 Stage 置空 Task.stage（不删 Task）；活动留痕 diff 包含 stage 名。
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.issues import services as issue_services
from apps.projects import services as project_services

from .base import IssueScenarioMixin

User = get_user_model()


class TaskStageTests(IssueScenarioMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.build_scenario()
        cls.stage1 = project_services.add_stage(cls.project.plan, name="阶段一")
        cls.stage2 = project_services.add_stage(cls.project.plan, name="阶段二")
        # other_project 也有自己的 Stage（跨项目注入用）
        other_plan = project_services.get_or_create_plan(cls.other_project)
        cls.other_stage = project_services.add_stage(other_plan, name="别处阶段")

    def issue_detail_url(self, issue) -> str:
        return self.issue_url(issue)

    def test_create_issue_with_stage(self):
        self.auth(self.owner)
        r = self.client.post(
            self.issues_url,
            {"title": "挂阶段的任务", "stage_id": str(self.stage1.id)},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.json()["stage"]["name"], "阶段一")
        self.assertEqual(r.json()["stage"]["id"], str(self.stage1.id))

    def test_update_issue_stage_and_clear(self):
        issue = issue_services.create_issue(self.project, self.owner, title="普通")
        self.auth(self.owner)
        r = self.client.patch(
            self.issue_detail_url(issue), {"stage_id": str(self.stage2.id)}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()["stage"]["name"], "阶段二")

        # null 脱离阶段
        r = self.client.patch(self.issue_detail_url(issue), {"stage_id": None}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIsNone(r.json()["stage"])

    def test_cross_project_stage_rejected_400(self):
        issue = issue_services.create_issue(self.project, self.owner, title="跨项目")
        self.auth(self.owner)
        r = self.client.patch(
            self.issue_detail_url(issue), {"stage_id": str(self.other_stage.id)}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("阶段", str(r.json()))

    def test_delete_stage_detaches_tasks_not_deletes(self):
        issue = issue_services.create_issue(
            self.project, self.owner, title="存活", stage=self.stage1
        )
        self.stage1.delete()
        issue.refresh_from_db()
        self.assertIsNotNone(issue)  # Task 未被删除
        self.assertIsNone(issue.stage)  # 关联置空

    def test_stage_change_recorded_in_activity(self):
        from apps.activity.models import ActivityLog

        issue = issue_services.create_issue(self.project, self.owner, title="留痕")
        issue_services.update_issue(issue, actor=self.owner, stage=self.stage1)
        log = (
            ActivityLog.objects.filter(issue=issue, entity_type="issue", action="updated")
            .order_by("-created_at")
            .first()
        )
        self.assertIsNotNone(log)
        self.assertIsNone(log.old_value.get("stage"))
        self.assertEqual(log.new_value.get("stage"), "阶段一")
