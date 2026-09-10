"""项目频道的 WebSocket 消费者（契约 docs/api/08-realtime.md）。

URL：`/ws/workspaces/{workspace_slug}/projects/{project_id}/`

权限：**握手阶段**就复用「生效角色」的统一实现——
非工作区成员、或项目不可见，一律 `close(4404)`，
不会出现"连上了却什么都收不到"的隐性失败（计划 §Sprint 7 验收点）。

消息协议：客户端**只能**发 `{"type": "ping"}`（心跳）；其它输入回 error 帧。
服务端推 `{"event": ..., "payload": ...}` 两类帧：`connected` 握手确认 / 业务事件。
"""

import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.realtime.broadcast import project_group

logger = logging.getLogger(__name__)

#: 自定义关闭码：4404 = 资源不存在或不可见（对齐 HTTP 侧的防枚举语义）
CLOSE_NOT_FOUND = 4404
#: 自定义关闭码：4401 = 未登录（对齐 HTTP 的 401）
CLOSE_UNAUTHENTICATED = 4401


class ProjectConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        kwargs = self.scope["url_route"]["kwargs"]
        workspace_slug = kwargs["workspace_slug"]
        # uuid 路径转换器给的是 UUID 对象；后面要进 JSON 帧，统一转成字符串
        project_id = str(kwargs["project_id"])

        role = await self._effective_role(workspace_slug, project_id)
        if role is None:
            await self.close(code=CLOSE_NOT_FOUND)
            return

        self.group_name = project_group(project_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json(
            {"event": "connected", "payload": {"project_id": project_id, "role": role}}
        )

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

        刻意只取 `id` 和 `workspace_id` 两列：这是 WebSocket 的**高频握手**，
        不需要把整行（含 description）读出来。
        """
        from apps.projects.models import Project
        from core.permissions import get_effective_project_role_by_ids

        project = (
            Project.objects.filter(id=project_id, workspace__slug=workspace_slug)
            .only("id", "workspace_id")
            .first()
        )
        if project is None:
            return None
        return get_effective_project_role_by_ids(
            self.scope["user"], workspace_id=project.workspace_id, project_id=project.id
        )
