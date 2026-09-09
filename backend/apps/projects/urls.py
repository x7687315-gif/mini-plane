"""Project 接口子路由：挂在 /api/v1/workspaces/<slug>/projects/ 之下。"""

from django.urls import path

from apps.projects import views

urlpatterns = [
    path("", views.project_list_create),
    path("<uuid:project_id>/", views.project_detail),
    path("<uuid:project_id>/members/", views.project_member_list_create),
    path("<uuid:project_id>/members/<uuid:member_id>/", views.project_member_detail),
    path("<uuid:project_id>/states/", views.state_list),
]
