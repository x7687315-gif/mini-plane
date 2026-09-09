"""自动化测试配置：python manage.py test --settings=config.settings.test"""

from .base import *  # noqa: F403

DEBUG = False

# 测试提速：MD5 哈希只允许出现在测试配置里，生产严禁
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
