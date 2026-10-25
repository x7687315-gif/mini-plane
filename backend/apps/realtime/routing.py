"""WebSocket 路由（挂到 config/asgi.py 的 ProtocolTypeRouter）。"""

from django.urls import path

from apps.realtime.consumers import OverviewConsumer, ProjectConsumer

websocket_urlpatterns = [
    # Island V2 阶段 4：跨项目总览（一条连接覆盖全部可访问项目，规格 §7.2）
    path(
        "ws/engineering/overview/",
        OverviewConsumer.as_asgi(),
    ),
    # 规范路径（Phase 5）：只凭 pid——私人工程（ADR-001）的唯一项目通道
    path(
        "ws/projects/<uuid:project_id>/",
        ProjectConsumer.as_asgi(),
    ),
    # 兼容路径：含 workspace slug（团队工程既有客户端，deprecated）
    # str 转换器：遗留库可能存在非 ASCII slug（Django slug 转换器会整棵 404）
    path(
        "ws/workspaces/<str:workspace_slug>/projects/<uuid:project_id>/",
        ProjectConsumer.as_asgi(),
    ),
]
