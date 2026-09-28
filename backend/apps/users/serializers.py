"""Auth 模块序列化器（请求/响应体以 docs/api/01-auth.md 为准）。

本地单机版：昵称（username）是唯一身份，密码与邮箱都是**可选**二级凭据。
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """用户公开信息（register / login / me 的响应体，绝不包含密码哈希）。

    `has_password` / `has_email` 让前端知道该账户是否需要二级验证、设置页该显示哪种状态，
    而无需回传任何敏感值。
    """

    has_password = serializers.SerializerMethodField()
    has_email = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "avatar", "created_at", "has_password", "has_email"]
        read_only_fields = fields

    def get_has_password(self, obj) -> bool:
        return obj.has_usable_password()

    def get_has_email(self, obj) -> bool:
        return bool(obj.email)


class UserLiteSerializer(serializers.ModelSerializer):
    """成员列表里内嵌的用户摘要（不含 email，避免泄露给非管理员）。"""

    class Meta:
        model = User
        fields = ["id", "username", "avatar"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """新建账户：只需昵称即可创建（密码 / 邮箱可选，留待设置里自助绑定）。

    - 不传 password → `create_user(password=None)` 生成 unusable password，账户免密直入；
    - 不传 email → 存 NULL（唯一索引对 NULL 不冲突，见 models.User 注释）。
    """

    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={"input_type": "password"}
    )
    # 显式声明字段会丢掉 ModelSerializer 自动生成的 UniqueValidator，需手动补回，
    # 否则重复邮箱会绕过校验、在 save() 时抛 IntegrityError（500 而非 400）。
    email = serializers.EmailField(
        required=False,
        allow_blank=True,
        allow_null=True,
        validators=[UniqueValidator(queryset=User.objects.all(), message="该邮箱已被使用。")],
    )

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def validate_password(self, value):
        """仅在真正设置了密码时跑 Django 全局校验器（空/未填 → 走免密账户）。"""
        if value:
            validate_password(value)
        return value

    def create(self, validated_data):
        email = validated_data.get("email") or None
        password = validated_data.get("password") or None
        # 不用 User.objects.create_user：它内部 normalize_email(None) 会把 None 变成 ''，
        # 而空串邮箱会撞唯一约束（多个未绑定账户无法共存）。直接建实例确保存 NULL。
        user = User(username=validated_data["username"], email=email)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  # 免密账户：昵称即身份
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    """登录请求体：昵称必填，密码可选。

    密码留空时，后端据账户是否已绑定密码决定"免验证直入"还是"要求二级验证"
    （见 views.login_view）。防暴力锁定仅对有密码的账户生效。
    """

    username = serializers.CharField(max_length=150, help_text="昵称")
    password = serializers.CharField(
        max_length=128,
        write_only=True,
        required=False,
        allow_blank=True,
        style={"input_type": "password"},
    )


class BindSerializer(serializers.Serializer):
    """设置页自助绑定：加/改密码、绑定/换邮箱、或移除密码（回到免密直入）。"""

    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=128,
        style={"input_type": "password"},
    )
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    remove_password = serializers.BooleanField(required=False, default=False)

    def validate_password(self, value):
        if value:
            validate_password(value)
        return value
