"""Issue / Label API 行为测试（契约 docs/api/04-issues.md）。"""

from apps.issues import services
from apps.issues.models import Issue, Label
from apps.issues.tests.base import IssueAPITestCase


class IssueCreateAPITests(IssueAPITestCase):
    def test_create_minimal_uses_backlog_and_sequence_one(self):
        self.auth(self.owner)
        resp = self.client.post(self.issues_url, {"title": "登录页验证码不显示"}, format="json")

        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["sequence_id"], 1)
        self.assertEqual(body["state"]["name"], "Backlog")
        self.assertEqual(body["state"]["group"], "backlog")
        self.assertEqual(body["priority"], "none")
        self.assertEqual(body["description"], "")
        self.assertIsNone(body["assignee"])
        self.assertEqual(body["labels"], [])
        self.assertEqual(body["created_by"]["username"], "owner")
        self.assertEqual(body["project"], str(self.project.id))

    def test_create_full(self):
        state = self.project.states.get(name="In Progress")
        label = services.create_label(self.project, name="bug", color="#ef4444")
        self.auth(self.project_member)

        resp = self.client.post(
            self.issues_url,
            {
                "title": "崩溃",
                "description": "复现步骤：…",
                "state_id": str(state.id),
                "priority": "urgent",
                "assignee_id": str(self.project_member.id),
                "label_ids": [str(label.id)],
            },
            format="json",
        )

        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["sequence_id"], 1)
        self.assertEqual(body["state"]["name"], "In Progress")
        self.assertEqual(body["priority"], "urgent")
        self.assertEqual(body["assignee"]["username"], "pm")
        self.assertEqual([item["name"] for item in body["labels"]], ["bug"])

    def test_second_issue_gets_next_sequence(self):
        self.auth(self.owner)
        first = self.client.post(self.issues_url, {"title": "a"}, format="json").json()
        second = self.client.post(self.issues_url, {"title": "b"}, format="json").json()
        self.assertEqual((first["sequence_id"], second["sequence_id"]), (1, 2))

    def test_client_supplied_readonly_fields_are_ignored(self):
        """sequence_id / created_by 由服务端决定，客户端传入无效。"""
        self.auth(self.owner)
        resp = self.client.post(
            self.issues_url,
            {
                "title": "x",
                "sequence_id": 999,
                "created_by": str(self.project_member.id),
                "project": str(self.other_project.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["sequence_id"], 1)
        self.assertEqual(body["created_by"]["username"], "owner")
        self.assertEqual(body["project"], str(self.project.id))

    def test_title_missing_400(self):
        self.auth(self.owner)
        resp = self.client.post(self.issues_url, {}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["title"], ["该字段是必填项。"])

    def test_title_blank_400(self):
        self.auth(self.owner)
        resp = self.client.post(self.issues_url, {"title": "   "}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("title", resp.json())

    def test_state_from_other_project_400(self):
        foreign_state = self.other_project.states.first()
        self.auth(self.owner)
        resp = self.client.post(
            self.issues_url, {"title": "x", "state_id": str(foreign_state.id)}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["state"], ["所选状态不属于该项目。"])

    def test_assignee_not_project_member_400(self):
        """ws_viewer 是工作区成员但不是项目成员 → 不可被指派（04 契约）。"""
        self.auth(self.owner)
        resp = self.client.post(
            self.issues_url,
            {"title": "x", "assignee_id": str(self.ws_viewer.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["assignee"], ["所选用户不是该项目成员。"])

    def test_assignee_ws_admin_not_in_project_400(self):
        """仅 WS Admin、未加入项目的人也不可被指派（候选列表用项目成员接口）。"""
        self.auth(self.owner)
        resp = self.client.post(
            self.issues_url,
            {"title": "x", "assignee_id": str(self.ws_admin.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["assignee"], ["所选用户不是该项目成员。"])

    def test_assignee_unknown_user_400(self):
        self.auth(self.owner)
        resp = self.client.post(
            self.issues_url,
            {"title": "x", "assignee_id": "00000000-0000-0000-0000-000000000000"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["assignee"], ["所选用户不存在。"])

    def test_labels_from_other_project_400(self):
        foreign_label = services.create_label(self.other_project, name="foreign")
        self.auth(self.owner)
        resp = self.client.post(
            self.issues_url,
            {"title": "x", "label_ids": [str(foreign_label.id)]},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["labels"], ["所选标签不属于该项目。"])

    def test_sequential_creation_keeps_sequence_continuous(self):
        """连发 50 个 Issue，序号 1..50 严格连续（决策 D9 的串行基线）。"""
        self.auth(self.owner)
        created = []
        for index in range(1, 51):
            resp = self.client.post(self.issues_url, {"title": f"issue-{index}"}, format="json")
            self.assertEqual(resp.status_code, 201)
            created.append(resp.json()["sequence_id"])
        self.assertEqual(created, list(range(1, 51)))


class IssueListAPITests(IssueAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for index in range(1, 6):
            services.create_issue(cls.project, cls.owner, title=f"t{index}")

    def test_default_ordering_is_newest_first(self):
        self.auth(self.owner)
        body = self.client.get(self.issues_url).json()
        self.assertEqual(body["count"], 5)
        self.assertEqual([item["sequence_id"] for item in body["results"]], [5, 4, 3, 2, 1])

    def test_ordering_ascending(self):
        self.auth(self.owner)
        body = self.client.get(f"{self.issues_url}?ordering=sequence_id").json()
        self.assertEqual([item["sequence_id"] for item in body["results"]], [1, 2, 3, 4, 5])

    def test_ordering_multiple_fields(self):
        self.auth(self.owner)
        resp = self.client.get(f"{self.issues_url}?ordering=-priority,sequence_id")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["count"], 5)

    def test_ordering_invalid_value_400(self):
        self.auth(self.owner)
        resp = self.client.get(f"{self.issues_url}?ordering=title")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["ordering"], ["不支持的排序字段：title。"])

    def test_ordering_injection_attempt_400(self):
        """白名单之外一律 400，避免被当作 order_by 注入面（BACKEND_PLAN §Sprint 5 学习要点）。"""
        self.auth(self.owner)
        resp = self.client.get(f"{self.issues_url}?ordering=-created_by__password")
        self.assertEqual(resp.status_code, 400)

    def test_list_query_count_has_no_n_plus_one(self):
        """resolve_project 2 次 + 分页 count 1 次 + 取页 1 次 + prefetch labels 1 次 = 5。"""
        self.auth(self.owner)
        with self.assertNumQueries(5):
            self.client.get(self.issues_url)


class IssuePaginationAPITests(IssueAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for index in range(1, 52):
            services.create_issue(cls.project, cls.owner, title=f"bulk-{index}")

    def test_count_and_next_page(self):
        self.auth(self.owner)
        body = self.client.get(f"{self.issues_url}?per_page=10").json()
        self.assertEqual(body["count"], 51)
        self.assertEqual(len(body["results"]), 10)
        self.assertIsNotNone(body["next"])
        self.assertIsNone(body["previous"])

    def test_per_page_over_max_is_capped_at_100(self):
        """per_page=1000 被 max_page_size 收敛到 100（请求合法，不报错）。"""
        self.auth(self.owner)
        body = self.client.get(f"{self.issues_url}?per_page=1000").json()
        self.assertEqual(body["count"], 51)
        self.assertEqual(len(body["results"]), 51)

    def test_second_page_returns_remainder(self):
        self.auth(self.owner)
        body = self.client.get(f"{self.issues_url}?per_page=50&page=2").json()
        self.assertEqual(len(body["results"]), 1)
        self.assertIsNotNone(body["previous"])


class IssueDetailAPITests(IssueAPITestCase):
    def setUp(self):
        self.issue = services.create_issue(
            self.project, self.owner, title="详情用例", priority="medium"
        )

    def test_get_detail(self):
        self.auth(self.project_viewer)
        resp = self.client.get(self.issue_url(self.issue))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["title"], "详情用例")

    def test_unknown_issue_id_404(self):
        self.auth(self.owner)
        resp = self.client.get(f"{self.issues_url}00000000-0000-0000-0000-000000000000/")
        self.assertEqual(resp.status_code, 404)

    def test_issue_belonging_to_other_project_404(self):
        """URL 双层作用域：用本项目路径访问别的项目的 Issue → 404。"""
        foreign = services.create_issue(self.other_project, self.owner, title="foreign")
        self.auth(self.owner)
        resp = self.client.get(f"{self.issues_url}{foreign.id}/")
        self.assertEqual(resp.status_code, 404)
        self.assertNotIn("foreign", resp.content.decode())

    def test_patch_state_priority_and_assignee(self):
        done = self.project.states.get(name="Done")
        self.auth(self.project_member)
        resp = self.client.patch(
            self.issue_url(self.issue),
            {
                "state_id": str(done.id),
                "priority": "high",
                "assignee_id": str(self.project_member.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["state"]["name"], "Done")
        self.assertEqual(body["priority"], "high")
        self.assertEqual(body["assignee"]["username"], "pm")

    def test_patch_clear_assignee_with_null(self):
        issue = services.create_issue(
            self.project, self.owner, title="指派", assignee=self.project_member
        )
        self.auth(self.owner)
        resp = self.client.patch(self.issue_url(issue), {"assignee_id": None}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["assignee"])

    def test_patch_clear_labels_with_empty_list(self):
        label = services.create_label(self.project, name="bug")
        issue = services.create_issue(self.project, self.owner, title="标签", labels=[label])
        self.auth(self.owner)
        resp = self.client.patch(self.issue_url(issue), {"label_ids": []}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["labels"], [])

    def test_patch_readonly_fields_are_ignored(self):
        self.auth(self.owner)
        resp = self.client.patch(
            self.issue_url(self.issue),
            {
                "title": "改名",
                "sequence_id": 999,
                "created_by": str(self.project_member.id),
                "project": str(self.other_project.id),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.title, "改名")
        self.assertEqual(self.issue.sequence_id, 1)
        self.assertEqual(self.issue.created_by_id, self.owner.id)
        self.assertEqual(self.issue.project_id, self.project.id)

    def test_patch_title_blank_400(self):
        self.auth(self.owner)
        resp = self.client.patch(self.issue_url(self.issue), {"title": "  "}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("title", resp.json())

    def test_patch_unrelated_field_keeps_others(self):
        self.auth(self.owner)
        self.client.patch(self.issue_url(self.issue), {"priority": "low"}, format="json")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.priority, "low")
        self.assertEqual(self.issue.title, "详情用例")
        self.assertEqual(self.issue.state.group, "backlog")

    def test_delete_204(self):
        self.auth(self.owner)
        resp = self.client.delete(self.issue_url(self.issue))
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Issue.objects.filter(pk=self.issue.pk).exists())


class LabelAPITests(IssueAPITestCase):
    def test_create_label_defaults_color(self):
        self.auth(self.project_member)
        resp = self.client.post(self.labels_url, {"name": "bug"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["color"], "#64748b")
        self.assertEqual(resp.json()["name"], "bug")

    def test_create_label_with_color(self):
        self.auth(self.owner)
        resp = self.client.post(
            self.labels_url, {"name": "urgent", "color": "#ef4444"}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["color"], "#ef4444")

    def test_create_duplicate_name_400(self):
        services.create_label(self.project, name="bug")
        self.auth(self.owner)
        resp = self.client.post(self.labels_url, {"name": "bug"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["name"], ["该项目下已存在同名标签。"])

    def test_same_name_allowed_in_other_project(self):
        services.create_label(self.other_project, name="bug")
        self.auth(self.owner)
        resp = self.client.post(self.labels_url, {"name": "bug"}, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_list_labels(self):
        services.create_label(self.project, name="beta")
        services.create_label(self.project, name="alpha")
        self.auth(self.ws_viewer)
        body = self.client.get(self.labels_url).json()
        self.assertEqual(body["count"], 2)
        self.assertEqual([item["name"] for item in body["results"]], ["alpha", "beta"])

    def test_patch_label(self):
        label = services.create_label(self.project, name="bug")
        self.auth(self.owner)
        resp = self.client.patch(
            self.label_url(label), {"name": "defect", "color": "#111111"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "defect")
        self.assertEqual(resp.json()["color"], "#111111")

    def test_patch_label_duplicate_name_400(self):
        services.create_label(self.project, name="bug")
        label = services.create_label(self.project, name="defect")
        self.auth(self.owner)
        resp = self.client.patch(self.label_url(label), {"name": "bug"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["name"], ["该项目下已存在同名标签。"])

    def test_delete_label_keeps_issue_and_clears_its_labels(self):
        label = services.create_label(self.project, name="bug")
        issue = services.create_issue(self.project, self.owner, title="x", labels=[label])
        self.auth(self.owner)

        resp = self.client.delete(self.label_url(label))

        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Label.objects.filter(pk=label.pk).exists())
        self.assertEqual(self.client.get(self.issue_url(issue)).json()["labels"], [])

    def test_unknown_label_id_404(self):
        self.auth(self.owner)
        resp = self.client.patch(
            f"{self.labels_url}00000000-0000-0000-0000-000000000000/",
            {"name": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
