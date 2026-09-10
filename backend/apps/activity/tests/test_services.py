"""activity 模块的单元测试：纯函数翻译/ diff，以及 record_activity 的写入语义。

记录点（谁在什么时候写留痕）的集成测试放在 apps/issues/tests/test_activities.py，
那边有完整的场景装置。
"""

from datetime import timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from apps.activity import services
from apps.activity.models import Actions, ActivityLog, EntityTypes
from apps.issues import services as issue_services
from apps.issues.tests.base import IssueScenarioMixin


class DescribeDescriptionTests(SimpleTestCase):
    """描述只记字数摘要，不存全文（06 契约产品决策 1）。"""

    def test_counts_characters(self):
        self.assertEqual(services.describe_description("一二三四五"), "5 字")

    def test_handles_empty_and_none(self):
        self.assertEqual(services.describe_description(""), "0 字")
        self.assertEqual(services.describe_description(None), "0 字")


class DiffSnapshotsTests(SimpleTestCase):
    """只保留真正变化的字段（06 契约产品决策 2）。"""

    def _snapshot(self, **overrides):
        base = {
            "title": "标题",
            "description": "0 字",
            "state": "Backlog",
            "priority": "none",
            "assignee": None,
            "labels": [],
        }
        base.update(overrides)
        return base

    def test_only_changed_fields_are_kept(self):
        before = self._snapshot()
        after = self._snapshot(state="Done", priority="high")
        old_value, new_value = services.diff_snapshots(before, after)

        self.assertEqual(old_value, {"state": "Backlog", "priority": "none"})
        self.assertEqual(new_value, {"state": "Done", "priority": "high"})

    def test_no_change_returns_two_empty_dicts(self):
        snapshot = self._snapshot()
        self.assertEqual(services.diff_snapshots(snapshot, self._snapshot()), ({}, {}))

    def test_none_and_empty_boundaries_are_detected(self):
        before = self._snapshot(assignee="amiya", labels=["bug"])
        after = self._snapshot(assignee=None, labels=[])
        old_value, new_value = services.diff_snapshots(before, after)

        self.assertEqual(old_value, {"assignee": "amiya", "labels": ["bug"]})
        self.assertEqual(new_value, {"assignee": None, "labels": []})

    def test_ignores_fields_outside_the_whitelist(self):
        before = self._snapshot()
        after = dict(self._snapshot(), sequence_id=999)
        self.assertEqual(services.diff_snapshots(before, after), ({}, {}))


class RecordActivityTests(IssueScenarioMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.build_scenario(slug="activity-ws", identifier="ACT")

    def test_workspace_is_derived_from_project(self):
        activity = services.record_activity(
            actor=self.owner,
            project=self.project,
            entity_type=EntityTypes.ISSUE,
            entity_id=self.project.id,
            action=Actions.CREATED,
        )
        self.assertEqual(activity.workspace_id, self.project.workspace_id)

    def test_workspace_derivation_costs_no_extra_query(self):
        """project.workspace_id 已在手，不该为了拿工作区再查一次库。"""
        with self.assertNumQueries(1):
            services.record_activity(
                actor=self.owner,
                project=self.project,
                entity_type=EntityTypes.ISSUE,
                entity_id=self.project.id,
                action=Actions.CREATED,
            )

    def test_default_ordering_is_newest_first(self):
        """显式拉开时间戳后验证倒序。

        为什么不靠连续写入的自然时间戳：Windows 墙钟粒度约 15ms，
        几次连续写入会落在同一时间戳上，此时顺序由 ``-id``（随机 UUID）决定、
        不再可靠。这是平台特性，不是排序 bug（06 契约已写明该边界）。
        """
        base = timezone.now()
        for index in range(3):
            activity = services.record_activity(
                actor=self.owner,
                project=self.project,
                entity_type=EntityTypes.ISSUE,
                entity_id=self.project.id,
                action=Actions.CREATED,
                new_value={"n": index},
            )
            ActivityLog.objects.filter(pk=activity.pk).update(
                created_at=base + timedelta(seconds=index)
            )

        values = list(
            ActivityLog.objects.filter(
                entity_id=self.project.id, entity_type=EntityTypes.ISSUE
            ).values_list("new_value", flat=True)
        )
        self.assertEqual(values, [{"n": 2}, {"n": 1}, {"n": 0}])

    def test_issue_timeline_filters_by_issue(self):
        issue = issue_services.create_issue(self.project, self.owner, title="a")
        other = issue_services.create_issue(self.project, self.owner, title="b")

        timeline = services.issue_timeline(issue)

        self.assertEqual(timeline.count(), 1)
        self.assertEqual(timeline.first().entity_id, issue.id)
        self.assertNotEqual(timeline.first().entity_id, other.id)

    def test_project_feed_covers_project_and_its_issues(self):
        issue_services.create_issue(self.project, self.owner, title="a")

        feed = services.project_feed(self.project)

        # 建项目时 1 条 project.created + 建 Issue 时 1 条 issue.created
        self.assertEqual(feed.count(), 2)
