"""WebSocket 路由（挂到 config/asgi.py 的 ProtocolTypeRouter）。"""

from django.urls import path

from apps.realtime.consumers import ProjectConsumer

websocket_urlpatterns = [
    path(
        "ws/workspaces/<slug:workspace_slug>/projects/<uuid:project_id>/",
        ProjectConsumer.as_asgi(),
    ),
]
