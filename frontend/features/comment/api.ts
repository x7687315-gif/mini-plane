/**
 * Comment API — docs/api/05-comments.md.
 *
 * Routes are nested under the issue:
 *   /workspaces/{slug}/projects/{pid}/issues/{iid}/comments/
 *
 * Permission notes:
 * - create → effective role ≥ Member (Viewer gets 403)
 * - edit/delete → the author, or effective role = Admin
 * - the list is **ascending by created_at** (oldest first) — it's a conversation
 */

import { api } from "@/lib/api";
import type { Paginated } from "@/types/project";
import type { Comment, CreateCommentPayload, UpdateCommentPayload } from "@/types/comment";

function commentsBase(slug: string, projectId: string, issueId: string): string {
  return `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/comments`;
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