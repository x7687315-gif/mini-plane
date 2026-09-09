"""Auth 模块序列化器（请求/响应体以 docs/api/01-auth.md 为准）。"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """用户公开信息（register / login / me 的响应体，绝不包含密码）。"""

    class Meta:
        model = User
        fields = ["id", "username", "email", "avatar", "created_at"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """注册请求体；username/email 的唯一性校验由 ModelSerializer 自动生成。"""

    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["username", "email", "password"]

    def validate_password(self, value):
        """复用 Django 全局密码校验器（最小长度/常见密码/纯数字/相似性）。"""
        validate_password(value)
        return value

    def create(self, validated_data):
        # create_user 负责密码哈希；禁止用 objects.create 直存明文/自造哈希
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    """登录请求体。失败文案统一为"用户名或密码错误"，防用户名探测。"""

    username = serializers.CharField(help_text="用户名")
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
