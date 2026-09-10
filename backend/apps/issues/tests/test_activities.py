"""活动留痕的行为测试（契约 docs/api/06-activities.md）。

分两块：
1. 记录点——业务变更是否在该记的地方、以该有的形状留下痕迹；
2. 读取——两个只读端点、倒序、分页、权限，以及"同事务不回滚"的反例。
"""

from unittest import mock

from apps.activity.models import Actions, ActivityLog, EntityTypes
from apps.issues import services
from apps.issues.models import Issue
from apps.issues.tests.base import IssueAPITestCase


class IssueRecordingTests(IssueAPITestCase):
    def test_create_issue_writes_created_activity(self):
        issue = services.create_issue(self.project, self.owner, title="新任务")

        activity = ActivityLog.objects.get(issue=issue)
        self.assertEqual(activity.action, Actions.CREATED)
        self.assertEqual(activity.entity_type, EntityTypes.ISSUE)
        self.assertEqual(activity.entity_id, issue.id)
        self.assertEqual(activity.actor, self.owner)
        self.assertEqual(activity.project, self.project)
        self.assertEqual(activity.workspace, self.workspace)
        self.assertIsNone(activity.old_value)
        self.assertEqual(activity.new_value["state"], "Backlog")
        self.assertEqual(activity.new_value["title"], "新任务")
        self.assertEqual(activity.new_value["assignee"], None)
        self.assertEqual(activity.new_value["labels"], [])

    def test_patch_state_writes_old_and_new(self):
        issue = services.create_issue(self.project, self.owner, title="改状态")
        done = self.project.states.get(name="Done")

        services.update_issue(issue, actor=self.project_member, state=done)

        activity = ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).get()
        self.assertEqual(activity.old_value, {"state": "Backlog"})
        self.assertEqual(activity.new_value, {"state": "Done"})
        self.assertEqual(activity.actor, self.project_member)

    def test_patch_records_only_changed_fields(self):
        """同一次 PATCH 里没动的字段不进 diff（06 契约产品决策 2）。"""
        issue = services.create_issue(self.project, self.owner, title="只改优先级", priority="low")

        services.update_issue(issue, actor=self.owner, title="只改优先级", priority="high")

        activity = ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).get()
        self.assertEqual(activity.old_value, {"priority": "low"})
        self.assertEqual(activity.new_value, {"priority": "high"})

    def test_patch_same_value_writes_nothing(self):
        issue = services.create_issue(self.project, self.owner, title="没变", priority="high")

        services.update_issue(issue, actor=self.owner, priority="high", title="没变")

        self.assertFalse(ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).exists())

    def test_patch_assignee_to_null_records_boundary(self):
        """None 边界：取消指派要记成 old=用户名 / new=null（06 契约）。"""
        issue = services.create_issue(
            self.project, self.owner, title="取消指派", assignee=self.project_member
        )

        services.update_issue(issue, actor=self.owner, assignee=None)

        activity = ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).get()
        self.assertEqual(activity.old_value, {"assignee": "pm"})
        self.assertEqual(activity.new_value, {"assignee": None})

    def test_patch_description_records_length_summary_only(self):
        """描述只记字数，不存全文（06 契约产品决策 1）。"""
        issue = services.create_issue(self.project, self.owner, title="改描述")

        services.update_issue(issue, actor=self.owner, description="一二三四五")

        activity = ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).get()
        self.assertEqual(activity.old_value, {"description": "0 字"})
        self.assertEqual(activity.new_value, {"description": "5 字"})

    def test_patch_labels_records_name_arrays(self):
        bug = services.create_label(self.project, name="bug")
        issue = services.create_issue(self.project, self.owner, title="改标签")

        services.update_issue(issue, actor=self.owner, labels=[bug])

        activity = ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).get()
        self.assertEqual(activity.old_value, {"labels": []})
        self.assertEqual(activity.new_value, {"labels": ["bug"]})

    def test_patch_multi_field_records_them_together(self):
        issue = services.create_issue(self.project, self.owner, title="多字段")
        state = self.project.states.get(name="In Progress")

        services.update_issue(issue, actor=self.owner, state=state, priority="urgent", title="改名")

        activity = ActivityLog.objects.filter(issue=issue, action=Actions.UPDATED).get()
        self.assertEqual(set(activity.old_value), {"state", "priority", "title"})
        self.assertEqual(activity.new_value["title"], "改名")

    def test_delete_issue_records_snapshot_before_removal(self):
        issue = services.create_issue(self.project, self.owner, title="待删除", priority="high")
        issue_id = issue.id

        services.delete_issue(issue, actor=self.owner)

        activity = ActivityLog.objects.get(
            entity_type=EntityTypes.ISSUE, entity_id=issue_id, action=Actions.DELETED
        )
        self.assertEqual(activity.old_value["title"], "待删除")
        self.assertEqual(activity.old_value["priority"], "high")
        self.assertIsNone(activity.new_value)
        # Issue 已删 → 上下文外键被 SET_NULL，但留痕本身必须还在
        self.assertIsNone(activity.issue)

    def test_comment_created_and_deleted_are_recorded(self):
        issue = services.create_issue(self.project, self.owner, title="评论留痕")
        comment = services.create_comment(issue, self.project_member, content="先评论")

        created = ActivityLog.objects.get(
            entity_type=EntityTypes.COMMENT, entity_id=comment.id, action=Actions.CREATED
        )
        self.assertEqual(created.actor, self.project_member)
        self.assertEqual(created.issue, issue)

        comment_id = comment.id
        services.delete_comment(comment, actor=self.owner)

        deleted = ActivityLog.objects.get(
            entity_type=EntityTypes.COMMENT, entity_id=comment_id, action=Actions.DELETED
        )
        self.assertEqual(deleted.actor, self.owner)

    def test_comment_edit_writes_nothing(self):
        """编辑评论有意不产生活动（06 契约「有意不记录的事件」）。"""
        issue = services.create_issue(self.project, self.owner, title="编辑评论")
        comment = services.create_comment(issue, self.owner, content="原始")

        services.update_comment(comment, content="改过")

        actions = list(
            ActivityLog.objects.filter(entity_id=comment.id).values_list("action", flat=True)
        )
        self.assertEqual(actions, [Actions.CREATED])

    def test_project_create_and_update_are_recorded(self):
        from apps.projects import services as project_services

        project = project_services.create_project(
            self.workspace, self.owner, name="留痕项目", identifier="TRC"
        )
        created = ActivityLog.objects.get(
            entity_type=EntityTypes.PROJECT, entity_id=project.id, action=Actions.CREATED
        )
        self.assertEqual(created.new_value, {"name": "留痕项目"})

        project_services.update_project(project, actor=self.owner, name="改名后", identifier="TRD")

        updated = ActivityLog.objects.get(
            entity_type=EntityTypes.PROJECT, entity_id=project.id, action=Actions.UPDATED
        )
        self.assertEqual(updated.old_value, {"name": "留痕项目", "identifier": "TRC"})
        self.assertEqual(updated.new_value, {"name": "改名后", "identifier": "TRD"})

    def test_project_update_without_change_writes_nothing(self):
        from apps.projects import services as project_services

        project = project_services.create_project(
            self.workspace, self.owner, name="没变项目", identifier="TRE"
        )
        project_services.update_project(project, actor=self.owner, name="没变项目")
        self.assertFalse(
            ActivityLog.objects.filter(
                entity_type=EntityTypes.PROJECT, entity_id=project.id, action=Actions.UPDATED
            ).exists()
        )


