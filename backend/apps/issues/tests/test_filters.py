"""列表查询引擎的测试：过滤 / 搜索 / 排序（契约 docs/api/04-issues.md）。

建单助手（可控 created_at）与查询助手在 IssueListAPITestCase 里，见 tests/base.py。
"""

from datetime import timedelta

from django.utils import timezone

from apps.issues import services
from apps.issues.tests.base import IssueListAPITestCase


class StateFilterTests(IssueListAPITestCase):
    def setUp(self):
        self.todo = self.project.states.get(name="Todo")
        self.done = self.project.states.get(name="Done")
        self.a = self.make_issue(title="a", state=self.todo)
        self.b = self.make_issue(title="b", state=self.done)
        self.c = self.make_issue(title="c")  # Backlog

    def test_state_single(self):
        status, body = self.query(f"state={self.todo.id}")
        self.assertEqual(status, 200)
        self.assertEqual(self.ids_of(body), [str(self.a.id)])

    def test_state_multi_is_or(self):
        status, body = self.query(f"state={self.todo.id},{self.done.id}")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 2)
        self.assertCountEqual(self.ids_of(body), [str(self.a.id), str(self.b.id)])

    def test_state_unknown_returns_empty(self):
        status, body = self.query("state=00000000-0000-0000-0000-000000000000")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 0)

    def test_state_invalid_uuid_400(self):
        status, _ = self.query("state=not-a-uuid")
        self.assertEqual(status, 400)

    def test_state_tolerates_spaces_around_values(self):
        status, body = self.query(f"state={self.todo.id} , {self.done.id} ")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 2)


class PriorityFilterTests(IssueListAPITestCase):
    def setUp(self):
        self.urgent = self.make_issue(title="u", priority="urgent")
        self.high = self.make_issue(title="h", priority="high")
        self.low = self.make_issue(title="l", priority="low")

    def test_priority_single(self):
        status, body = self.query("priority=high")
        self.assertEqual(status, 200)
        self.assertEqual(self.ids_of(body), [str(self.high.id)])

    def test_priority_multi_is_or(self):
        status, body = self.query("priority=urgent,low")
        self.assertEqual(status, 200)
        self.assertCountEqual(self.ids_of(body), [str(self.urgent.id), str(self.low.id)])

    def test_priority_invalid_value_400(self):
        status, body = self.query("priority=urgentt")
        self.assertEqual(status, 400)
        self.assertEqual(body["priority"], ["不支持的优先级：urgentt。"])


class AssigneeFilterTests(IssueListAPITestCase):
    def setUp(self):
        self.mine = self.make_issue(title="mine", assignee=self.project_member)
        self.other = self.make_issue(title="other", assignee=self.owner)
        self.none = self.make_issue(title="none")

    def test_assignee_by_id(self):
        status, body = self.query(f"assignee={self.project_member.id}")
        self.assertEqual(status, 200)
        self.assertEqual(self.ids_of(body), [str(self.mine.id)])

    def test_assignee_me_resolves_current_user(self):
        self.auth(self.project_member)
        body = self.client.get(f"{self.issues_url}?assignee=me").json()
        self.assertEqual(self.ids_of(body), [str(self.mine.id)])

    def test_assignee_unknown_user_returns_empty(self):
        status, body = self.query("assignee=00000000-0000-0000-0000-000000000000")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 0)

    def test_assignee_invalid_value_400(self):
        status, body = self.query("assignee=everyone")
        self.assertEqual(status, 400)
        self.assertEqual(body["assignee"], ["assignee 参数必须是 UUID 或 me。"])


class LabelFilterTests(IssueListAPITestCase):
    def setUp(self):
        self.bug = services.create_label(self.project, name="bug")
        self.perf = services.create_label(self.project, name="perf")
        self.both = self.make_issue(title="both", labels=[self.bug, self.perf])
        self.only_bug = self.make_issue(title="only-bug", labels=[self.bug])
        self.only_perf = self.make_issue(title="only-perf", labels=[self.perf])
        self.none = self.make_issue(title="no-label")

    def test_labels_multi_is_or_union(self):
        """04 契约冻结的语义：命中任一标签即入选（并集）。"""
        status, body = self.query(f"labels={self.bug.id},{self.perf.id}")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 3)
        self.assertCountEqual(
            self.ids_of(body),
            [str(self.both.id), str(self.only_bug.id), str(self.only_perf.id)],
        )

    def test_labels_single(self):
        status, body = self.query(f"labels={self.perf.id}")
        self.assertEqual(status, 200)
        self.assertCountEqual(self.ids_of(body), [str(self.both.id), str(self.only_perf.id)])

    def test_multi_label_match_is_not_duplicated(self):
        """一个 Issue 命中两个标签时，M2M 连接会产生重复行 —— 必须 distinct()。"""
        status, body = self.query(f"labels={self.bug.id},{self.perf.id}&per_page=100")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(self.ids_of(body)), 3)

    def test_labels_invalid_uuid_400(self):
        status, body = self.query("labels=zzz")
        self.assertEqual(status, 400)
        self.assertEqual(body["labels"], ["labels 参数必须是逗号分隔的 UUID。"])


