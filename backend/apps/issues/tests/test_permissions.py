"""权限矩阵逐格覆盖（BACKEND_PLAN §4.2 / 04 契约）。

两条硬规则（§4.3）：
- 非工作区成员 → 404（防枚举），不是 403；
- 可见但无权操作 → 403。
"""

from apps.issues import services
from apps.issues.tests.base import IssueAPITestCase


class IssuePermissionMatrixTests(IssueAPITestCase):
    READERS = ("owner", "ws_admin", "project_member", "project_viewer", "ws_viewer")
    WRITERS = ("owner", "ws_admin", "project_member")
    READ_ONLY = ("project_viewer", "ws_viewer")

    def test_read_endpoints_allow_every_workspace_member(self):
        issue = services.create_issue(self.project, self.owner, title="matrix")
        for name in self.READERS:
            with self.subTest(role=name):
                self.auth(getattr(self, name))
                self.assertEqual(self.client.get(self.issues_url).status_code, 200)
                self.assertEqual(self.client.get(self.issue_url(issue)).status_code, 200)
                self.assertEqual(self.client.get(self.labels_url).status_code, 200)

    def test_read_endpoints_404_for_outsider(self):
        issue = services.create_issue(self.project, self.owner, title="matrix")
        self.auth(self.outsider)
        for url in (self.issues_url, self.issue_url(issue), self.labels_url):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_unauthenticated_401(self):
        self.assertEqual(self.client.get(self.issues_url).status_code, 401)

    def test_write_endpoints_allow_member_and_above(self):
        for name in self.WRITERS:
            with self.subTest(role=name):
                self.auth(getattr(self, name))
                created = self.client.post(
                    self.issues_url, {"title": f"by-{name}"}, format="json"
                )
                self.assertEqual(created.status_code, 201)
                target = f"{self.issues_url}{created.json()['id']}/"
                self.assertEqual(
                    self.client.patch(target, {"priority": "low"}, format="json").status_code, 200
                )
                self.assertEqual(self.client.delete(target).status_code, 204)

    def test_write_endpoints_403_for_viewers(self):
        issue = services.create_issue(self.project, self.owner, title="matrix")
        for name in self.READ_ONLY:
            with self.subTest(role=name):
                self.auth(getattr(self, name))
                self.assertEqual(
                    self.client.post(self.issues_url, {"title": "x"}, format="json").status_code,
                    403,
                )
                self.assertEqual(
                    self.client.patch(
                        self.issue_url(issue), {"priority": "low"}, format="json"
                    ).status_code,
                    403,
                )
                self.assertEqual(self.client.delete(self.issue_url(issue)).status_code, 403)

    def test_write_endpoints_404_for_outsider(self):
        issue = services.create_issue(self.project, self.owner, title="matrix")
        self.auth(self.outsider)
        self.assertEqual(
            self.client.post(self.issues_url, {"title": "x"}, format="json").status_code, 404
        )
        self.assertEqual(
            self.client.patch(
                self.issue_url(issue), {"priority": "low"}, format="json"
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete(self.issue_url(issue)).status_code, 404)

    def test_label_write_follows_same_matrix(self):
        label = services.create_label(self.project, name="bug")

        self.auth(self.project_viewer)
        self.assertEqual(
            self.client.post(self.labels_url, {"name": "x"}, format="json").status_code, 403
        )
        self.assertEqual(
            self.client.patch(self.label_url(label), {"name": "y"}, format="json").status_code, 403
        )
        self.assertEqual(self.client.delete(self.label_url(label)).status_code, 403)

        self.auth(self.outsider)
        self.assertEqual(
            self.client.post(self.labels_url, {"name": "x"}, format="json").status_code, 404
        )
        self.assertEqual(self.client.delete(self.label_url(label)).status_code, 404)

        self.auth(self.ws_admin)  # WS Admin 视同项目 Admin
        self.assertEqual(
            self.client.post(self.labels_url, {"name": "ok"}, format="json").status_code, 201
        )

    def test_workspace_member_without_project_role_is_read_only(self):
        """WS Member 但非 other_project 成员 → 生效角色 Viewer：可读不可写（03 契约）。"""
        other_issue = services.create_issue(self.other_project, self.owner, title="other")
        url = self.other_issues_url
        self.auth(self.project_member)

        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get(f"{url}{other_issue.id}/").status_code, 200)
        self.assertEqual(self.client.post(url, {"title": "x"}, format="json").status_code, 403)
