"""Worklog 序列化器（Sprint 11）。"""

from rest_framework import serializers

from apps.projects.models import ProjectStage
from apps.users.serializers import UserLiteSerializer
from apps.worklogs.models import Worklog, WorklogSource


class WorklogSerializer(serializers.ModelSerializer):
    """只读响应体：含作者摘要与所属阶段名（供前端直接渲染）。"""

    author = UserLiteSerializer(read_only=True)
    stage_name = serializers.CharField(source="stage.name", read_only=True, allow_null=True)

    class Meta:
        model = Worklog
        fields = [
            "id",
            "project",
            "stage",
            "stage_name",
            "author",
            "date",
            "title",
            "summary",
            "details",
            "conclusion",
            "next_step",
            "blocker",
            "source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class WorklogWriteSerializer(serializers.Serializer):
    """新建 / 修改请求体。date 缺省为今天；stage_id 必须属于同一项目（视图校验）。"""

    title = serializers.CharField(max_length=120)
    summary = serializers.CharField()
    date = serializers.DateField(required=False)
    details = serializers.CharField(required=False, allow_blank=True)
    conclusion = serializers.CharField(required=False, allow_blank=True)
    next_step = serializers.CharField(required=False, allow_blank=True)
    blocker = serializers.CharField(required=False, allow_blank=True)
    stage_id = serializers.UUIDField(required=False, allow_null=True)
    source = serializers.ChoiceField(
        choices=WorklogSource.choices, required=False, default=WorklogSource.MANUAL
    )

    def validate_stage_id(self, value):
        """stage 必须存在；跨项目归属由视图用 plan__project 二次校验（404 防越权）。"""
        if value is not None and not ProjectStage.objects.filter(id=value).exists():
            raise serializers.ValidationError("阶段不存在。")
        return value
