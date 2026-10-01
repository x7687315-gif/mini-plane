"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { createAgentToken, listAgentTokens, revokeAgentToken } from "@/features/agents/api";
import { AGENT_SCOPE_LABELS } from "@/types/agent";

/**
 * Agent Token 管理卡（Sprint 12，§24）。
 *
 * 明文 Token 只在创建那一刻返回一次，这里就地展示并提醒保存；列表只回传元信息。
 * Token 权限是白名单（读项目/读任务/写任务/写日志/更新进度），不含破坏性能力。
 */
export function AgentTokenCard() {
  const qc = useQueryClient();
  const { data: tokens } = useQuery({ queryKey: ["agent-tokens"], queryFn: listAgentTokens });
  const createMutation = useMutation({
    mutationFn: (name: string) => createAgentToken({ name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-tokens"] }),
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAgentToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-tokens"] }),
  });

  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const created = await createMutation.mutateAsync(name.trim());
    setRevealed(created.token);
    setName("");
  };

  return (
    <Card className="max-w-2xl mt-6">
      <CardHeader>Agent Token</CardHeader>
      <CardBody className="space-y-5">
        <p className="text-[12px] text-[color:var(--color-ink-2)]">
          给本地 Agent 用的独立凭据（<code className="font-mono">Authorization: Bearer mpa_…</code>
          ）。权限为白名单：读项目/读任务/写任务/写日志/更新进度；不能删工作区、管成员、改角色。
          写动作支持 <code className="font-mono">Idempotency-Key</code> 防重复。
        </p>

        {revealed && (
          <div className="border border-[color:var(--color-warning)] px-3 py-2">
            <p className="text-[11px] text-[color:var(--color-warning)] mb-1">
              明文仅显示这一次，请立即复制保存：
            </p>
            <code className="block font-mono text-[11px] break-all text-[color:var(--color-ink)]">
              {revealed}
            </code>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRevealed(null)}>
              我已保存，隐藏
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <div className="flex-1 min-w-0">
            <Field label="Token 名称" htmlFor="agent-token-name">
              <Input
                id="agent-token-name"
                placeholder="如：本地编码 Agent"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => void handleCreate()}
          >
            创建 Token
          </Button>
        </div>

        <div className="border-t border-[color:var(--color-rule)]">
          {(tokens ?? []).length === 0 && (
            <p className="py-3 text-[12px] text-[color:var(--color-ink-3)]">还没有 Token。</p>
          )}
          {(tokens ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-dashed border-[color:var(--color-rule)]"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[color:var(--color-ink)] truncate">
                  {t.name}
                  {!t.is_active && (
                    <span className="ml-2 text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-urgent)]">
                      已吊销
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[color:var(--color-ink-3)] mt-0.5">
                  {t.scopes.map((s) => AGENT_SCOPE_LABELS[s] ?? s).join(" · ")}
                </div>
              </div>
              {t.is_active && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(t.id)}
                >
                  吊销
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
