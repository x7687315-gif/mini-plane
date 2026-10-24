import { redirect } from "next/navigation";

/**
 * 旧项目页（/w/{slug}/projects/{pid}）—— Phase 5 起重定向到规范工程台
 * `/projects/{pid}`（ADR-001：工程统一只凭 ID，个人/团队同构）。
 *
 * 保留本路由是为了不打破既有书签 / 链接 / E2E；slug 仅作路径兼容，
 * 不参与定位与鉴权（工程台走 resolve_project_by_id）。
 */
export default async function LegacyProjectRedirect({
  params,
}: {
  params: Promise<{ slug: string; pid: string }>;
}) {
  const { pid } = await params;
  redirect(`/projects/${pid}`);
}
