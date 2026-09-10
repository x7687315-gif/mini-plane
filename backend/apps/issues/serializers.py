"""Issue / Label / Comment 序列化器（契约 docs/api/04-issues.md、05-comments.md）。

分工（BACKEND_PLAN §4.3 第 2 条）：
- 本文件负责**字段级跨作用域校验**（state/assignee/labels 是否真属于这个项目），
  校验失败自动产出契约里的字段级 400 错误体；
- 视图负责角色门槛；services 负责事务与发号。
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.issues.models import Comment, Issue, IssuePriorities, Label, State
from apps.projects.models import ProjectMember
from apps.projects.serializers import StateSerializer
from apps.users.serializers import UserLiteSerializer

User = get_user_model()


class LabelSerializer(serializers.ModelSerializer):
    """标签只读响应体（同时内嵌在 Issue.labels 里）。"""

    class Meta:
        model = Label
        fields = ["id", "name", "color", "created_at"]
        read_only_fields = fields


class LabelWriteSerializer(serializers.ModelSerializer):
    """标签创建 / 更新请求体；项目内 name 唯一由 service 显式校验。"""

    class Meta:
        model = Label
        fields = ["name", "color"]
        extra_kwargs = {"color": {"required": False}}


class IssueSerializer(serializers.ModelSerializer):
    """Issue 只读响应体。调用方需 select_related(state/assignee/created_by) + prefetch(labels)。"""

    state = StateSerializer(read_only=True)
    assignee = UserLiteSerializer(read_only=True)
    created_by = UserLiteSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "sequence_id",
            "project",
            "title",
            "description",
            "priority",
            "state",
            "assignee",
            "created_by",
            "labels",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class IssueWriteSerializer(serializers.Serializer):
    """Issue 创建 / 部分更新请求体。

    产出约定：`*_id` 入参在校验后会被**替换**成对应的模型实例
    （`state_id` → `state`、`assignee_id` → `assignee`、`label_ids` → `labels`），
    视图可以直接 `services.create_issue(project, user, **serializer.validated_data)`。

    只读字段（sequence_id / created_by / project）不在此列，客户端传入即被忽略。
    """

    title = serializers.CharField(max_length=255, help_text="标题，必填")
    description = serializers.CharField(
        required=False, allow_blank=True, default="", help_text="描述，可省略"
    )
    priority = serializers.ChoiceField(
        choices=IssuePriorities.choices,
        required=False,
        default=IssuePriorities.NONE,
        help_text="优先级：none/urgent/high/medium/low",
    )
    state_id = serializers.UUIDField(
        required=False, help_text="状态 id；省略则创建时取项目 Backlog"
    )
    assignee_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="被指派人 id；必须是该项目成员，null 表示清空",
    )
    label_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
        help_text="标签 id 列表；空数组表示清空标签",
    )

    def validate(self, attrs):
        project = self.context["project"]

        if "state_id" in attrs:
            state = State.objects.filter(id=attrs.pop("state_id"), project=project).first()
            if state is None:
                raise serializers.ValidationError({"state": ["所选状态不属于该项目。"]})
            attrs["state"] = state

        if "assignee_id" in attrs:
            assignee_id = attrs.pop("assignee_id")
            if assignee_id is None:
                attrs["assignee"] = None
            else:
                user = User.objects.filter(id=assignee_id).first()
                if user is None:
                    raise serializers.ValidationError({"assignee": ["所选用户不存在。"]})
                # 04 契约：必须是 ProjectMember（只有 WS Admin 身份但未加入项目的人不可被指派）
                if not ProjectMember.objects.filter(project=project, user=user).exists():
                    raise serializers.ValidationError({"assignee": ["所选用户不是该项目成员。"]})
                attrs["assignee"] = user

        if "label_ids" in attrs:
            unique_ids = set(attrs.pop("label_ids"))
            labels = list(Label.objects.filter(project=project, id__in=unique_ids))
            if len(labels) != len(unique_ids):
                raise serializers.ValidationError({"labels": ["所选标签不属于该项目。"]})
            attrs["labels"] = labels

        return attrs


class CommentSerializer(serializers.ModelSerializer):
    """评论只读响应体（05 契约）；author 复用成员摘要，不含 email。"""

    author = UserLiteSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "issue", "author", "content", "created_at", "updated_at"]
        read_only_fields = fields


class CommentWriteSerializer(serializers.ModelSerializer):
    """评论创建 / 更新请求体；content 非空（纯空白也会被 CharField 裁掉后判空）。"""

    class Meta:
        model = Comment
        fields = ["content"]


class IssueBulkLabelsSerializer(serializers.Serializer):
    """批量改标签请求体（Sprint 6，**覆盖式**：把选中 Issue 的标签整体替换）。

    只做跨作用域校验；真正的执行在异步任务里（apps/jobs/tasks.py），
    所以这里刻意不碰数据库写入。
    """

    issue_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, help_text="要批量修改的 Issue id 列表"
    )
    label_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
        help_text="目标标签 id 列表；空数组表示清空这些 Issue 的标签",
    )

    def validate(self, attrs):
        project = self.context["project"]
        unique_issues = set(attrs["issue_ids"])
        unique_labels = set(attrs["label_ids"])

        found_issues = Issue.objects.filter(project=project, id__in=unique_issues).count()
        if found_issues != len(unique_issues):
            raise serializers.ValidationError({"issue_ids": ["所选 Issue 不属于该项目。"]})

        found_labels = Label.objects.filter(project=project, id__in=unique_labels).count()
        if found_labels != len(unique_labels):
            raise serializers.ValidationError({"label_ids": ["所选标签不属于该项目。"]})

        attrs["issue_ids"] = sorted(unique_issues, key=str)
        attrs["label_ids"] = sorted(unique_labels, key=str)
        return attrs
