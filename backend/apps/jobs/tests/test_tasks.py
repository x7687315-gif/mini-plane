"""Celery 任务的行为测试（契约 docs/api/07-cache-and-tasks.md）。

刻意不拉起 worker：纯业务函数直接调用，Celery 任务用 `.run()` 触发。
eager 模式测不了重试的"等待"，但能测**策略本身**（该不该重试、退避多少、幂等与否）。
"""

from unittest import mock

from celery.exceptions import Retry
from django.test import TestCase

from apps.issues import services as issue_services
from apps.jobs import services as job_services
from apps.jobs import tasks as job_tasks
from apps.jobs.models import Notification, TaskRun, TaskStatus
from apps.jobs.tasks import (
    TransientJobError,
    _retry_countdown,
    bulk_assign_labels,
    notify_comment_created,
)
from apps.jobs.tests.base import JobScenarioMixin


class NotificationDeliveryTests(JobScenarioMixin, TestCase):
    def setUp(self):
        self.build_scenario(slug="notify-ws", identifier="NTF")
        self.issue = issue_services.create_issue(
            self.project, self.owner, title="通知用例", assignee=self.member
        )

    def _comment(self, *, author, content="看看这个"):
        return issue_services.create_comment(self.issue, author, content=content)

    def test_notifies_assignee_and_creator_but_not_author(self):
        comment = self._comment(author=self.viewer)  # 作者既不是指派人也不是创建者

        result = job_tasks._deliver_comment_notification(str(comment.id))

        self.assertEqual(result, {"delivered": 2, "skipped": 0})
        recipients = set(Notification.objects.values_list("recipient_id", flat=True))
        self.assertEqual(recipients, {self.member.id, self.owner.id})
        self.assertNotIn(self.viewer.id, recipients)

    def test_is_idempotent_under_redelivery(self):
        """同一事件重复投递：幂等键挡住，不重复落库，也不算失败。"""
        comment = self._comment(author=self.viewer)
        first = job_tasks._deliver_comment_notification(str(comment.id))
        second = job_tasks._deliver_comment_notification(str(comment.id))

        self.assertEqual(first, {"delivered": 2, "skipped": 0})
        self.assertEqual(second, {"delivered": 0, "skipped": 2})
        self.assertEqual(Notification.objects.count(), 2)

    def test_author_is_assignee_means_single_recipient(self):
        """作者本人被排除在收件人之外：自己评论自己，只剩创建者收到通知。"""
        issue = issue_services.create_issue(
            self.project, self.member, title="自评", assignee=self.owner
        )
        comment = issue_services.create_comment(issue, self.member, content="自己评论自己")

        result = job_tasks._deliver_comment_notification(str(comment.id))

        self.assertEqual(result, {"delivered": 1, "skipped": 0})
        self.assertEqual(
            list(Notification.objects.values_list("recipient__username", flat=True)),
            ["job-owner"],
        )

    def test_deleted_comment_is_not_an_error(self):
        """任务必须容忍对象在投递窗口内消失（at-least-once 的现实约束）。"""
        comment = self._comment(author=self.viewer)
        comment_id = str(comment.id)
        issue_services.delete_comment(comment, actor=self.owner)

        self.assertEqual(
            job_tasks._deliver_comment_notification(comment_id),
            {"delivered": 0, "skipped": 0, "reason": "comment_missing"},
        )


