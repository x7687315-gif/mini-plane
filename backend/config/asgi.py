"""ASGI 入口（Sprint 7）：HTTP 走 Django，WebSocket 走 Channels。

**导入顺序是刻意的**：必须先 `get_asgi_application()` 让 Django 完成初始化，
之后才能 import 消费者（否则 ORM 还没就绪，模型查询会炸）。
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from apps.realtime.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        # 普通 HTTP（含 API）继续走 Django 的 ASGI 处理器
        "http": django_asgi_app,
        # WebSocket：Session 鉴权 → 按路由分发到项目频道消费者
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
