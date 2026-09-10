"""Issue 列表的查询参数处理（契约 docs/api/04-issues.md「列表（查询引擎）」章节）。

本模块只回答一件事：**查询参数 → ORM**。
- 通用原语（CSV 解析、白名单排序）在 core/filtering.py；
- 这里的 `apply_issue_filters` 把每个参数映射到具体字段，非法值抛 400。
"""

import uuid

from django.db.models import Case, IntegerField, OrderBy, Q, When
from rest_framework.exceptions import ValidationError

from apps.issues.models import IssuePriorities
from core.filtering import apply_ordering, parse_csv_values, parse_uuid_list

# 严重度排名：数字越小越紧急
_SEVERITY_RANK = {"urgent": 1, "high": 2, "medium": 3, "low": 4, "none": 5}

# priority 是字符串枚举，直接 order_by("priority") 得到的是**字母序**
# （high / low / medium / none / urgent），没有任何产品含义。
# 用 CASE 表达式把它翻成严重度再排——代价是这条排序用不上 (project, priority) 索引，
# 见 Sprint 5 devlog 的索引验证结论。
PRIORITY_SEVERITY = Case(
    *[When(priority=value, then=rank) for value, rank in _SEVERITY_RANK.items()],
    default=99,
    output_field=IntegerField(),
)

# 排序白名单：值是 order_by 的键序列。末位 sequence_id 是**稳定排序的次级键**
# —— created_at 受系统时钟粒度限制会并列，没有唯一键时翻页会重复/漏记录。
ORDERING_WHITELIST = {
    "-created_at": ("-created_at", "-sequence_id"),
    "created_at": ("created_at", "sequence_id"),
    "-sequence_id": ("-sequence_id",),
    "sequence_id": ("sequence_id",),
    "-priority": (OrderBy(PRIORITY_SEVERITY, descending=True), "-created_at", "-sequence_id"),
    "priority": (OrderBy(PRIORITY_SEVERITY), "-created_at", "-sequence_id"),
}

DEFAULT_ORDERING = ("-created_at", "-sequence_id")


def apply_issue_ordering(queryset, raw_ordering: str | None):
    """按 `ordering` 查询参数排序（缺省 ``-created_at``）。"""
    return apply_ordering(
        queryset, raw_ordering, whitelist=ORDERING_WHITELIST, default=DEFAULT_ORDERING
    )


def apply_issue_filters(queryset, params, *, user):
    """把列表查询参数翻译成 ORM 过滤；各参数之间是 AND。"""
    queryset = _filter_by_state(queryset, params.get("state"))
    queryset = _filter_by_priority(queryset, params.get("priority"))
    queryset = _filter_by_assignee(queryset, params.get("assignee"), user=user)
    queryset = _filter_by_labels(queryset, params.get("labels"))
    return _search(queryset, params.get("search"))


def _filter_by_state(queryset, raw):
    """state 多值：OR。不校验归属——传入别的项目的状态 id 只会命中空集。"""
    state_ids = parse_uuid_list(raw, param="state")
    return queryset.filter(state_id__in=state_ids) if state_ids else queryset


def _filter_by_priority(queryset, raw):
    """priority 多值：OR。枚举是封闭集合，拼错要 400 而不是静默空结果。"""
    values = parse_csv_values(raw)
    if not values:
        return queryset
    invalid = [value for value in values if value not in IssuePriorities.values]
    if invalid:
        raise ValidationError({"priority": [f"不支持的优先级：{', '.join(invalid)}。"]})
    return queryset.filter(priority__in=values)


def _filter_by_assignee(queryset, raw, *, user):
    """assignee 支持 `me` 或用户 id；指向不存在的人只会命中空集。"""
    value = (raw or "").strip()
    if not value:
        return queryset
    if value == "me":
        return queryset.filter(assignee=user)
    try:
        assignee_id = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise ValidationError({"assignee": ["assignee 参数必须是 UUID 或 me。"]}) from None
    return queryset.filter(assignee_id=assignee_id)


def _filter_by_labels(queryset, raw):
    """labels 多值：**OR（并集）**，本 Sprint 冻结的语义（见 04 契约）。

    M2M 连接会让"一个 Issue 命中两个标签"产生两行，必须 distinct()，
    否则分页的 count 与页内条数都会虚高。
    """
    label_ids = parse_uuid_list(raw, param="labels")
    if not label_ids:
        return queryset
    return queryset.filter(labels__id__in=label_ids).distinct()


def _search(queryset, raw):
    """title / description 模糊包含；纯空白视为未传。"""
    keyword = (raw or "").strip()
    if not keyword:
        return queryset
    return queryset.filter(Q(title__icontains=keyword) | Q(description__icontains=keyword))