class ActivityTransactionTests(IssueAPITestCase):
    def test_activity_write_failure_rolls_back_business_change(self):
        """留痕与业务同事务：写留痕炸了，Issue 与发号计数器都不能留下痕迹。"""
        with mock.patch.object(
            ActivityLog.objects, "create", side_effect=RuntimeError("activity down")
        ):
            with self.assertRaises(RuntimeError):
                services.create_issue(self.project, self.owner, title="不该存在的任务")

        self.assertFalse(Issue.objects.filter(title="不该存在的任务").exists())
        self.project.refresh_from_db()
        self.assertEqual(self.project.issue_sequence, 0)

    def test_activity_write_failure_rolls_back_comment(self):
        issue = services.create_issue(self.project, self.owner, title="评论回滚")
        with mock.patch.object(
            ActivityLog.objects, "create", side_effect=RuntimeError("activity down")
        ):
            with self.assertRaises(RuntimeError):
                services.create_comment(issue, self.owner, content="不该留下的评论")

        self.assertEqual(issue.comments.count(), 0)


class ActivityEndpointTests(IssueAPITestCase):
    def setUp(self):
        self.issue = services.create_issue(self.project, self.owner, title="时间线")
        services.update_issue(self.issue, actor=self.owner, priority="high")
        services.create_comment(self.issue, self.project_member, content="评论")

    def test_issue_timeline_is_descending(self):
        self.auth(self.owner)
        body = self.client.get(self.issue_activities_url(self.issue)).json()

        self.assertEqual(body["count"], 3)
        # 顺序按 created_at 倒序。注意：Windows 墙钟粒度约 15ms，
        # 连续写入会落在同一时间戳，此时顺序不保证（06 契约已写明）。
        stamps = [item["created_at"] for item in body["results"]]
        self.assertEqual(stamps, sorted(stamps, reverse=True))
        self.assertEqual(
            sorted((item["entity_type"], item["action"]) for item in body["results"]),
            [("comment", "created"), ("issue", "created"), ("issue", "updated")],
        )

    def test_issue_timeline_contains_actor_summary(self):
        self.auth(self.owner)
        body = self.client.get(self.issue_activities_url(self.issue)).json()
        actors = sorted(item["actor"]["username"] for item in body["results"])
        self.assertEqual(actors, ["owner", "owner", "pm"])
        for item in body["results"]:
            self.assertNotIn("email", item["actor"])

    def test_issue_timeline_survives_comment_deletion(self):
        """评论被删后，它的 created 与 deleted 两条留痕仍留在时间线里。"""
        comment = services.create_comment(self.issue, self.owner, content="临时")
        services.delete_comment(comment, actor=self.owner)

        self.auth(self.owner)
        body = self.client.get(self.issue_activities_url(self.issue)).json()

        pairs = [(item["entity_type"], item["action"]) for item in body["results"]]
        self.assertIn(("comment", "created"), pairs)
        self.assertIn(("comment", "deleted"), pairs)

    def test_issue_timeline_is_scoped_to_this_issue(self):
        other = services.create_issue(self.project, self.owner, title="别的任务")
        self.auth(self.owner)
        body = self.client.get(self.issue_activities_url(other)).json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["action"], "created")

    def test_project_feed_covers_all_issues(self):
        services.create_issue(self.project, self.owner, title="另一个任务")
        self.auth(self.owner)
        body = self.client.get(self.project_activities_url).json()

        issue_actions = [
            item for item in body["results"] if item["entity_type"] == EntityTypes.ISSUE
        ]
        # 2 次 issue.created（本 Issue + 另一个）+ 1 次 issue.updated + 1 次 comment.created
        self.assertEqual(len(issue_actions), 3)

    def test_activities_pagination(self):
        self.auth(self.owner)
        body = self.client.get(f"{self.issue_activities_url(self.issue)}?per_page=2").json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])

    def test_activities_readable_by_viewer(self):
        self.auth(self.project_viewer)
        self.assertEqual(self.client.get(self.issue_activities_url(self.issue)).status_code, 200)
        self.assertEqual(self.client.get(self.project_activities_url).status_code, 200)

    def test_activities_404_for_outsider(self):
        self.auth(self.outsider)
        self.assertEqual(self.client.get(self.issue_activities_url(self.issue)).status_code, 404)
        self.assertEqual(self.client.get(self.project_activities_url).status_code, 404)

    def test_activities_401_unauthenticated(self):
        self.assertEqual(self.client.get(self.issue_activities_url(self.issue)).status_code, 401)

    def test_activities_have_no_write_endpoint(self):
        self.auth(self.owner)
        self.assertEqual(
            self.client.post(self.project_activities_url, {}, format="json").status_code, 405
        )
        self.assertEqual(self.client.delete(self.issue_activities_url(self.issue)).status_code, 405)

    def test_activities_query_count_has_no_n_plus_one(self):
        """解析项目 2 次 + 分页 count 1 次 + 取页 1 次（actor 已 select_related）= 4。"""
        self.auth(self.owner)
        with self.assertNumQueries(4):
            self.client.get(self.project_activities_url)