class NotificationTaskPolicyTests(JobScenarioMixin, TestCase):
    """重试策略：配置本身 + 触发行为（eager 模式测不了等待，但测得出"会不会重试"）。"""

    def test_retry_policy_is_three_times_with_exponential_backoff(self):
        self.assertEqual(notify_comment_created.max_retries, 3)
        # 2**0=2s → 2**1=4s → 2**2=8s
        self.assertEqual([_retry_countdown(n) for n in range(3)], [2, 4, 8])

    def test_transient_failure_triggers_retry(self):
        self.build_scenario(slug="retry-ws", identifier="RTY")
        comment = issue_services.create_comment(
            issue_services.create_issue(self.project, self.owner, title="x"),
            self.owner,
            content="c",
        )
        with mock.patch.object(
            job_tasks, "_deliver_comment_notification", side_effect=TransientJobError("下游 503")
        ) as deliver:
            with mock.patch.object(
                notify_comment_created, "retry", side_effect=Retry("retry")
            ) as retry:
                with self.assertRaises(Retry):
                    notify_comment_created.run(str(comment.id))

        deliver.assert_called_once()
        # 第一次重试退避 2 秒，且把原始异常带给 Celery
        retry.assert_called_once()
        self.assertEqual(retry.call_args.kwargs.get("countdown"), 2)
        self.assertIsInstance(retry.call_args.kwargs.get("exc"), TransientJobError)

    def test_business_error_does_not_retry(self):
        """业务错误重试不会变好：不该触发 retry。"""
        self.build_scenario(slug="noretry-ws", identifier="NRT")
        comment = issue_services.create_comment(
            issue_services.create_issue(self.project, self.owner, title="x"),
            self.owner,
            content="c",
        )
        with mock.patch.object(
            job_tasks, "_deliver_comment_notification", side_effect=ValueError("参数非法")
        ):
            with mock.patch.object(notify_comment_created, "retry") as retry:
                with self.assertRaises(ValueError):
                    notify_comment_created.run(str(comment.id))

        retry.assert_not_called()


class BulkAssignLabelsTaskTests(JobScenarioMixin, TestCase):
    def setUp(self):
        self.build_scenario(slug="bulk-ws", identifier="BLK")
        self.issues = [
            issue_services.create_issue(self.project, self.owner, title=f"bulk-{index}")
            for index in range(3)
        ]

    def _start(self, *, issue_ids=None, label_ids=None) -> TaskRun:
        return job_services.start_bulk_assign_labels(
            self.project,
            self.owner,
            issue_ids=issue_ids or [str(issue.id) for issue in self.issues],
            label_ids=label_ids if label_ids is not None else [str(self.bug_label.id)],
        )

    def test_pending_then_success_with_labels_applied(self):
        run = self._start()
        self.assertEqual(run.status, TaskStatus.PENDING)

        result = bulk_assign_labels.run(str(run.id))
        run.refresh_from_db()

        self.assertEqual(run.status, TaskStatus.SUCCESS)
        self.assertEqual(run.error, "")
        self.assertEqual(result, {"issues": 3, "labels": 1, "label_ids": [str(self.bug_label.id)]})
        for issue in self.issues:
            self.assertEqual(list(issue.labels.all()), [self.bug_label])

    def test_status_transitions_are_recorded(self):
        run = self._start()
        bulk_assign_labels.run(str(run.id))
        run.refresh_from_db()
        self.assertEqual(run.status, TaskStatus.SUCCESS)

    def test_second_dispatch_is_idempotent(self):
        """重复投递已经成功的任务：直接返回旧结果，不重复执行。"""
        run = self._start()
        first = bulk_assign_labels.run(str(run.id))
        second = bulk_assign_labels.run(str(run.id))

        self.assertEqual(first, second)
        self.assertEqual(run.project.issues.first().labels.count(), 1)

    def test_empty_label_ids_clears_labels(self):
        """覆盖式语义：label_ids=[] 表示清空（契约 07）。"""
        issue = self.issues[0]
        issue.labels.set([self.bug_label])

        run = self._start(issue_ids=[str(issue.id)], label_ids=[])
        bulk_assign_labels.run(str(run.id))

        issue.refresh_from_db()
        self.assertEqual(issue.labels.count(), 0)

    def test_foreign_issue_marks_failure_and_does_not_retry(self):
        """跨项目的 Issue 不允许被本项目的任务路径改到 → 标失败且不重试。"""
        from apps.projects.services import create_project

        other_project = create_project(self.workspace, self.owner, name="别处", identifier="OTH")
        foreign = issue_services.create_issue(other_project, self.owner, title="foreign")

        run = self._start(issue_ids=[str(foreign.id)])
        with self.assertRaises(ValueError):
            bulk_assign_labels.run(str(run.id))

        run.refresh_from_db()
        self.assertEqual(run.status, TaskStatus.FAILURE)
        self.assertIn("不属于该项目", run.error)

    def test_unknown_task_run_is_not_an_error(self):
        self.assertEqual(
            job_tasks._run_bulk_assign_labels("00000000-0000-0000-0000-000000000000"),
            {"reason": "task_run_missing"},
        )
