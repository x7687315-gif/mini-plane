"""任务状态的序列化器（契约 docs/api/07-cache-and-tasks.md）。只读。"""

from rest_framework import serializers

from apps.jobs.models import TaskRun
from apps.users.serializers import UserLiteSerializer


class TaskRunSerializer(serializers.ModelSerializer):
    actor = UserLiteSerializer(read_only=True)

    class Meta:
        model = TaskRun
        fields = [
            "id",
            "kind",
            "status",
            "params",
            "result",
            "error",
            "actor",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
