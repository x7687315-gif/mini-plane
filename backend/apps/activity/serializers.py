"""活动日志序列化器（契约 docs/api/06-activities.md）。只读，无写入序列化器。"""

from rest_framework import serializers

from apps.activity.models import ActivityLog
from apps.users.serializers import UserLiteSerializer


class ActivityLogSerializer(serializers.ModelSerializer):
    """一条留痕的展示形态。

    `old_value` / `new_value` 里的值在写入时已翻译成可直接展示的形态
    （见 activity.services.capture_issue_snapshot），前端拼句子即可。
    """

    actor = UserLiteSerializer(read_only=True)

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "actor",
            "entity_type",
            "entity_id",
            "issue",
            "action",
            "old_value",
            "new_value",
            "created_at",
        ]
        read_only_fields = fields
