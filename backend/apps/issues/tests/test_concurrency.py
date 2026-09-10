"""并发发号测试（决策 D9 的核心验收）。

必须用 `TransactionTestCase`：普通 `TestCase` 把整个用例包在一个事务里，
子线程既看不到主线程未提交的数据，也无法产生真实的行锁竞争。

这里用真线程 + Barrier 制造最大争抢：N 个线程同时开始，各创建 M 个 Issue。
若 `create_issue` 里的 `select_for_update()` 失效，`sequence_id` 必然重号
（唯一约束抛 IntegrityError）或出现空洞。
"""

import threading

from django.db import connection
from django.test import TransactionTestCase

from apps.issues.models import Issue
from apps.issues.services import create_issue
from apps.issues.tests.base import IssueScenarioMixin


class IssueSequenceConcurrencyTests(IssueScenarioMixin, TransactionTestCase):
    THREADS = 5
    PER_THREAD = 6

    def setUp(self):
        self.build_scenario(slug="concurrency-ws", identifier="CON")
        self.expected_total = self.THREADS * self.PER_THREAD

    def _run_concurrent_creation(self):
        barrier = threading.Barrier(self.THREADS)
        errors = []

        def worker():
            try:
                barrier.wait(timeout=15)
                for _ in range(self.PER_THREAD):
                    create_issue(self.project, self.owner, title="concurrent")
            except Exception as exc:  # 线程内的任何异常都要带回主线程断言，不能默默吞掉
                errors.append(exc)
            finally:
                connection.close()  # 线程结束必须归还连接，否则测试库无法清理

        threads = [threading.Thread(target=worker) for _ in range(self.THREADS)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        return errors

    def test_concurrent_creation_allocates_continuous_unique_sequences(self):
        errors = self._run_concurrent_creation()

        self.assertEqual(errors, [])
        sequences = sorted(
            Issue.objects.filter(project=self.project).values_list("sequence_id", flat=True)
        )
        self.assertEqual(len(sequences), self.expected_total)
        # 既无重号也无空洞 = 每个序号恰好被发放一次
        self.assertEqual(sequences, list(range(1, self.expected_total + 1)))

        self.project.refresh_from_db()
        self.assertEqual(self.project.issue_sequence, self.expected_total)

    def test_concurrent_creation_does_not_break_unique_constraint(self):
        """稳定复跑一轮：先跑两次并发，再验证库里序号集合仍然恰好是 1..N。"""
        self._run_concurrent_creation()
        self._run_concurrent_creation()

        total = self.expected_total * 2
        sequences = sorted(
            Issue.objects.filter(project=self.project).values_list("sequence_id", flat=True)
        )
        self.assertEqual(sequences, list(range(1, total + 1)))
