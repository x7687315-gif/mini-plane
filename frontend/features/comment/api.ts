/**
 * Comment API — docs/api/05-comments.md · 规范路由见 10-canonical-projects.md。
 *
 * Routes are nested under the task:
 *   /api/v1/projects/{pid}/tasks/{tid}/comments/
 *
 * Permission notes:
 * - create → effective role ≥ Member (Viewer gets 403)
 * - edit/delete → the author, or effective role = Admin
 * - the list is **ascending by created_at** (oldest first) — it's a conversation
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type { Comment, CreateCommentPayload, UpdateCommentPayload } from "@/types/comment";

/** 规范路由（Phase 4）：slug 参数仅保留签名兼容，URL 不再使用。 */
function commentsBase(_slug: string, projectId: string, issueId: string): string {
  return `/projects/${projectId}/tasks/${issueId}/comments`;
}

export async function listComments(
  slug: string,
  projectId: string,
  issueId: string,
): Promise<Paginated<Comment>> {
  return api<Paginated<Comment>>(commentsBase(slug, projectId, issueId));
}

export async function createComment(
  slug: string,
  projectId: string,
  issueId: string,
  payload: CreateCommentPayload,
): Promise<Comment> {
  return api<Comment>(commentsBase(slug, projectId, issueId), {
    method: "POST",
    json: payload,
  });
}

export async function updateComment(
  slug: string,
  projectId: string,
  issueId: string,
  commentId: string,
  payload: UpdateCommentPayload,
): Promise<Comment> {
  return api<Comment>(`${commentsBase(slug, projectId, issueId)}/${commentId}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function deleteComment(
  slug: string,
  projectId: string,
  issueId: string,
  commentId: string,
): Promise<void> {
  return api<void>(`${commentsBase(slug, projectId, issueId)}/${commentId}`, {
    method: "DELETE",
  });
}