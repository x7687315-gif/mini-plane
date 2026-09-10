"""广播与业务挂钩的测试（契约 docs/api/08-realtime.md）。

两层覆盖：
1. `broadcast()` 的消息形状（type/event/payload，且与 HTTP 响应体同样 JSON-safe）；
2. 服务层挂钩：**必须在 on_commit 之后**广播，且"没有变化就不广播"。
"""

import uuid
from datetime import UTC, datetime
from unittest import mock
from unittest.mock import AsyncMock

from channels.layers import get_channel_layer
from django.test import TestCase

from apps.issues import services as issue_services
from apps.realtime import broadcast as rt
from apps.realtime.broadcast import KNOWN_EVENTS, broadcast, project_group
from apps.realtime.tests.base import RealtimeScenarioMixin, RealtimeTestCase


def patch_group_send():
    """把 channel layer 的 group_send 换成 AsyncMock，捕获广播内容。

    AsyncMock 替换后不触碰真实 channel layer，也就没有线程跳跃，
    所以这组用例可以用 TestCase + captureOnCommitCallbacks。
    """
    layer = get_channel_layer()
    return mock.patch.object(layer, "group_send", new=AsyncMock())


def frames_of(group_send_mock) -> list[dict]:
    """取所有被广播的消息帧（不含组名）。"""
    return [call.args[1] for call in group_send_mock.await_args_list]


class BroadcastTests(RealtimeTestCase):
    def setUp(self):
        self.build_scenario(slug="bcast-ws", identifier="BC")

    def test_only_two_events_are_defined(self):
        """契约 08 的权威清单：刻意收窄到两个事件（不做全站广播）。"""
        self.assertEqual(KNOWN_EVENTS, ("issue.updated", "comment.created"))

    def test_group_name_format(self):
        """Channels 组名不允许冒号（实测 TypeError），所以用点号分隔。"""
        self.assertEqual(project_group("abc"), "project.abc")

    def test_frame_shape(self):
        with patch_group_send() as group_send:
            broadcast(
                self.project.id,
                rt.EVENT_ISSUE_UPDATED,
                {"issue_id": "i", "sequence_id": 1},
            )

        (call,) = group_send.await_args_list
        self.assertEqual(call.args[0], project_group(self.project.id))
        frame = call.args[1]
        self.assertEqual(frame["type"], "project.event")
        self.assertEqual(frame["event"], "issue.updated")
        self.assertEqual(frame["payload"], {"issue_id": "i", "sequence_id": 1})

    def test_datetime_is_serialized_like_http_responses(self):
        """与 07 契约同一条规则：缓存/推送里的时间都是 ISO8601 字符串。"""
        moment = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
        with patch_group_send() as group_send:
            broadcast(self.project.id, rt.EVENT_COMMENT_CREATED, {"created_at": moment})

        self.assertEqual(frames_of(group_send)[0]["payload"]["created_at"], "2026-09-10T12:00:00Z")

    def test_uuid_is_serialized_like_http_responses(self):
        some_id = uuid.uuid4()
        with patch_group_send() as group_send:
            broadcast(self.project.id, rt.EVENT_ISSUE_UPDATED, {"issue_id": some_id})

        self.assertEqual(frames_of(group_send)[0]["payload"]["issue_id"], str(some_id))


class ServiceHookTests(RealtimeScenarioMixin, TestCase):
    def setUp(self):
        self.build_scenario(slug="hook-ws", identifier="HK")

    def test_update_issue_defers_issue_updated(self):
        with patch_group_send() as group_send:
            with self.captureOnCommitCallbacks(execute=True):
                issue = issue_services.create_issue(self.project, self.owner, title="挂钩用例")
                issue_services.update_issue(issue, actor=self.owner, priority="high")

        events = [frame["event"] for frame in frames_of(group_send)]
        # 创建事件不在本期范围（契约 08 只定义 issue.updated / comment.created）
        self.assertEqual(events, ["issue.updated"])
        payload = frames_of(group_send)[0]["payload"]
        self.assertEqual(payload["issue_id"], str(issue.id))
        self.assertEqual(payload["old_value"], {"priority": "none"})
        self.assertEqual(payload["new_value"], {"priority": "high"})

    def test_comment_created_defers_comment_created(self):
        with patch_group_send() as group_send:
            with self.captureOnCommitCallbacks(execute=True):
                comment = issue_services.create_comment(
                    self.issue, self.member, content="看到推送了吗"
                )

        (frame,) = frames_of(group_send)
        self.assertEqual(frame["event"], "comment.created")
        self.assertEqual(frame["payload"]["comment_id"], str(comment.id))
        self.assertEqual(frame["payload"]["content"], "看到推送了吗")
        self.assertEqual(frame["payload"]["author"]["username"], "rt-member")
        self.assertEqual(frame["payload"]["issue_id"], str(self.issue.id))

    def test_patch_without_change_defers_nothing(self):
        """与活动留痕同一套 diff 规则：值没变就不广播，不制造噪声。"""
        with patch_group_send() as group_send:
            with self.captureOnCommitCallbacks(execute=True):
                issue_services.update_issue(self.issue, actor=self.owner, title=self.issue.title)

        self.assertEqual(group_send.await_count, 0)
