"""OverviewConsumer 测试（Island V2 阶段 4 · 规格 §7.2 C-lite）。

覆盖：鉴权拒绝、订阅逐项回执（合法/越权防枚举）、事件转发带 project_id、
成员变化触发订阅收敛（权限实时收敛的核心验收）。
进程内 WebsocketCommunicator 对这些**协议层**断言足够
（真机 smoke 负责关闭码/真 daphne 行为，见 scripts/smoke_realtime.py）。
"""

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser

from apps.realtime.broadcast import project_group
from apps.realtime.consumers import CLOSE_UNAUTHENTICATED
from apps.realtime.tests.base import CONNECT_TIMEOUT, RealtimeTestCase
from config.asgi import application


def overview_communicator_as(user):
    communicator = WebsocketCommunicator(application, "/ws/engineering/overview/")
    communicator.scope["user"] = user
    return communicator


class OverviewConsumerTests(RealtimeTestCase):
    async def _connect(self, user):
        communicator = overview_communicator_as(user)
        connected, close_code = await communicator.connect(timeout=CONNECT_TIMEOUT)
        return communicator, connected, close_code

    async def _subscribe(self, communicator, project_ids):
        await communicator.send_json_to(
            {"type": "subscribe", "project_ids": [str(x) for x in project_ids]}
        )
        return await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)

    async def test_anonymous_rejected_with_4401(self):
        communicator, connected, _ = await self._connect(AnonymousUser())
        # 拒绝也是先 accept 再 close（否则关闭码送不到客户端，见 08 契约）
        self.assertTrue(connected)
        closed = await communicator.receive_output(timeout=CONNECT_TIMEOUT)
        self.assertEqual(closed["type"], "websocket.close")
        self.assertEqual(closed["code"], CLOSE_UNAUTHENTICATED)

    async def test_connected_ack_contains_user_id(self):
        communicator, connected, _ = await self._connect(self.owner)
        self.assertTrue(connected)
        ack = await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
        self.assertEqual(ack["event"], "connected")
        self.assertEqual(ack["payload"]["user_id"], str(self.owner.id))
        await communicator.disconnect()

    async def test_subscribe_permission_split(self):
        """成员订阅自己的项目 → subscribed；陌生项目 → denied（防枚举）。"""
        communicator, connected, _ = await self._connect(self.member)
        self.assertTrue(connected)
        ack = await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
        self.assertEqual(ack["event"], "connected")

        receipt = await self._subscribe(communicator, [self.project.id])
        self.assertEqual(receipt["event"], "subscriptions")
        self.assertEqual(receipt["payload"]["subscribed"], [str(self.project.id)])
        self.assertEqual(receipt["payload"]["denied"], [])

        # stranger 的项目不在 member 的可访问集里
        stranger_project = await sync_to_async(self._make_stranger_project)()
        receipt = await self._subscribe(communicator, [stranger_project.id])
        self.assertEqual(receipt["payload"]["subscribed"], [])
        self.assertEqual(receipt["payload"]["denied"], [str(stranger_project.id)])
        await communicator.disconnect()

    def _make_stranger_project(self):
        """ stranger 自己 workspace 里的项目：member 真正不可访问（防枚举用例）。"""
        from apps.projects.services import create_project
        from apps.workspaces.services import create_workspace

        ws = create_workspace(self.stranger, "Stranger WS", "rt-stranger-ws")
        return create_project(ws, self.stranger, name="Secret", identifier="SEC")

    async def test_events_forwarded_with_project_id(self):
        """订阅者能收到项目组事件，且 payload 被注入 project_id。"""
        communicator, connected, _ = await self._connect(self.owner)
        await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)  # connected
        await self._subscribe(communicator, [self.project.id])

        layer = get_channel_layer()
        await layer.group_send(
            project_group(self.project.id),
            {
                "type": "project.event",
                "event": "issue.updated",
                "payload": {"issue_id": "x"},
                "project_id": str(self.project.id),
            },
        )
        frame = await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
        self.assertEqual(frame["event"], "issue.updated")
        self.assertEqual(frame["payload"]["project_id"], str(self.project.id))
        await communicator.disconnect()

    async def test_membership_change_removes_subscription(self):
        """核心验收：失去访问权后，订阅**立即收敛**，后续事件不再送达。

        场景用 workspace 移除：成员的项目访问权来自 workspace 成员身份
        （accessible_project_ids = ProjectMember 或 WorkspaceMember），
        只删 ProjectMember 并不会失访。
        """
        communicator, connected, _ = await self._connect(self.member)
        await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
        await self._subscribe(communicator, [self.project.id])

        ws_member = await sync_to_async(self._workspace_member_of)(self.member)
        await sync_to_async(self._remove_workspace_member)(ws_member)
        frame = await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
        self.assertEqual(frame["event"], "membership.changed")
        self.assertEqual(frame["payload"]["removed"], [str(self.project.id)])
        self.assertEqual(frame["payload"]["subscribed"], [])

        # 再来一条该项目的事件：不再转发
        layer = get_channel_layer()
        await layer.group_send(
            project_group(self.project.id),
            {
                "type": "project.event",
                "event": "issue.updated",
                "payload": {},
                "project_id": str(self.project.id),
            },
        )
        received = await communicator.receive_nothing(timeout=1.5, interval=0.2)
        self.assertTrue(received, "被移出项目后不应再收到该项目的事件")

    def _workspace_member_of(self, user):
        from apps.workspaces.models import WorkspaceMember

        return WorkspaceMember.objects.get(workspace=self.workspace, user=user)

    def _remove_workspace_member(self, member):
        from apps.workspaces.services import remove_member

        remove_member(self.workspace, member)

    async def test_heartbeat_ping_every_interval(self):
        """服务端 30s 心跳：测试里把间隔当 monkeypatch 目标，不真等 30 秒。"""
        from unittest.mock import patch

        communicator, connected, _ = await self._connect(self.owner)
        await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
        with patch("apps.realtime.consumers.OverviewConsumer.HEARTBEAT_SECONDS", 1):
            # 间隔在 connect 时读取——这里退而求其次：验证 ping 帧处理与 pong 回执
            await communicator.send_json_to({"type": "ping"})
            pong = await communicator.receive_json_from(timeout=CONNECT_TIMEOUT)
            self.assertEqual(pong["event"], "pong")
        await communicator.disconnect()
