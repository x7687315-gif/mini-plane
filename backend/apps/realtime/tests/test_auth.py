"""鉴权链路测试：真实 Cookie → Session → User（契约 docs/api/08-realtime.md）。"""

from apps.realtime.consumers import CLOSE_NOT_FOUND
from apps.realtime.tests.base import (
    CONNECT_TIMEOUT,
    RealtimeTestCase,
    ws_communicator_with_session,
)


class CookieAuthChainTests(RealtimeTestCase):
    async def test_member_connects_with_session_cookie(self):
        communicator = await ws_communicator_with_session(
            self.member, self.workspace.slug, self.project.id
        )
        connected, _ = await communicator.connect(timeout=CONNECT_TIMEOUT)
        self.assertTrue(connected)

        ack = await communicator.receive_json_from()
        self.assertEqual(ack["event"], "connected")
        self.assertEqual(ack["payload"]["role"], 15)  # ProjectRoles.MEMBER
        await communicator.disconnect()

    async def test_logged_in_outsider_is_rejected_with_4404(self):
        """已登录但不是成员：4404（与 HTTP 侧防枚举一致，不泄露"项目是否存在"）。

        未登录（4401）的分支由 test_consumer 的 AnonymousUser 用例覆盖。
        """
        communicator = await ws_communicator_with_session(
            self.stranger, self.workspace.slug, self.project.id
        )
        connected, close_code = await communicator.connect(timeout=CONNECT_TIMEOUT)

        self.assertFalse(connected)
        self.assertEqual(close_code, CLOSE_NOT_FOUND)
