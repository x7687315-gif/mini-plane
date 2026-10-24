"""项目频道的 WebSocket 消费者（契约 docs/api/08-realtime.md）。

URL：`/ws/workspaces/{workspace_slug}/projects/{project_id}/`

权限：**握手阶段**就复用「生效角色」的统一实现——
非工作区成员、或项目不可见，一律 `close(4404)`，
不会出现"连上了却什么都收不到"的隐性失败（计划 §Sprint 7 验收点）。

消息协议：客户端**只能**发 `{"type": "ping"}`（心跳）；其它输入回 error 帧。
服务端推 `{"event": ..., "payload": ...}` 两类帧：`connected` 握手确认 / 业务事件。
"""

import asyncio
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.realtime.broadcast import permission_group, project_group

logger = logging.getLogger(__name__)

#: 自定义关闭码：4404 = 资源不存在或不可见（对齐 HTTP 侧的防枚举语义）
CLOSE_NOT_FOUND = 4404
#: 自定义关闭码：4401 = 未登录（对齐 HTTP 的 401）
CLOSE_UNAUTHENTICATED = 4401


class ProjectConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.reject_with(CLOSE_UNAUTHENTICATED)
            return

        kwargs = self.scope["url_route"]["kwargs"]
        # 双路由形态（Phase 5）：含 workspace slug 的兼容路径与只凭 pid 的规范路径
        # （私人工程没有 slug，ADR-001）。uuid 路径转换器给的是 UUID 对象；后面要进
        # JSON 帧，统一转成字符串。
        project_id = str(kwargs["project_id"])
        workspace_slug = kwargs.get("workspace_slug")

        role = await self._effective_role(workspace_slug, project_id)
        if role is None:
            await self.reject_with(CLOSE_NOT_FOUND)
            return

        self.group_name = project_group(project_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json(
            {"event": "connected", "payload": {"project_id": project_id, "role": role}}
        )

    async def reject_with(self, code: int) -> None:
        """拒绝一个连接时，**先 accept 再 close** —— 否则关闭码到不了客户端。

        这是个很容易写错、且测试看不出来的细节：
        Channels 里若在 `accept()` **之前** `close()`，daphne 会把它当成"拒绝握手"，
        直接回 `HTTP 1.1 403 Access denied` 把升级挡掉。客户端于是只看到
        1006（异常关闭），**拿不到 4401 / 4404**。

        后果不是"文档不准"，而是前端行为错：前端 `features/realtime/policy.ts`
        按关闭码分流（4401 → 跳登录、4404 → 停止重连），收到 1006 会被归为
        "可重连"，于是**会话过期或项目不可见时会无限重连**，既不去登录也不停。

        契约 08 明确写的是关闭码，所以这里必须先 accept。
        用 `WebsocketCommunicator` 的测试**看不到**这个差异（它照样能读到 close code），
        所以 2026-09-18 之前一直没被发现 —— 由 scripts/smoke_realtime.py 首次真跑抓到。
        """
        await self.accept()
        await self.close(code=code)

    async def disconnect(self, code):
        group_name = getattr(self, "group_name", None)
        if group_name is not None:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """客户端输入面刻意收窄：只有 ping（心跳），其它一律回 error 帧。"""
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"event": "pong", "payload": {}})
            return
        await self.send_json(
            {"event": "error", "payload": {"detail": "不支持的消息，客户端只能发送 ping。"}}
        )

    async def project_event(self, message):
        """`group_send(type="project.event")` 的处理入口 → 原样转发给浏览器。"""
        await self.send_json({"event": message["event"], "payload": message["payload"]})

    @database_sync_to_async
    def _effective_role(self, workspace_slug, project_id):
        """与 HTTP 侧同一套生效角色实现（core.permissions，唯一判定点）。

        刻意只取少量列：这是 WebSocket 的**高频握手**，不需要把整行读出来。
        `workspace_slug` 为 None = 规范路径（只凭 pid，ADR-001；私人工程走这里）。
        """
        from apps.projects.models import Project
        from core.permissions import get_effective_project_role_by_ids

        project = (
            Project.objects.filter(id=project_id)
            if workspace_slug is None
            else Project.objects.filter(id=project_id, workspace__slug=workspace_slug)
        ).only("id", "workspace_id", "owner_id").first()
        if project is None:
            return None
        return get_effective_project_role_by_ids(
            self.scope["user"],
            workspace_id=project.workspace_id,
            project_id=project.id,
            owner_id=project.owner_id,
        )


