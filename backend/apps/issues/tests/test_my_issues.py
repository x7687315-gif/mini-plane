"""「我的工作」跨项目聚合接口（特色 B）：scope 过滤 + 可见性隔离。"""

from rest_framework import status

from apps.issues import services
from apps.issues.tests.base import IssueAPITestCase

MINE_URL = "/api/v1/issues/mine/"


class MyIssuesTests(IssueAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()  # 建好 owner / project_member / outsider 等标准场景
        # project_member 自己建一条并指派给自己
        services.create_issue(
            cls.project, cls.project_member, title="pm-created", assignee=cls.project_member
        )
        # owner 建一条指派给 project_member
        services.create_issue(
            cls.project, cls.owner, title="pm-assigned", assignee=cls.project_member
        )
        # owner 自留一条（project_member 既非创建者也非指派人）
        services.create_issue(cls.project, cls.owner, title="owner-only", assignee=cls.owner)

    def _titles(self, resp):
        return {i["title"] for i in resp.json()["results"]}

    def test_scope_assigned(self):
        self.client.force_authenticate(self.project_member)
        r = self.client.get(MINE_URL, {"scope": "assigned"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(self._titles(r), {"pm-created", "pm-assigned"})

    def test_scope_created(self):
        self.client.force_authenticate(self.project_member)
        r = self.client.get(MINE_URL, {"scope": "created"})
        self.assertEqual(self._titles(r), {"pm-created"})

    def test_scope_all_is_union(self):
        self.client.force_authenticate(self.project_member)
        r = self.client.get(MINE_URL)  # 默认 all
        self.assertEqual(self._titles(r), {"pm-created", "pm-assigned"})

    def test_outsider_sees_nothing(self):
        """非工作区成员：即便有 issue 也不在其可访问项目集内 → 空结果（不泄露存在性）。"""
        self.client.force_authenticate(self.outsider)
        r = self.client.get(MINE_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()["results"], [])

    def test_requires_auth(self):
        r = self.client.get(MINE_URL)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)
