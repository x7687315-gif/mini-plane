"""消费者测试：握手鉴权、消息协议、组广播（契约 docs/api/08-realtime.md）。"""

from channels.layers import get_channel_layer
from django.contrib.auth.models import AnonymousUser

from apps.realtime.broadcast import project_group
from apps.realtime.consumers import CLOSE_NOT_FOUND, CLOSE_UNAUTHENTICATED
from apps.realtime.tests.base import CONNECT_TIMEOUT, RealtimeTestCase, ws_communicator_as


class ProjectConsumerTests(RealtimeTestCase):
    async def _connect(self, user):
        communicator = ws_communicator_as(
            user, workspace_slug=self.workspace.slug, project_id=self.project.id
        )
        connected, close_code = await communicator.connect(timeout=CONNECT_TIMEOUT)
        return communicator, connected, close_code

    async def test_member_connects_and_receives_handshake_ack(self):
        communicator, connected, _ = await self._connect(self.member)

        self.assertTrue(connected)
        ack = await communicator.receive_json_from()
        self.assertEqual(ack["event"], "connected")
        self.assertEqual(ack["payload"]["project_id"], str(self.project.id))
        self.assertEqual(ack["payload"]["role"], 15)  # ProjectRoles.MEMBER
        await communicator.disconnect()

    async def test_ws_viewer_connects_with_viewer_role(self):
        """WS Member 但不是项目成员 → 生效角色视同项目 Viewer（03 契约）。"""
        communicator, connected, _ = await self._connect(self.viewer)

        self.assertTrue(connected)
        ack = await communicator.receive_json_from()
        self.assertEqual(ack["payload"]["role"], 5)  # ProjectRoles.VIEWER
        await communicator.disconnect()

    async def test_anonymous_user_is_rejected_with_4401(self):
        communicator, connected, close_code = await self._connect(AnonymousUser())

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_UNAUTHENTICATED)

    async def test_stranger_is_rejected_at_handshake(self):
        """非工作区成员在握手阶段就被拒（计划 §Sprint 7 验收点：不接受隐性失败）。"""
        communicator, connected, close_code = await self._connect(self.stranger)

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_NOT_FOUND)

    async def test_unknown_project_is_rejected_the_same_way(self):
        """不存在的项目与非成员**同样 4404**——防枚举语义跨协议一致（00 契约 §4.3）。"""
        communicator = ws_communicator_as(
            self.stranger,
            workspace_slug=self.workspace.slug,
            project_id="00000000-0000-0000-0000-000000000000",
        )
        connected, close_code = await communicator.connect(timeout=CONNECT_TIMEOUT)

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_NOT_FOUND)

    async def test_ping_pong(self):
        communicator, connected, _ = await self._connect(self.member)
        self.assertTrue(connected)
        await communicator.receive_json_from()  # 握手确认帧

        await communicator.send_json_to({"type": "ping"})
        pong = await communicator.receive_json_from()
        self.assertEqual(pong, {"event": "pong", "payload": {}})
        await communicator.disconnect()

    async def test_unsupported_message_gets_error_frame(self):
        communicator, connected, _ = await self._connect(self.member)
        await communicator.receive_json_from()  # 握手确认帧

        await communicator.send_json_to({"type": "evil", "id": "0000"})
        error = await communicator.receive_json_from()
        self.assertEqual(error["event"], "error")
        self.assertIn("ping", error["payload"]["detail"])
        await communicator.disconnect()

    async def test_group_broadcast_reaches_everyone_in_the_room(self):
        first, connected_a, _ = await self._connect(self.owner)
        second, connected_b, _ = await self._connect(self.member)
        self.assertTrue(connected_a and connected_b)
        for communicator in (first, second):
            await communicator.receive_json_from()

        await get_channel_layer().group_send(
            project_group(self.project.id),
            {
                "type": "project.event",
                "event": "issue.updated",
                "payload": {
                    "issue_id": str(self.issue.id),
                    "sequence_id": self.issue.sequence_id,
                },
            },
        )

        for communicator in (first, second):
            frame = await communicator.receive_json_from(timeout=3)
            self.assertEqual(frame["event"], "issue.updated")
            self.assertEqual(frame["payload"]["issue_id"], str(self.issue.id))

        await first.disconnect()
        await second.disconnect()
