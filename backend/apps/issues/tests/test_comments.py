"""Comment API 行为与权限测试（契约 docs/api/05-comments.md）。"""

from apps.issues import services
from apps.issues.models import Comment
from apps.issues.tests.base import IssueAPITestCase


class CommentCRUDTests(IssueAPITestCase):
    def setUp(self):
        self.issue = services.create_issue(self.project, self.owner, title="评论用例")

    def test_create_by_member_201(self):
        self.auth(self.project_member)
        resp = self.client.post(self.comments_url(self.issue), {"content": "我看看"}, format="json")

        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["content"], "我看看")
        self.assertEqual(body["author"]["username"], "pm")
        self.assertEqual(body["issue"], str(self.issue.id))
        self.assertNotIn("email", body["author"])

    def test_create_strips_whitespace(self):
        self.auth(self.owner)
        resp = self.client.post(
            self.comments_url(self.issue), {"content": "  两端有空格  "}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["content"], "两端有空格")

    def test_create_missing_content_400(self):
        self.auth(self.owner)
        resp = self.client.post(self.comments_url(self.issue), {}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["content"], ["该字段是必填项。"])

    def test_create_blank_content_400(self):
        """空串与纯空白都是「字段不能为空」（DRF 会先裁掉两端空白再判空）。"""
        self.auth(self.owner)
        for payload in ({"content": ""}, {"content": "   "}):
            with self.subTest(payload=payload):
                resp = self.client.post(self.comments_url(self.issue), payload, format="json")
                self.assertEqual(resp.status_code, 400)
                self.assertEqual(resp.json()["content"], ["该字段不能为空。"])

    def test_create_by_viewer_403(self):
        self.auth(self.project_viewer)
        resp = self.client.post(self.comments_url(self.issue), {"content": "x"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_create_by_outsider_404(self):
        self.auth(self.outsider)
        resp = self.client.post(self.comments_url(self.issue), {"content": "x"}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_unauthenticated_401(self):
        resp = self.client.get(self.comments_url(self.issue))
        self.assertEqual(resp.status_code, 401)

    def test_list_is_ascending_by_time(self):
        """评论区是对话：最老的在前（与 Issue 列表的倒序相反）。"""
        first = services.create_comment(self.issue, self.project_member, content="第一条")
        second = services.create_comment(self.issue, self.owner, content="第二条")

        self.auth(self.ws_viewer)
        body = self.client.get(self.comments_url(self.issue)).json()

        self.assertEqual(body["count"], 2)
        self.assertEqual([item["id"] for item in body["results"]], [str(first.id), str(second.id)])

    def test_list_only_contains_this_issue(self):
        other_issue = services.create_issue(self.project, self.owner, title="另一个")
        services.create_comment(self.issue, self.owner, content="本 Issue")
        services.create_comment(other_issue, self.owner, content="别的 Issue")

        self.auth(self.owner)
        body = self.client.get(self.comments_url(self.issue)).json()

        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["content"], "本 Issue")

    def test_list_pagination(self):
        for index in range(1, 6):
            services.create_comment(self.issue, self.owner, content=f"c{index}")
        self.auth(self.owner)
        body = self.client.get(f"{self.comments_url(self.issue)}?per_page=2").json()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])

    def test_issue_from_other_project_404(self):
        """URL 双层作用域：用本项目的路径访问别的项目的 Issue 评论 → 404。"""
        foreign = services.create_issue(self.other_project, self.owner, title="foreign")
        self.auth(self.owner)
        resp = self.client.get(f"{self.issues_url}{foreign.id}/comments/")
        self.assertEqual(resp.status_code, 404)


class CommentPermissionTests(IssueAPITestCase):
    def setUp(self):
        self.issue = services.create_issue(self.project, self.owner, title="权限用例")
        self.comment = services.create_comment(self.issue, self.project_member, content="原始内容")

    # ── PATCH ──────────────────────────────────────────────────
    def test_edit_by_author_200(self):
        self.auth(self.project_member)
        resp = self.client.patch(
            self.comment_url(self.issue, self.comment), {"content": "改过的"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["content"], "改过的")
        self.comment.refresh_from_db()
        self.assertEqual(self.comment.content, "改过的")

    def test_edit_by_project_admin_200(self):
        self.auth(self.owner)
        resp = self.client.patch(
            self.comment_url(self.issue, self.comment), {"content": "管理员改的"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)

    def test_edit_by_ws_admin_200(self):
        """WS Admin 未加入项目 → 生效角色视同项目 Admin（03 契约）。"""
        self.auth(self.ws_admin)
        resp = self.client.patch(
            self.comment_url(self.issue, self.comment), {"content": "WS Admin 改的"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)

    def test_edit_by_other_member_403(self):
        """同为项目 Member，但不是作者 → 403。"""
        self.auth(self.project_member2)
        resp = self.client.patch(
            self.comment_url(self.issue, self.comment), {"content": "越权"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)
        self.comment.refresh_from_db()
        self.assertEqual(self.comment.content, "原始内容")

    def test_edit_by_viewer_403(self):
        self.auth(self.project_viewer)
        resp = self.client.patch(
            self.comment_url(self.issue, self.comment), {"content": "越权"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_edit_requires_content_400(self):
        self.auth(self.project_member)
        resp = self.client.patch(
            self.comment_url(self.issue, self.comment), {"content": "  "}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["content"], ["该字段不能为空。"])

    # ── DELETE ─────────────────────────────────────────────────
    def test_delete_by_author_204(self):
        self.auth(self.project_member)
        resp = self.client.delete(self.comment_url(self.issue, self.comment))
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Comment.objects.filter(pk=self.comment.pk).exists())

    def test_delete_by_other_member_403(self):
        self.auth(self.project_member2)
        resp = self.client.delete(self.comment_url(self.issue, self.comment))
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(Comment.objects.filter(pk=self.comment.pk).exists())

    def test_delete_by_project_admin_204(self):
        self.auth(self.owner)
        resp = self.client.delete(self.comment_url(self.issue, self.comment))
        self.assertEqual(resp.status_code, 204)

    def test_delete_by_outsider_404(self):
        self.auth(self.outsider)
        resp = self.client.delete(self.comment_url(self.issue, self.comment))
        self.assertEqual(resp.status_code, 404)

    # ── 作用域 ─────────────────────────────────────────────────
    def test_comment_of_other_issue_404(self):
        other_issue = services.create_issue(self.project, self.owner, title="另一个")
        self.auth(self.owner)
        resp = self.client.patch(
            f"{self.comments_url(other_issue)}{self.comment.id}/",
            {"content": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_unknown_comment_id_404(self):
        self.auth(self.owner)
        resp = self.client.delete(
            f"{self.comments_url(self.issue)}00000000-0000-0000-0000-000000000000/"
        )
        self.assertEqual(resp.status_code, 404)
