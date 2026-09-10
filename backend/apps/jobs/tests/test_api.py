"""批量任务与任务状态接口的 API 测试（契约 docs/api/07-cache-and-tasks.md）。"""

from apps.issues import services as issue_services
from apps.issues.models import Issue
from apps.jobs.models import TaskStatus
from apps.jobs.tests.base import JobAPITestCase


class BulkLabelsEndpointTests(JobAPITestCase):
    def setUp(self):
        self.issues = [
            issue_services.create_issue(self.project, self.owner, title=f"api-{index}")
            for index in range(2)
        ]

    def test_member_post_returns_202_with_task_id(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.post(
            self.bulk_url,
            {
                "issue_ids": [str(issue.id) for issue in self.issues],
                "label_ids": [str(self.bug_label.id)],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual(body["kind"], "bulk_assign_labels")
        self.assertEqual(body["status"], TaskStatus.PENDING)
        self.assertEqual(body["actor"]["username"], "job-member")

    def task_url(self, task_id: str) -> str:
        return f"{self.project_root}/tasks/{task_id}/"

    def test_eager_dispatch_applies_labels_and_flips_status(self):
        """eager 模式 + on_commit：任务在事务提交后同步执行完，状态已是 success。"""
        self.client.force_authenticate(user=self.member)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.bulk_url,
                {
                    "issue_ids": [str(issue.id) for issue in self.issues],
                    "label_ids": [str(self.bug_label.id)],
                },
                format="json",
            )
        task_id = response.json()["id"]

        status_body = self.client.get(self.task_url(task_id)).json()
        self.assertEqual(status_body["status"], TaskStatus.SUCCESS)
        self.assertEqual(status_body["result"]["issues"], 2)
        for issue in self.issues:
            self.assertEqual(list(issue.labels.all()), [self.bug_label])

    def test_task_status_is_readable_by_viewer_but_not_stranger(self):
        self.client.force_authenticate(user=self.member)
        with self.captureOnCommitCallbacks(execute=True):
            run_id = self.client.post(
                self.bulk_url,
                {
                    "issue_ids": [str(self.issues[0].id)],
                    "label_ids": [str(self.bug_label.id)],
                },
                format="json",
            ).json()["id"]

        self.client.force_authenticate(user=self.viewer)
        self.assertEqual(self.client.get(self.task_url(run_id)).status_code, 200)

        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.get(self.task_url(run_id)).status_code, 404)

    def test_bulk_requires_member_role(self):
        self.client.force_authenticate(user=self.viewer)
        self.assertEqual(
            self.client.post(
                self.bulk_url,
                {"issue_ids": [str(self.issues[0].id)], "label_ids": [str(self.bug_label.id)]},
                format="json",
            ).status_code,
            403,
        )

    def test_bulk_by_outsider_404(self):
        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(
            self.client.post(
                self.bulk_url,
                {"issue_ids": [str(self.issues[0].id)], "label_ids": [str(self.bug_label.id)]},
                format="json",
            ).status_code,
            404,
        )

    def test_bulk_with_foreign_issue_400(self):
        from apps.projects.services import create_project

        other_project = create_project(self.workspace, self.owner, name="别处", identifier="BLK2")
        foreign = issue_services.create_issue(other_project, self.owner, title="foreign")

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            self.bulk_url,
            {"issue_ids": [str(foreign.id)], "label_ids": [str(self.bug_label.id)]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["issue_ids"], ["所选 Issue 不属于该项目。"])

    def test_bulk_with_unknown_label_400(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            self.bulk_url,
            {
                "issue_ids": [str(self.issues[0].id)],
                "label_ids": ["00000000-0000-0000-0000-000000000000"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["label_ids"], ["所选标签不属于该项目。"])

    def test_bulk_empty_issue_ids_400(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.bulk_url, {"issue_ids": []}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_issue_objects_are_untouched_before_task_runs(self):
        """202 只是"已受理"，标签在任务执行时才变 —— eager 模式下事务提交后立即变。"""
        self.client.force_authenticate(user=self.member)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                self.bulk_url,
                {"issue_ids": [str(self.issues[0].id)], "label_ids": [str(self.bug_label.id)]},
                format="json",
            )
        self.assertEqual(Issue.objects.get(pk=self.issues[0].pk).labels.count(), 1)
