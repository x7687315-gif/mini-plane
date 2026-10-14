"""WebSocket 路由（挂到 config/asgi.py 的 ProtocolTypeRouter）。"""

from django.urls import path

from apps.realtime.consumers import OverviewConsumer, ProjectConsumer

websocket_urlpatterns = [
    # Island V2 阶段 4：跨项目总览（一条连接覆盖全部可访问项目，规格 §7.2）
    path(
        "ws/engineering/overview/",
        OverviewConsumer.as_asgi(),
    ),
    path(
        "ws/workspaces/<slug:workspace_slug>/projects/<uuid:project_id>/",
        ProjectConsumer.as_asgi(),
    ),
]
