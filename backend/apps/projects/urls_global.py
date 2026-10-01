"""Project 顶层（跨工作区）路由，挂在 /api/v1/projects/ 之下。

工作区作用域内的项目子路由仍由 apps.workspaces.urls → apps.projects.urls 提供
（workspaces/<slug>/projects/…）；这里只放不属于单个工作区上下文的聚合查询，
如 Sprint 09「我的工程」首页摘要。
"""

from django.urls import path

from apps.projects import views

urlpatterns = [
    path("mine/", views.my_projects_summary, name="projects-mine"),
]
