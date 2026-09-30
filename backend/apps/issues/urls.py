"""Issue 顶层路由（跨项目聚合类接口），挂在 /api/v1/issues/ 之下。

项目作用域内的 Issue 子路由仍由 apps.projects.urls 提供
（workspaces/<slug>/projects/<pid>/issues/）；这里只放不属于单个项目的聚合查询，
如「我的工作」。
"""

from django.urls import path

from apps.issues import views

urlpatterns = [
    path("mine/", views.my_issues, name="issues-mine"),
]
