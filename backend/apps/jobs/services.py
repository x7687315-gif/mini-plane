"""任务编排：创建 TaskRun（pending）并把任务投递到队列。

调度与执意分离：视图/services 只负责"登记 + 投递"，真正的执行在 apps/jobs/tasks.py。
"""

import logging

from django.db import transaction

from apps.jobs.models import TaskKind, TaskRun, TaskStatus
from apps.jobs.tasks import bulk_assign_labels

logger = logging.getLogger(__name__)


def start_bulk_assign_labels(project, actor, *, issue_ids, label_ids) -> TaskRun:
    """登记一个批量改标签任务并投递。

    **为什么要 `transaction.on_commit`**：如果在事务内直接 `.delay()`，
    worker 可能在事务提交前就抢到消息，去读一条还不存在的 TaskRun（经典竞态）。
    `on_commit` 保证消息只在数据对其它连接可见之后才发出。
    在没有外层事务时（当前视图就是这种情况）它会立即执行，语义仍然正确。
    """
    run = TaskRun.objects.create(
        project=project,
        actor=actor,
        kind=TaskKind.BULK_ASSIGN_LABELS,
        status=TaskStatus.PENDING,
        params={
            "issue_ids": [str(value) for value in issue_ids],
            "label_ids": [str(value) for value in label_ids],
        },
    )
    transaction.on_commit(lambda: bulk_assign_labels.delay(str(run.id)))
    logger.info("已登记批量任务 task_run=%s issues=%s", run.id, len(issue_ids))
    return run
