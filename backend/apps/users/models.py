"""用户模型（Sprint 1，契约 docs/api/01-auth.md）。"""

from django.contrib.auth.models import AbstractUser
from django.db import models

from core.models import BaseModel


class User(AbstractUser, BaseModel):
    """Mini Plane 用户。

    - 主键 UUID 继承自 BaseModel（BACKEND_PLAN 决策 D1）；
    - email 唯一：二期通知的收件人，也是将来的登录备选凭据；
    - AbstractUser 自带的 date_joined 保留在库中，业务响应统一暴露 created_at。
    """

    email = models.EmailField("电子邮件地址", unique=True)
    # noqa: DJ001 —— 保留 null 以区分"未设置头像"与空串；二期接文件上传时改为 ImageField
    avatar = models.URLField("头像 URL", blank=True, null=True)  # noqa: DJ001

    class Meta(AbstractUser.Meta):
        pass
