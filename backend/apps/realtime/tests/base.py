"""realtime 测试共用装置。

**为什么用 TransactionTestCase + async 测试方法**（Channels 官方推荐的形态）：
consumer 里的 ORM 调用经 `database_sync_to_async` 跑在线程池里，
用的是**另一个数据库连接**。TestCase 的事务对那个连接不可见（会全部变匿名用户）；
TransactionTestCase 的数据是真实提交的，线程怎么跳都能看到，也不会留下
关不掉的连接导致测试库删不掉。
"""

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from django.test import TransactionTestCase

from apps.issues import services as issue_services
from apps.projects.models import ProjectMember, ProjectRoles
from apps.projects.services import create_project
from apps.users.models import User
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles
from apps.workspaces.services import create_workspace
from core.testing import TEST_PASSWORD

CONNECT_TIMEOUT = 10  # 默认 1s 对"握手 + 两次 DB 查询"太紧张


class RealtimeScenarioMixin:
    """最小场景：owner（项目 Admin）/ member / viewer / stranger + 一条 Issue。"""

    def build_scenario(self, *, slug: str = "rt-ws", identifier: str = "RT"):
        def make_user(name):
            return User.objects.create_user(
                username=name, email=f"{name}@example.com", password=TEST_PASSWORD
            )

        self.owner = make_user("rt-owner")
        self.member = make_user("rt-member")
        self.viewer = make_user("rt-viewer")
        self.stranger = make_user("rt-stranger")

        self.workspace = create_workspace(self.owner, "Realtime Workspace", slug)
        for user, role in (
            (self.member, WorkspaceRoles.MEMBER),
            (self.viewer, WorkspaceRoles.MEMBER),
        ):
            WorkspaceMember.objects.create(workspace=self.workspace, user=user, role=role)

        self.project = create_project(
            self.workspace, self.owner, name="Realtime Project", identifier=identifier
        )
        for user, role in (
            (self.member, ProjectRoles.MEMBER),
            (self.viewer, ProjectRoles.VIEWER),
        ):
            ProjectMember.objects.create(project=self.project, user=user, role=role)

        self.issue = issue_services.create_issue(self.project, self.owner, title="实时用例")


class RealtimeTestCase(RealtimeScenarioMixin, TransactionTestCase):
    def setUp(self):
        # TransactionTestCase 不支持 setUpTestData（用例间会清库），场景逐用例重建
        self.build_scenario()


def ws_communicator_as(user, *, workspace_slug: str, project_id):
    """把用户**直接注入 scope** 的通信器（绕过会话链路，聚焦消费者逻辑）。"""
    from config.asgi import application

    communicator = WebsocketCommunicator(
        application, f"/ws/workspaces/{workspace_slug}/projects/{project_id}/"
    )
    communicator.scope["user"] = user
    return communicator


async def ws_communicator_with_session(user, workspace_slug: str, project_id):
    """走**真实 Cookie → Session → User** 链路的通信器（鉴权链路测试用）。

    手工造会话必须写入与 `django.contrib.auth.login()` 相同的三元组：
    `SESSION_KEY` / `BACKEND_SESSION_KEY` / `HASH_SESSION_KEY` ——
    channels 的 `get_user` 三者缺一不可（缺了就当匿名用户，实测 4401）。
    """
    from config.asgi import application

    def _create_session() -> str:
        session = SessionStore()
        session[SESSION_KEY] = str(user.pk)
        session[BACKEND_SESSION_KEY] = settings.AUTHENTICATION_BACKENDS[0]
        session[HASH_SESSION_KEY] = user.get_session_auth_hash()
        session.create()
        return session.session_key

    session_key = await sync_to_async(_create_session)()  # TransactionTestCase：数据已提交
    headers = [(b"cookie", f"sessionid={session_key}".encode("ascii"))]
    return WebsocketCommunicator(
        application,
        f"/ws/workspaces/{workspace_slug}/projects/{project_id}/",
        headers=headers,
    )
