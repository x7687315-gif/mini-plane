"""造一批 Issue 用于性能验证（BACKEND_PLAN §Sprint 5「索引验证」）。

用法：

    python manage.py seed_issues --count 5000          # 造 5000 条（幂等：先清后造）
    python manage.py seed_issues --count 5000 --keep   # 已有数据时追加而不是重建
    python manage.py seed_issues --clean               # 只清理基准数据

**刻意不走 services.create_issue**：那条路径每条都要发号加锁 + 写一条活动留痕，
5000 条会慢到不可用。这里是纯查询性能基准，用 bulk_create 一次写入，
代价是**这批数据没有配套的活动留痕**（对查询计划毫无影响）。
"""

import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.issues.models import Issue, IssuePriorities, Label
from apps.projects.services import create_project
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoles
from apps.workspaces.services import create_workspace

User = get_user_model()

BENCH_SLUG = "bench"
BENCH_IDENTIFIER = "BEN"
BENCH_USERNAME = "bench_user"
BENCH_LABELS = [("bug", "#ef4444"), ("perf", "#f97316"), ("docs", "#3b82f6")]
PRIORITY_WEIGHTS = [
    (IssuePriorities.URGENT, 5),
    (IssuePriorities.HIGH, 15),
    (IssuePriorities.MEDIUM, 30),
    (IssuePriorities.LOW, 30),
    (IssuePriorities.NONE, 20),
]


class Command(BaseCommand):
    help = "为索引/性能验证造一批 Issue（默认 5000 条，可重复执行）"

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=5000, help="要造的 Issue 条数")
        parser.add_argument("--keep", action="store_true", help="保留已有基准数据，追加写入")
        parser.add_argument("--clean", action="store_true", help="只清理基准工作区后退出")
        parser.add_argument("--seed", type=int, default=42, help="随机种子（保证可复现）")

    def handle(self, *args, **options):
        if options["clean"]:
            self._clean()
            return

        random.seed(options["seed"])
        count = options["count"]
        if count <= 0:
            raise CommandError("--count 必须是正整数")

        if not options["keep"]:
            self._clean()

        workspace = self._get_or_create_workspace()
        project = self._get_or_create_project(workspace)
        labels = self._get_or_create_labels(project)

        start_sequence = project.issues.count()
        self._bulk_create(project, labels, start=start_sequence, count=count)

        total = project.issues.count()
        self.stdout.write(
            self.style.SUCCESS(
                f"基准数据就绪：workspace={BENCH_SLUG} project={project.id} "
                f"本次新增={count} 总计={total}"
            )
        )
        self.stdout.write("清理命令：python manage.py seed_issues --clean")

    # ── 内部步骤 ────────────────────────────────────────────────

    def _clean(self):
        deleted = Workspace.objects.filter(slug=BENCH_SLUG).delete()
        self.stdout.write(f"已清理基准工作区（级联删除对象数：{deleted[0] if deleted else 0}）")

    def _get_or_create_workspace(self) -> Workspace:
        user, _ = User.objects.get_or_create(
            username=BENCH_USERNAME,
            defaults={"email": f"{BENCH_USERNAME}@example.com", "is_active": True},
        )
        if not user.has_usable_password():
            user.set_unusable_password()
            user.save(update_fields=["password"])

        workspace = Workspace.objects.filter(slug=BENCH_SLUG).first()
        if workspace is None:
            workspace = create_workspace(user, "Benchmark", BENCH_SLUG)
        WorkspaceMember.objects.get_or_create(
            workspace=workspace, user=user, defaults={"role": WorkspaceRoles.ADMIN}
        )
        return workspace

    def _get_or_create_project(self, workspace: Workspace):
        project = workspace.projects.filter(identifier=BENCH_IDENTIFIER).first()
        if project is None:
            project = create_project(
                workspace,
                workspace.owner,
                name="Benchmark Project",
                identifier=BENCH_IDENTIFIER,
                description="用于索引与性能验证的基准项目，可随时删除",
            )
        return project

    def _get_or_create_labels(self, project):
        labels = []
        for name, color in BENCH_LABELS:
            label, _ = Label.objects.get_or_create(
                project=project, name=name, defaults={"color": color}
            )
            labels.append(label)
        return labels

    @transaction.atomic
    def _bulk_create(self, project, labels, *, start: int, count: int) -> None:
        """分批 bulk_create；时间戳人为铺开在过去 180 天内（贴近真实分布）。"""
        states = list(project.states.all())
        backlog = next(s for s in states if s.group == "backlog")
        # 取一个真实用户当创建者/指派人候选（created_by 是 PROTECT，不能为空）
        members = list(
            project.members.select_related("user").values_list("user_id", flat=True)
        ) or [project.created_by_id]

        now = timezone.now()
        batch_size = 500
        for offset in range(0, count, batch_size):
            batch = []
            for index in range(offset, min(offset + batch_size, count)):
                sequence_id = start + index + 1
                batch.append(
                    Issue(
                        project=project,
                        sequence_id=sequence_id,
                        title=f"seed issue #{sequence_id}",
                        description=f"基准数据，用于验证索引与查询性能。seed={sequence_id}",
                        priority=random.choices(
                            [value for value, _ in PRIORITY_WEIGHTS],
                            weights=[weight for _, weight in PRIORITY_WEIGHTS],
                        )[0],
                        state=random.choice(states) if random.random() < 0.7 else backlog,
                        assignee_id=random.choice(members) if random.random() < 0.6 else None,
                        created_by_id=project.created_by_id,
                    )
                )
            created = Issue.objects.bulk_create(batch, ignore_conflicts=True)
            # bulk_create 只能批量写主表，M2M 与 created_at 需要二次处理
            self._stamp_created_at(created, now)
            self._attach_labels(created, labels)

        project.issue_sequence = max(project.issue_sequence, start + count)
        project.save(update_fields=["issue_sequence", "updated_at"])

    @staticmethod
    def _stamp_created_at(issues, now) -> None:
        """把 created_at 铺开到过去 180 天（auto_now_add 会统一写成"现在"，那不像真实数据）。"""
        for issue in issues:
            issue.created_at = now - timedelta(minutes=random.randint(1, 180 * 24 * 60))
            issue.updated_at = issue.created_at
        Issue.objects.bulk_update(issues, ["created_at", "updated_at"], batch_size=500)

    @staticmethod
    def _attach_labels(issues, labels) -> None:
        through = Issue.labels.through
        rows = []
        for issue in issues:
            for label in labels:
                if random.random() < 0.25:
                    rows.append(through(issue_id=issue.id, label_id=label.id))
        if rows:
            through.objects.bulk_create(rows, ignore_conflicts=True)
