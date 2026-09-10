"""统一分页器（契约 docs/api/00-conventions.md §3、04 契约「分页边界」）。

在 DRF 默认行为之上做两点收敛：
1. `page` 非整数 → 400（默认是 404，会把前端 bug 伪装成"资源不存在"）；
2. `page` 越界 → **200 + 空 results**（默认是 404）。

第 2 点的理由：列表页筛选条件变化后，页码仍停在旧值是很常见的中间状态
（"第 5 页筛完只剩 1 页"）。这时前端需要的是"结果为空 + 我知道该回退"，
而不是一个 404——404 在契约里另有含义（资源不存在/不可见，见 §4.3 防枚举）。
"""

from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination


class OutOfRangePage:
    """越界页码的替身。

    只需要实现渲染分页体时用到的那几个方法（`has_next` / `has_previous` /
    `*_page_number`）与 `paginator`：这样 `count` 仍是真实总数、
    `next` 为 `null`、`previous` 指回最后一页，前端可以据此把页码拉回来。
    """

    def __init__(self, paginator, number):
        self.paginator = paginator
        self.number = number

    def has_next(self):
        return False

    def has_previous(self):
        return self.paginator.num_pages > 0

    def previous_page_number(self):
        return self.paginator.num_pages


class StandardPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "per_page"
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        raw_page = request.query_params.get(self.page_query_param, 1)
        try:
            page_number = int(raw_page)
        except (TypeError, ValueError):
            raise ValidationError({self.page_query_param: ["页码必须是整数。"]}) from None

        try:
            return super().paginate_queryset(queryset, request, view)
        except NotFound:
            paginator = self.django_paginator_class(queryset, self.get_page_size(request))
            self.request = request
            self.page = OutOfRangePage(paginator, page_number)
            return []
