"""跨 app 的通用模型设施。"""

import uuid

from django.db import models


class BaseModel(models.Model):
    """业务模型抽象基类：UUID 主键 + 时间戳（BACKEND_PLAN 决策 D1/D8）。

    约定：
    - 所有业务模型必须继承本类，主键不可枚举、可直接用于 URL；
    - created_at 用 auto_now_add（写入即定），updated_at 用 auto_now（每次保存刷新）。
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