class OverviewConsumer(AsyncJsonWebsocketConsumer):
    """跨项目总览通道（Island V2 阶段 4 · 规格 §7.2 · C-lite）。

    URL：`/ws/engineering/overview/`。Island **所有项目共用这一条连接**。

    协议：
    - 客户端 → 服务端：`{"type":"subscribe","project_ids":[...]}` /
      `{"type":"unsubscribe","project_ids":[...]}` / `{"type":"ping"}`
    - 服务端 → 客户端：`connected` / `subscriptions`（逐项回执）/
      `membership.changed`（订阅被收敛）/ `ping`（30s 心跳）/
      既有业务事件（issue.updated / comment.created / agent.session，**注入 project_id**）

    为什么订阅要逐项校验：WS 是长连接，"握手时校验一次"不够（djangozen：
    authorize on connect **and** check permission for each action）；
    为什么额外挂 `permission.{user_id}` 组：成员变动时能**主动**通知消费者
    重校验（否则被移出项目的用户会一直收到旧项目的事件，调研 R2/P6）。
    """

    #: 心跳间隔（规格 §7.2：30s）。浏览器静默断线不抛 close（channels#1244），
    #: 前端 90s 没收到任何帧就主动重连 —— 这里负责"让前端有帧可数"。
    HEARTBEAT_SECONDS = 30
    #: 单次订阅上限：面板是"全部可访问项目"，正常远小于此；防异常客户端滥用。
    MAX_SUBSCRIBE = 200

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._subscriptions: set[str] = set()
        self._heartbeat_task = None

    async def reject_with(self, code: int) -> None:
        """先 accept 再 close —— 关闭码只有在 accept 之后才送得到客户端
        （ProjectConsumer.reject_with 的同款教训，见其 docstring 与 08 契约）。"""
        await self.accept()
        await self.close(code=code)

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.reject_with(CLOSE_UNAUTHENTICATED)
            return
        self.user_id = str(user.id)
        await self.channel_layer.group_add(permission_group(self.user_id), self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "payload": {"user_id": self.user_id}})
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def disconnect(self, code):
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None
        for pid in self._subscriptions:
            try:
                await self.channel_layer.group_discard(project_group(pid), self.channel_name)
            except Exception:  # 逐个清理，一个失败不影响其余
                pass
        self._subscriptions.clear()
        try:
            await self.channel_layer.group_discard(
                permission_group(self.user_id), self.channel_name
            )
        except Exception:
            pass

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            await self.send_json({"event": "error", "payload": {"detail": "消息必须是对象。"}})
            return
        msg_type = content.get("type")
        if msg_type == "ping":
            await self.send_json({"event": "pong", "payload": {}})
            return
        if msg_type == "subscribe":
            await self._handle_subscribe(content.get("project_ids") or [])
            return
        if msg_type == "unsubscribe":
            await self._handle_unsubscribe(content.get("project_ids") or [])
            return
        await self.send_json({"event": "error", "payload": {"detail": "不支持的消息类型。"}})

    async def _handle_subscribe(self, project_ids):
        """逐项校验权限 → 通过的加组；回执 subscribed/denied（规格：逐项回执）。"""
        if not isinstance(project_ids, list):
            await self.send_json(
                {"event": "error", "payload": {"detail": "project_ids 必须是数组。"}}
            )
            return
        ids = [str(x) for x in project_ids][: self.MAX_SUBSCRIBE]
        accessible = await self._accessible_ids()
        subscribed, denied = [], []
        for pid in ids:
            if pid in accessible:
                await self.channel_layer.group_add(project_group(pid), self.channel_name)
                self._subscriptions.add(pid)
                subscribed.append(pid)
            else:
                denied.append(pid)  # 防枚举：不区分"不存在"与"无权限"
        await self.send_json(
            {
                "event": "subscriptions",
                "payload": {"subscribed": subscribed, "denied": denied},
            }
        )

    async def _handle_unsubscribe(self, project_ids):
        if not isinstance(project_ids, list):
            await self.send_json(
                {"event": "error", "payload": {"detail": "project_ids 必须是数组。"}}
            )
            return
        for pid in (str(x) for x in project_ids):
            if pid in self._subscriptions:
                await self.channel_layer.group_discard(project_group(pid), self.channel_name)
                self._subscriptions.discard(pid)
        await self.send_json(
            {
                "event": "subscriptions",
                "payload": {"subscribed": sorted(self._subscriptions), "denied": []},
            }
        )

    async def project_event(self, message):
        """项目组事件 → 转发给订阅者，**注入 project_id**（前端按项目失效缓存）。"""
        if message.get("project_id") not in self._subscriptions:
            return  # 已被权限重校验移除的事件不再转发
        await self.send_json(
            {
                "event": message["event"],
                "payload": {**message["payload"], "project_id": message["project_id"]},
            }
        )

    async def membership_changed(self, message):
        """成员/角色变化 → 重查可访问集，**退出无权项目的组**（权限实时收敛）。"""
        accessible = await self._accessible_ids()
        removed = self._subscriptions - accessible
        for pid in removed:
            await self.channel_layer.group_discard(project_group(pid), self.channel_name)
        self._subscriptions -= removed
        await self.send_json(
            {
                "event": "membership.changed",
                "payload": {
                    "subscribed": sorted(self._subscriptions),
                    "removed": sorted(removed),
                },
            }
        )

    async def _heartbeat_loop(self):
        try:
            while True:
                await asyncio.sleep(self.HEARTBEAT_SECONDS)
                await self.send_json({"event": "ping", "payload": {}})
        except asyncio.CancelledError:
            pass

    @database_sync_to_async
    def _accessible_ids(self) -> set:
        from core.permissions import accessible_project_ids

        return {str(x) for x in accessible_project_ids(self.scope.get("user"))}
