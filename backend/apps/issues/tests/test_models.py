"""模型层：约束、on_delete 语义、默认预置状态（04 契约 / BACKEND_PLAN §3.2）。"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import RestrictedError
from django.test import TestCase

from apps.issues import services
from apps.issues.models import Issue, Label, State
from apps.issues.tests.base import DEFAULT_PASSWORD, IssueScenarioMixin
from apps.projects.models import ProjectMember, ProjectRoles
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles

User = get_user_model()


class IssueModelTests(IssueScenarioMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.build_scenario(slug="model-ws", identifier="MDL")

    def test_default_states_are_five_and_ordered(self):
        states = list(State.objects.filter(project=self.project).values_list("name", "group"))
        self.assertEqual(
            states,
            [
                ("Backlog", "backlog"),
                ("Todo", "unstarted"),
                ("In Progress", "started"),
                ("Done", "completed"),
                ("Cancelled", "cancelled"),
            ],
        )

    def test_sequence_id_unique_per_project(self):
        services.create_issue(self.project, self.owner, title="a")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Issue.objects.create(
                project=self.project,
                sequence_id=1,
                title="duplicate",
                state=services.get_default_state(self.project),
                created_by=self.owner,
            )

    def test_sequence_id_may_repeat_across_projects(self):
        """sequence_id 只在项目内唯一，跨项目互不干扰。"""
        services.create_issue(self.project, self.owner, title="a")
        other = services.create_issue(self.other_project, self.owner, title="b")
        self.assertEqual(other.sequence_id, 1)

    def test_default_ordering_is_newest_sequence_first(self):
        services.create_issue(self.project, self.owner, title="a")
        services.create_issue(self.project, self.owner, title="b")
        seqs = list(
            Issue.objects.filter(project=self.project).values_list("sequence_id", flat=True)
        )
        self.assertEqual(seqs, [2, 1])

    def test_state_delete_blocked_while_issues_reference_it(self):
        """决策 D7：State 用 RESTRICT，防止误删仍有 Issue 的状态。"""
        issue = services.create_issue(self.project, self.owner, title="x")
        with self.assertRaises(RestrictedError):
            issue.state.delete()
        self.assertTrue(State.objects.filter(pk=issue.state_id).exists())

    def test_state_delete_allowed_when_no_issue_references_it(self):
        state = State.objects.filter(project=self.other_project, name="Cancelled").first()
        state.delete()
        self.assertFalse(State.objects.filter(pk=state.pk).exists())

    def test_project_delete_cascades_issues_despite_state_restrict(self):
        """RESTRICT 的例外：Issue 与 State 在同一次级联删除中被收集时允许放行。"""
        services.create_issue(self.project, self.owner, title="x")
        project_id = self.project.id
        self.project.delete()
        self.assertFalse(Issue.objects.filter(project_id=project_id).exists())
        self.assertFalse(State.objects.filter(project_id=project_id).exists())

    def test_assignee_set_null_when_user_deleted(self):
        """assignee 用 SET_NULL：删账号只解除指派，不删 Issue。"""
        assignee = User.objects.create_user(
            username="temp", email="temp@example.com", password=DEFAULT_PASSWORD
        )
        WorkspaceMember.objects.create(
            workspace=self.workspace, user=assignee, role=WorkspaceRoles.MEMBER
        )
        ProjectMember.objects.create(project=self.project, user=assignee, role=ProjectRoles.MEMBER)
        issue = services.create_issue(self.project, self.owner, title="x", assignee=assignee)

        assignee.delete()

        issue.refresh_from_db()
        self.assertIsNone(issue.assignee)
        self.assertTrue(Issue.objects.filter(pk=issue.pk).exists())

    def test_delete_label_keeps_issue(self):
        """04 契约：删标签不影响已引用它的 Issue（M2M 通过表自动清理）。"""
        label = services.create_label(self.project, name="bug")
        issue = services.create_issue(self.project, self.owner, title="x", labels=[label])

        label.delete()

        issue.refresh_from_db()
        self.assertEqual(issue.labels.count(), 0)
        self.assertTrue(Issue.objects.filter(pk=issue.pk).exists())


class LabelModelTests(IssueScenarioMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.build_scenario(slug="label-ws", identifier="LBL")

    def test_label_name_unique_per_project(self):
        services.create_label(self.project, name="bug")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Label.objects.create(project=self.project, name="bug")

    def test_label_name_may_repeat_across_projects(self):
        services.create_label(self.project, name="bug")
        label = services.create_label(self.other_project, name="bug")
        self.assertEqual(label.name, "bug")
