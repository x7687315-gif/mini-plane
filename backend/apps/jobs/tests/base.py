"""jobs 测试共用装置（自包含，不跨 app 复用别的测试模块）。"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.issues import services as issue_services
from apps.projects.models import ProjectMember, ProjectRoles
from apps.projects.services import create_project
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from apps.workspaces.services import create_workspace
from core.testing import TEST_PASSWORD

User = get_user_model()


class JobScenarioMixin:
    """最小场景：owner（项目 Admin）/ member / viewer / stranger + 一条 Issue。"""

    @classmethod
    def build_scenario(cls, *, slug: str = "jobs-ws", identifier: str = "JOB"):
        def make_user(name):
            return User.objects.create_user(
                username=name, email=f"{name}@example.com", password=TEST_PASSWORD
            )

        cls.owner = make_user("job-owner")
        cls.member = make_user("job-member")
        cls.viewer = make_user("job-viewer")
        cls.stranger = make_user("job-stranger")

        cls.workspace = create_workspace(cls.owner, "Jobs Workspace", slug)
        for user, role in (
            (cls.member, WorkspaceRoles.MEMBER),
            (cls.viewer, WorkspaceRoles.MEMBER),
        ):
            WorkspaceMember.objects.create(workspace=cls.workspace, user=user, role=role)

        cls.project = create_project(
            cls.workspace, cls.owner, name="Jobs Project", identifier=identifier
        )
        for user, role in (
            (cls.member, ProjectRoles.MEMBER),
            (cls.viewer, ProjectRoles.VIEWER),
        ):
            ProjectMember.objects.create(project=cls.project, user=user, role=role)

        cls.bug_label = issue_services.create_label(cls.project, name="bug")
        cls.perf_label = issue_services.create_label(cls.project, name="perf")


class JobAPITestCase(JobScenarioMixin, APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.build_scenario()

    @property
    def project_root(self) -> str:
        return f"/api/v1/workspaces/{self.workspace.slug}/projects/{self.project.id}"

    @property
    def bulk_url(self) -> str:
        return f"{self.project_root}/issues/bulk/labels/"

    def task_url(self, run) -> str:
        return f"{self.project_root}/tasks/{run.id}/"
