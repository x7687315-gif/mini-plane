import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginAlt, LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  title: "进入 · Mini Plane",
};

/**
 * /login — 本地单机版昵称优先入口（见 SCREEN_BLUEPRINTS §2.1）。
 *
 * 大标题保留 Cormorant 衬线英文（设计语言，见 DESIGN.md §2）；引导文案一律中文。
 */
export default function LoginPage() {
  return (
    <AuthCard
      sheet="01"
      title="Enter"
      subtitle={<span>输入昵称即可开始 · 数据只留在本机</span>}
      alt={<LoginAlt />}
    >
      <LoginForm />
    </AuthCard>
  );
}