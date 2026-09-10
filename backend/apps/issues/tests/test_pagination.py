"""分页行为的测试（契约 docs/api/00-conventions.md §3、04 契约「分页边界」）。

Sprint 5 相对 DRF 默认改了两点：非整数 page → 400；越界 page → 200 + 空 results。
"""

from apps.issues import services
from apps.issues.tests.base import IssueListAPITestCase

TOTAL = 12


class PaginationTests(IssueListAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for index in range(1, TOTAL + 1):
            services.create_issue(cls.project, cls.owner, title=f"page-{index}")

    def test_first_page_shape(self):
        status, body = self.query("per_page=5")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], TOTAL)
        self.assertEqual(len(body["results"]), 5)
        self.assertIsNotNone(body["next"])
        self.assertIsNone(body["previous"])

    def test_middle_page_has_both_links(self):
        status, body = self.query("per_page=5&page=2")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["results"]), 5)
        self.assertIsNotNone(body["next"])
        self.assertIsNotNone(body["previous"])

    def test_last_page_shows_remainder(self):
        status, body = self.query("per_page=5&page=3")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNone(body["next"])
        self.assertIsNotNone(body["previous"])

    def test_per_page_over_max_is_capped(self):
        """超过上限是**收敛**不是报错（per_page=1000 → 100）。"""
        status, body = self.query("per_page=1000")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], TOTAL)
        self.assertEqual(len(body["results"]), TOTAL)

    def test_page_out_of_range_returns_empty_results_not_404(self):
        """筛选后结果变少、页码停在旧值时，要的是空结果而不是 404。"""
        status, body = self.query("per_page=5&page=99")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], TOTAL)
        self.assertEqual(body["results"], [])
        self.assertIsNone(body["next"])
        self.assertIsNotNone(body["previous"])  # 前端据此把页码拉回最后一页

    def test_page_non_integer_400(self):
        """非整数页码是前端 bug，必须喊出来，不能悄悄返回空。"""
        status, body = self.query("page=abc")
        self.assertEqual(status, 400)
        self.assertEqual(body["page"], ["页码必须是整数。"])

    def test_page_zero_or_negative_is_out_of_range(self):
        for raw in ("0", "-1"):
            with self.subTest(page=raw):
                status, body = self.query(f"page={raw}")
                self.assertEqual(status, 200)
                self.assertEqual(body["results"], [])

    def test_count_reflects_filters_not_total(self):
        status, body = self.query("search=page-1&per_page=100")
        self.assertEqual(status, 200)
        # page-1 与 page-10/11/12 都匹配 "page-1"
        self.assertEqual(body["count"], 4)
