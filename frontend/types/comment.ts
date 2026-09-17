/**
 * Comment domain types — mirrors docs/api/05-comments.md.
 */

import type { MemberSummary } from "./workspace";

export interface Comment {
  id: string;
  issue: string;
  author: MemberSummary;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentPayload {
  content: string;
}

export interface UpdateCommentPayload {
  content: string;
}

/**
 * Who may edit/delete a comment (docs/api/05-comments.md §PATCH/DELETE):
 * - the author, OR
 * - the effective project role is Admin (20) — project Admin, or WS Admin acting as one.
 *
 * Note: a plain project Member (15) can NOT edit someone else's comment.
 */
export function canManageComment(
  comment: Pick<Comment, "author">,
  currentUserId: string | undefined,
  effectiveRole: number | null | undefined,
): boolean {
  if (currentUserId && comment.author.id === currentUserId) return true;
  return effectiveRole === 20;
}
