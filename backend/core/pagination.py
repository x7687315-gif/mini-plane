"""统一分页器（契约 docs/api/00-conventions.md §3）。"""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "per_page"
    max_page_size = 100