class SearchTests(IssueListAPITestCase):
    def setUp(self):
        # 关键词刻意不重叠：otherwise「标题命中」与「描述命中」会互相污染断言
        self.by_title = self.make_issue(title="登录页验证码不显示")
        self.by_description = self.make_issue(title="另一个问题", description="复现步骤：页面空白")
        self.neither = self.make_issue(title="无关的标题", description="无关的描述")

    def test_search_matches_title(self):
        status, body = self.query("search=验证码")
        self.assertEqual(status, 200)
        self.assertEqual(self.ids_of(body), [str(self.by_title.id)])

    def test_search_matches_description(self):
        status, body = self.query("search=空白")
        self.assertEqual(status, 200)
        self.assertEqual(self.ids_of(body), [str(self.by_description.id)])

    def test_search_is_case_insensitive(self):
        issue = self.make_issue(title="Fix LOGIN bug")
        status, body = self.query("search=login")
        self.assertEqual(status, 200)
        self.assertIn(str(issue.id), self.ids_of(body))

    def test_search_no_result_returns_empty_results(self):
        status, body = self.query("search=zzzz-not-found")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 0)
        self.assertEqual(body["results"], [])
        self.assertIsNone(body["next"])

    def test_search_blank_is_ignored(self):
        status, body = self.query("search=%20%20")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 3)


class FilterCombinationTests(IssueListAPITestCase):
    def setUp(self):
        self.todo = self.project.states.get(name="Todo")
        self.bug = services.create_label(self.project, name="bug")
        self.target = self.make_issue(
            title="目标", state=self.todo, priority="urgent", labels=[self.bug]
        )
        self.make_issue(
            title="同状态但低优先级", state=self.todo, priority="low", labels=[self.bug]
        )
        self.make_issue(title="同优先级但别的状态", priority="urgent", labels=[self.bug])

    def test_filters_are_combined_with_and(self):
        status, body = self.query(
            f"state={self.todo.id}&priority=urgent&labels={self.bug.id}&search=目标"
        )
        self.assertEqual(status, 200)
        self.assertEqual(self.ids_of(body), [str(self.target.id)])

    def test_filter_does_not_bypass_scope_for_outsider(self):
        """带任意过滤参数也不能绕过成员校验（非成员依旧 404）。"""
        self.auth(self.outsider)
        resp = self.client.get(f"{self.issues_url}?state={self.todo.id}&assignee=me&search=x")
        self.assertEqual(resp.status_code, 404)


class IssueOrderingTests(IssueListAPITestCase):
    def setUp(self):
        self.base = timezone.now()
        self.oldest = self.make_issue(
            title="oldest", created_at=self.base - timedelta(hours=2), priority="low"
        )
        self.middle = self.make_issue(
            title="middle", created_at=self.base - timedelta(hours=1), priority="urgent"
        )
        self.newest = self.make_issue(title="newest", created_at=self.base, priority="medium")

    def test_default_ordering_is_created_at_desc(self):
        """缺省排序在 Sprint 5 由 -sequence_id 改为 -created_at（04 契约变更记录）。"""
        status, body = self.query()
        self.assertEqual(status, 200)
        self.assertEqual(
            self.ids_of(body), [str(self.newest.id), str(self.middle.id), str(self.oldest.id)]
        )

    def test_ordering_created_at_asc(self):
        status, body = self.query("ordering=created_at")
        self.assertEqual(
            self.ids_of(body), [str(self.oldest.id), str(self.middle.id), str(self.newest.id)]
        )

    def test_ordering_sequence_id(self):
        status, body = self.query("ordering=sequence_id")
        self.assertEqual(
            self.ids_of(body), [str(self.oldest.id), str(self.middle.id), str(self.newest.id)]
        )

    def test_ordering_priority_uses_severity_not_alphabet(self):
        """字母序会得到 low/medium/urgent，是按严重度排才对（06 契约同款决策）。"""
        status, body = self.query("ordering=priority")
        self.assertEqual(
            self.ids_of(body), [str(self.middle.id), str(self.newest.id), str(self.oldest.id)]
        )

    def test_ordering_priority_desc(self):
        status, body = self.query("ordering=-priority")
        self.assertEqual(
            self.ids_of(body), [str(self.oldest.id), str(self.newest.id), str(self.middle.id)]
        )

    def test_ordering_multiple_fields(self):
        status, body = self.query("ordering=-priority,-sequence_id")
        self.assertEqual(status, 200)
        self.assertEqual(body["count"], 3)

    def test_ordering_invalid_400(self):
        status, body = self.query("ordering=title")
        self.assertEqual(status, 400)
        self.assertEqual(body["ordering"], ["不支持的排序字段：title。"])

    def test_ordering_whitelist_blocks_injection(self):
        status, _ = self.query("ordering=-created_by__password")
        self.assertEqual(status, 400)


class StableOrderingTests(IssueListAPITestCase):
    """稳定排序：时间戳相同的记录要有确定顺序，否则翻页会重复/漏。"""

    def setUp(self):
        same_moment = timezone.now() - timedelta(hours=1)
        self.issues = [
            self.make_issue(title=f"same-{index}", created_at=same_moment) for index in range(3)
        ]

    def test_ties_are_broken_by_sequence_id_desc(self):
        status, body = self.query("ordering=-created_at&per_page=100")
        self.assertEqual(status, 200)
        self.assertEqual([item["sequence_id"] for item in body["results"]], [3, 2, 1])

    def test_ties_are_broken_by_sequence_id_asc(self):
        status, body = self.query("ordering=created_at&per_page=100")
        self.assertEqual(status, 200)
        self.assertEqual([item["sequence_id"] for item in body["results"]], [1, 2, 3])

    def test_pagination_over_ties_does_not_repeat_records(self):
        """同一时间戳下翻页：两页合起来必须恰好是 3 条、无重复。"""
        status, first = self.query("ordering=-created_at&per_page=2&page=1")
        status, second = self.query("ordering=-created_at&per_page=2&page=2")
        self.assertEqual(status, 200)
        ids = self.ids_of(first) + self.ids_of(second)
        self.assertEqual(len(ids), 3)
        self.assertEqual(len(set(ids)), 3)
