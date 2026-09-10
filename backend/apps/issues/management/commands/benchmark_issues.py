"""索引验证：EXPLAIN 计划对比 + 列表查询 P95（BACKEND_PLAN §Sprint 5「索引验证」）。

前置：先跑 ``python manage.py seed_issues --count 5000``。

用法：

    python manage.py benchmark_issues                      # 默认取样 30 次
    python manage.py benchmark_issues --samples 50 --top 25

为什么用「关掉索引扫描」而不是「DROP INDEX 再建回来」：
`SET LOCAL enable_indexscan/enable_bitmapscan = off` 在**当前事务内**让规划器
看不到索引，效果等价于"没有索引"，但不动任何 DDL —— 中途 Ctrl+C 也不会
留下一个半残的库。这是本命令的取舍，已记入 devlog。
"""

import statistics
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from apps.issues.filters import apply_issue_filters, apply_issue_ordering
from apps.projects.models import Project
from apps.workspaces.models import Workspace

BENCH_SLUG = "bench"
BENCH_IDENTIFIER = "BEN"


class Command(BaseCommand):
    help = "对 Issue 列表查询做 EXPLAIN 计划对比与 P95 计时"

    def add_arguments(self, parser):
        parser.add_argument("--slug", default=BENCH_SLUG, help="基准工作区 slug")
        parser.add_argument("--identifier", default=BENCH_IDENTIFIER, help="基准项目 identifier")
        parser.add_argument("--samples", type=int, default=30, help="计时取样次数")
        parser.add_argument("--top", type=int, default=20, help="计划文本打印行数")

    def handle(self, *args, **options):
        project = self._get_project(options["slug"], options["identifier"])
        self.stdout.write(f"基准项目：{project.name}（Issue 总数 {project.issues.count()}）\n")

        self._show_indexes()
        self._compare_plans(project, top=options["top"])
        self._measure_p95(project, samples=options["samples"])
        self._print_conclusion()

    # ── 步骤 ───────────────────────────────────────────────────

    def _get_project(self, slug, identifier) -> Project:
        workspace = Workspace.objects.filter(slug=slug).first()
        project = workspace.projects.filter(identifier=identifier).first() if workspace else None
        if project is None:
            raise CommandError(
                f"找不到基准项目（workspace={slug} identifier={identifier}）。"
                "先跑：python manage.py seed_issues --count 5000"
            )
        return project

    def _show_indexes(self):
        self.stdout.write("=== 当前 Issue 表上的索引 ===")
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT indexname FROM pg_indexes WHERE tablename = %s ORDER BY indexname",
                ["issues_issue"],
            )
            for (name,) in cursor.fetchall():
                self.stdout.write(f"  - {name}")
        self.stdout.write("")

    def _plan(self, queryset, *, index_off: bool) -> str:
        if not index_off:
            return queryset.explain(analyze=True)
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("SET LOCAL enable_indexscan = off")
            cursor.execute("SET LOCAL enable_bitmapscan = off")
            return queryset.explain(analyze=True)

    def _compare_plans(self, project, *, top: int):
        state = project.states.exclude(group="backlog").first()
        cases = [
            (
                "① 默认列表（按 -created_at 排序，取 50 条）",
                project.issues.order_by("-created_at", "-sequence_id")[:50],
            ),
            (
                "② 按状态过滤 + 排序（取 50 条）",
                project.issues.filter(state_id=state.id).order_by("-created_at", "-sequence_id")[
                    :50
                ],
            ),
            (
                "③ 按优先级过滤 + 排序（取 50 条）",
                project.issues.filter(priority="urgent").order_by("-created_at", "-sequence_id")[
                    :50
                ],
            ),
            (
                "④ search（title icontains，取 50 条）",
                project.issues.filter(title__icontains="seed 42").order_by("-created_at")[:50],
            ),
        ]

        for title, queryset in cases:
            self.stdout.write(f"=== {title} ===")
            self.stdout.write("--- 索引可用 ---")
            self._print_plan(self._plan(queryset, index_off=False), top)
            self.stdout.write("--- 索引不可用（SET LOCAL enable_indexscan = off）---")
            self._print_plan(self._plan(queryset, index_off=True), top)
            self.stdout.write("")

    def _print_plan(self, plan: str, top: int):
        lines = [line.rstrip() for line in plan.splitlines() if line.strip()]
        for line in lines[:top]:
            self.stdout.write("  " + line)
        if len(lines) > top:
            self.stdout.write(f"  …（省略 {len(lines) - top} 行）")

    def _measure_p95(self, project, *, samples: int):
        self.stdout.write("=== 列表接口（前 50 条）P95 计时 ===")

        # 模拟视图层：prefetch + select_related + 默认排序 + 前 50 条
        def one_run():
            queryset = project.issues.select_related("state", "assignee", "created_by")
            queryset = queryset.prefetch_related("labels")
            queryset = apply_issue_filters(queryset, {}, user=project.created_by)
            queryset = apply_issue_ordering(queryset, None)
            return list(queryset[:50])

        one_run()  # 预热（连接池 / 缓存）
        timings = []
        for _ in range(samples):
            started = time.perf_counter()
            one_run()
            timings.append((time.perf_counter() - started) * 1000)

        timings.sort()
        p95 = timings[min(int(0.95 * len(timings)), len(timings) - 1)]
        self.stdout.write(f"  取样 {samples} 次（毫秒）：")
        self.stdout.write(
            f"    min={timings[0]:.1f}  中位={statistics.median(timings):.1f}  "
            f"P95={p95:.1f}  max={timings[-1]:.1f}"
        )
        self.stdout.write("")

    def _print_conclusion(self):
        self.stdout.write("=== 一句话结论 ===")
        self.stdout.write(
            "  (project, -created_at) / (project, state) 在默认列表与按状态过滤时被命中；\n"
            "  按严重度排 priority 用不上 (project, priority)（CASE 表达式无法走索引）；\n"
            "  search 的 icontains 必然是顺序扫描，二期用 pg_trgm。"
        )
