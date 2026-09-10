"""Celery 任务（契约 docs/api/07-cache-and-tasks.md）。

两条原则：

1. **纯业务逻辑抽成普通函数**（`_deliver_comment_notification`、`_run_bulk_assign_labels`），
   Celery 任务只是薄壳。这样重试/幂等/状态机都能脱离 broker 单测，
   不用为了让测试跑起来而拖一个 worker 进程。
2. **任务必须幂等**：Celery 的投递语义是 at-least-once，重试、worker 重启、
   手动重投都会导致同一逻辑事件被执行多次（见 Notification.dedupe_key 的说明）。
"""

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.issues.models import Comment
from apps.jobs.models import Notification, TaskRun, TaskStatus

logger = logging.getLogger(__name__)

#: 失败重试次数上限（计划 §Sprint 6：失败重试 3 次退避）
MAX_RETRIES = 3
#: 退避基数：第 n 次重试等待 2**n 秒 → 2s / 4s / 8s
RETRY_BACKOFF_BASE = 2


class TransientJobError(Exception):
    """**可重试**的临时故障（下游超时、连接抖动、5xx）。

    业务错误（参数非法、对象已删除）不要用它——重试不会让它们变好，
    只会把日志刷满并把任务推到 3 次重试后才放弃。
    """


def _retry_countdown(retries: int) -> int:
    """第 n 次重试（n 从 1 数）等待 2**n 秒 → 2s / 4s / 8s。"""
    return RETRY_BACKOFF_BASE ** (retries + 1)


# ── 场景 A：评论通知 ───────────────────────────────────────────


def _deliver_comment_notification(comment_id) -> dict:
    """把"某条评论产生了通知"落到 notifications 表（MVP 只落库）。

    幂等：同一 (事件, 评论, 收件人) 由 `dedupe_key` 唯一约束兜底，
    重复投递走 `skipped` 分支，不报错、不重复落库。
    评论已被删除也**不是错误**——任务必须容忍对象在投递窗口内消失。
    """
    comment = (
        Comment.objects.select_related("issue__project", "author").filter(id=comment_id).first()
    )
    if comment is None:
        return {"delivered": 0, "skipped": 0, "reason": "comment_missing"}

    issue = comment.issue
    # 收件人 = 指派人 + 任务创建者，去掉评论作者自己
    recipient_ids = {issue.assignee_id, issue.created_by_id} - {None, comment.author_id}

    delivered = skipped = 0
    for recipient_id in recipient_ids:
        _, created = Notification.objects.get_or_create(
            dedupe_key=f"comment.created:{comment.id}:{recipient_id}",
            defaults={
                "recipient_id": recipient_id,
                "actor_id": comment.author_id,
                "project_id": issue.project_id,
                "event": "comment.created",
                "payload": {
                    "issue_id": str(issue.id),
                    "sequence_id": issue.sequence_id,
                    "comment_id": str(comment.id),
                },
            },
        )
        delivered += int(created)
        skipped += int(not created)

    logger.info(
        "comment notification delivered=%s skipped=%s comment=%s", delivered, skipped, comment_id
    )
    return {"delivered": delivered, "skipped": skipped}


@shared_task(bind=True, max_retries=MAX_RETRIES, name="jobs.notify_comment_created")
def notify_comment_created(self, comment_id: str) -> dict:
    """评论创建后的通知任务（薄壳：见模块 docstring 原则 1）。"""
    try:
        return _deliver_comment_notification(comment_id)
    except TransientJobError as exc:
        countdown = _retry_countdown(self.request.retries)
        logger.warning(
            "notify_comment_created 临时失败，%ss 后重试（第 %s/%s 次）",
            countdown,
            self.request.retries + 1,
            MAX_RETRIES,
        )
        raise self.retry(exc=exc, countdown=countdown) from exc


# ── 场景 B：Issue 批量操作 ─────────────────────────────────────


def _mark(task_run_id, status: str, *, result=None, error: str | None = None) -> None:
    """只更新状态字段，避免与任务并发修改时互相覆盖。"""
    fields = {"status": status, "updated_at": timezone.now()}
    if result is not None:
        fields["result"] = result
    if error is not None:
        fields["error"] = error
    TaskRun.objects.filter(id=task_run_id).update(**fields)


def _run_bulk_assign_labels(task_run_id) -> dict:
    """把一批 Issue 的标签**覆盖**成给定集合，执行过程写进 TaskRun 状态机。"""
    run = TaskRun.objects.filter(id=task_run_id).select_related("project").first()
    if run is None:
        return {"reason": "task_run_missing"}
    if run.status == TaskStatus.SUCCESS:
        # 幂等：重复投递已经成功过的任务，直接返回上次结果，不重复执行
        return run.result or {}

    _mark(task_run_id, TaskStatus.RUNNING)
    try:
        issue_ids = run.params.get("issue_ids") or []
        label_ids = run.params.get("label_ids") or []
        issues = list(run.project.issues.filter(id__in=issue_ids))
        labels = list(run.project.labels.filter(id__in=label_ids))
        if len(issues) != len(set(issue_ids)):
            raise ValueError("部分 Issue 不属于该项目")
        if len(labels) != len(set(label_ids)):
            raise ValueError("部分标签不属于该项目")

        with transaction.atomic():
            for issue in issues:
                issue.labels.set(labels)

        result = {
            "issues": len(issues),
            "labels": len(labels),
            "label_ids": [str(label.id) for label in labels],
        }
    except Exception as exc:
        # 业务错误：标失败并**不再重试**（重试不会变好），原样抛出便于上层/日志定位
        _mark(task_run_id, TaskStatus.FAILURE, error=str(exc))
        logger.exception("bulk_assign_labels 失败 task_run=%s", task_run_id)
        raise

    _mark(task_run_id, TaskStatus.SUCCESS, result=result)
    logger.info("bulk_assign_labels 完成 task_run=%s result=%s", task_run_id, result)
    return result


@shared_task(bind=True, max_retries=MAX_RETRIES, name="jobs.bulk_assign_labels")
def bulk_assign_labels(self, task_run_id: str) -> dict:
    """批量改标签（异步）。状态查询走 `GET …/tasks/{task_id}/`。"""
    try:
        return _run_bulk_assign_labels(task_run_id)
    except TransientJobError as exc:
        countdown = _retry_countdown(self.request.retries)
        _mark(task_run_id, TaskStatus.PENDING, error=str(exc))
        raise self.retry(exc=exc, countdown=countdown) from exc
