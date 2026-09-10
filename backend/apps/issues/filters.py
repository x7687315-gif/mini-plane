"""Issue 列表的查询参数处理（Sprint 3 只做 ordering；Sprint 5 扩展为完整 FilterBackend）。

放在 app 内而非 core/ 的原因：这是 Issue 域特有的查询语义；
Sprint 5 若需要被多模块复用，再整体上移到 core/。
"""

from rest_framework.exceptions import ValidationError

# 排序白名单（04 契约）：必须是白名单，否则 order_by 会变成注入/全表排序的性能陷阱
ORDERING_WHITELIST = frozenset(
    {
        "sequence_id",
        "-sequence_id",
        "created_at",
        "-created_at",
        "priority",
        "-priority",
    }
)

DEFAULT_ORDERING = "-sequence_id"  # 新的在前（04 契约）


def apply_ordering(queryset, raw_ordering: str | None):
    """按 `ordering` 查询参数排序；缺省/空值走默认排序，非法值 400。"""
    if not raw_ordering:
        return queryset.order_by(DEFAULT_ORDERING)

    fields = [field.strip() for field in raw_ordering.split(",") if field.strip()]
    if not fields:
        return queryset.order_by(DEFAULT_ORDERING)

    invalid = [field for field in fields if field not in ORDERING_WHITELIST]
    if invalid:
        raise ValidationError({"ordering": [f"不支持的排序字段：{', '.join(invalid)}。"]})
    return queryset.order_by(*fields)
