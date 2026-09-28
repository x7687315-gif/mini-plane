"""用户模型（Sprint 1，契约 docs/api/01-auth.md）。"""

from django.contrib.auth.models import AbstractUser
from django.db import models

from core.models import BaseModel


class User(AbstractUser, BaseModel):
    """Mini Plane 用户。

    - 主键 UUID 继承自 BaseModel（BACKEND_PLAN 决策 D1）；
    - **本地单机版**：账户以"昵称"（username）为唯一身份，密码与邮箱都是**可选**的二级凭据，
      由用户在"设置"里自助绑定；未绑密码时 `AbstractUser` 存的是 unusable password
      （`set_unusable_password`），登录走免验证直入。
    - email 可空且唯一：`null=True` 是关键 —— 唯一索引对多个 NULL 不冲突，
      而空串 `""` 会互相撞唯一约束（本地应用大量"未绑定邮箱"的账户必须能共存）。
    - AbstractUser 自带的 date_joined 保留在库中，业务响应统一暴露 created_at。
    """

    email = models.EmailField("电子邮件地址", unique=True, null=True, blank=True)
    # noqa: DJ001 —— 保留 null 以区分"未设置头像"与空串；二期接文件上传时改为 ImageField
    avatar = models.URLField("头像 URL", blank=True, null=True)  # noqa: DJ001

    class Meta(AbstractUser.Meta):
        pass
