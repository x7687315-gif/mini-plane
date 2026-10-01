"""Worklog 子路由：挂在项目作用域下（.../projects/<pid>/worklogs/…）。"""

from django.urls import path

from apps.worklogs import views

urlpatterns = [
    path("<uuid:project_id>/worklogs/", views.worklog_list_create, name="worklog-list"),
    path(
        "<uuid:project_id>/worklogs/<uuid:worklog_id>/",
        views.worklog_detail,
        name="worklog-detail",
    ),
]
