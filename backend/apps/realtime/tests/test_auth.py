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
        connected, _ = await communicator.connect(timeout=CONNECT_TIMEOUT)

        # ⚠️ 这里断言"连上了、随即被关闭"，而不是"没连上"。
        #
        # 契约 08 规定的是**关闭码**（4401/4404）。而关闭码只有在 `accept()` 之后
        # 才可能送达客户端：若在 accept() 前 close()，daphne 会把它当成"拒绝握手"，
        # 直接回 `HTTP 403 Access denied`，客户端只会看到 1006。
        # 早期实现正是"先 close"，而 WebsocketCommunicator **照样能读到 close_code**，
        # 所以这个偏差在测试里完全隐形 —— 直到 scripts/smoke_realtime.py 对着
        # 真 daphne 跑才暴露出来（2026-09-18）。
        self.assertTrue(connected, "被拒绝的连接也需先完成握手，否则关闭码送不到客户端")
        # accept 之后的 close 是**独立的一帧输出**，必须显式取：
        # 旧实现（accept 前 close）会让 communicator.connect() 直接回 (False, code)，
        # 所以这里从"读 connect() 的第二个返回值"改成"收帧"。
        closed = await communicator.receive_output(timeout=CONNECT_TIMEOUT)
        self.assertEqual(closed["type"], "websocket.close")
        self.assertEqual(closed["code"], CLOSE_NOT_FOUND)
