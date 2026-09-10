"""查询参数解析与排序的通用原语（BACKEND_PLAN §Sprint 5）。

放在 core/ 的理由：这两个能力与具体业务无关，任何列表接口都能复用；
Issue 域"哪个参数对应哪个字段"的语义留在 apps/issues/filters.py。

为什么手写而不用 django-filter：本项目的接口是函数视图（FBV），
django-filter 的 FilterBackend 只挂在 generic view / ViewSet 上；
同时手写能把"查询参数 → ORM"这条链路完整暴露出来（学习目的）。
django-filter 留作对比阅读，见 Sprint 5 devlog。
"""

import uuid

from rest_framework.exceptions import ValidationError


def parse_csv_values(raw: str | None) -> list[str]:
    """把 `a,b , c` 解析成 ``["a", "b", "c"]``；空串/None → ``[]``。

    逗号两侧空白会被裁掉（前端拼 URL 时容易带上空格）。
    """
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def parse_uuid_list(raw: str | None, *, param: str) -> list[uuid.UUID]:
    """解析逗号分隔的 UUID 列表；任一段不是 UUID → 400（不静默丢弃）。"""
    parsed = []
    for value in parse_csv_values(raw):
        try:
            parsed.append(uuid.UUID(value))
        except (ValueError, AttributeError, TypeError):
            raise ValidationError({param: [f"{param} 参数必须是逗号分隔的 UUID。"]}) from None
    return parsed


def apply_ordering(
    queryset,
    raw_ordering: str | None,
    *,
    whitelist: dict,
    default: tuple,
    param: str = "ordering",
):
    """按白名单把 ``ordering`` 参数翻译成 ``order_by(...)``。

    `whitelist` 的取值是 **order_by 键的元组**，因此可以塞两类东西：
    - 多个键：用于稳定排序的次级键（如 ``("-created_at", "-sequence_id")``）；
    - 表达式：如按严重度排序用的 ``Case/When`` 或 ``OrderBy(...)``。

    白名单之外的值一律 400 —— 直接把它当 order_by 用会变成注入面与全表排序的性能陷阱。
    """
    if not raw_ordering:
        return queryset.order_by(*default)

    requested = parse_csv_values(raw_ordering)
    if not requested:
        return queryset.order_by(*default)

    invalid = [value for value in requested if value not in whitelist]
    if invalid:
        raise ValidationError({param: [f"不支持的排序字段：{', '.join(invalid)}。"]})

    order_by = []
    for value in requested:
        order_by.extend(whitelist[value])
    return queryset.order_by(*order_by)
