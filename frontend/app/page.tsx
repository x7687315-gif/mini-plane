import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Crosshair,
  IssueId,
  LabelTag,
  MeasureLine,
  PriorityDot,
  StateDot,
  Tab,
  TabCount,
} from "@/components/ui";
import { PlusIcon, SearchIcon, ChevronDownIcon } from "@/components/icons";

/**
 * Sprint 0 home — replaced with the AppShell demonstration page.
 *
 * Per FRONTEND_ROADMAP.md §2 Sprint 0:
 * - Confirms the AppShell scaffold renders correctly (TopBar / LeftRail / Main / Aside / Footer)
 * - Confirms every UI primitive is reachable: Button / Chip / Card / Input / Avatar / IssueId / ...
 *
 * Sprint 1 will REPLACE this with the Auth flow (login/register).
 */
export default function Home() {
  return (
    <AppShell
      topbar={{ workspace: "Amiya Workspace", project: "Amiya Project", role: 20, username: "Amiya" }}
      aside={
        <>
          <div>
            <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1">
              Throughput &middot; 7d
            </div>
            <div className="font-serif text-[32px] leading-none text-[color:var(--color-ink)]">
              29 <small className="text-[12px] text-[color:var(--color-ink-3)] italic ml-1">closed</small>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.26em] text-[color:var(--color-ink-3)] font-sans font-medium mb-1">
              Cycle time
            </div>
            <div className="font-serif text-[32px] leading-none text-[color:var(--color-ink)]">
              3.2 <small className="text-[12px] text-[color:var(--color-ink-3)] italic ml-1">days</small>
            </div>
          </div>
        </>
      }
    >
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="bp-display text-4xl text-[color:var(--color-ink)]">
            Scaffold <em className="text-[color:var(--color-accent)]">&mdash;</em> ready
          </h1>
          <p className="font-serif italic text-[14px] text-[color:var(--color-ink-3)] mt-1 tracking-[0.04em]">
            SPRINT 0 &middot; design system + AppShell + 14 components
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <span>view</span>
            <ChevronDownIcon size={12} />
          </Button>
          <Button variant="primary" size="sm">
            <PlusIcon size={12} />
            <span>new issue</span>
          </Button>
        </div>
      </div>

      <MeasureLine left="FIG · 00" right="SCAFFOLD · ACTIVE" />

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Chip variant="active">All &middot; 128</Chip>
        <Chip variant="accent">Backlog &middot; 42</Chip>
        <Chip>Todo &middot; 31</Chip>
        <Chip>In Progress &middot; 18</Chip>
        <Chip>Done &middot; 29</Chip>
        <Chip>Cancelled &middot; 08</Chip>
        <span className="flex-1 min-w-[150px] flex items-center gap-2 px-2.5 py-1.5 border border-[color:var(--color-rule)]">
          <SearchIcon size={12} />
          <span className="text-[10px] italic text-[color:var(--color-ink-3)] tracking-[0.06em]">
            search title / description
          </span>
        </span>
      </div>

      {/* Issue list (demo rows) */}
      <div className="border-t border-[color:var(--color-rule)]">
        {[
          { id: "AMI-07", title: "登录页验证码不显示", state: "#94a3b8", priority: "urgent" as const, label: { name: "bug", color: "#dc2626" }, asg: "A" },
          { id: "AMI-06", title: "重构 Auth 模块的 CSRF 自愈逻辑", state: "#eab308", priority: "medium" as const, label: { name: "tech-debt", color: "#eab308" }, asg: "K" },
          { id: "AMI-05", title: "设计 Issue 详情侧拉抽屉的 wireframe", state: "#3b82f6", priority: "none" as const, label: { name: "design", color: "#3b82f6" }, asg: "—" },
          { id: "AMI-04", title: "补 Sprint 5 EXPLAIN 的索引报告", state: "#10b981", priority: "low" as const, label: { name: "docs", color: "#10b981" }, asg: "R" },
        ].map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[78px_1fr_auto_auto_auto] gap-3.5 items-center py-3 px-1.5 border-b border-dashed border-[color:var(--color-rule)]"
          >
            <IssueId project="AMI" sequence={Number(r.id.split("-")[1])} />
            <div className="text-[13px] text-[color:var(--color-ink)]">
              {r.title}
              <div className="text-[8.5px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] mt-1 font-sans font-medium">
                updated 2 min ago by Amiya
              </div>
            </div>
            <LabelTag name={r.label.name} color={r.label.color} />
            <PriorityDot priority={r.priority} />
            <span className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-full bg-[color:var(--color-paper-2)] border border-[color:var(--color-rule)] font-serif italic text-[11px] text-[color:var(--color-ink-2)]">
              {r.asg}
            </span>
          </div>
        ))}
      </div>

      {/* Tabs + cards demo */}
      <div className="mt-10">
        <div className="flex gap-5 border-b border-[color:var(--color-rule)] mb-3">
          <Tab active>
            Activity <TabCount count={6} />
          </Tab>
          <Tab>Comments <TabCount count={2} /></Tab>
          <Tab>Refs</Tab>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>Card header (italic Cormorant)</CardHeader>
            <CardBody>
              Cards are flat, square-cornered, 0.5px rule border. No shadow.
              <div className="mt-3 flex gap-2 flex-wrap">
                <Chip variant="active">Active</Chip>
                <Chip variant="accent">Accent</Chip>
                <Chip>Default</Chip>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Crosshair size={16} label="00° N" />
                <Crosshair size={16} label="00° E" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>State dot + priority</CardHeader>
            <CardBody>
              <div className="flex items-center gap-3 mb-3">
                <StateDot color="#94a3b8" />
                <span className="text-[12px]">Backlog</span>
              </div>
              <div className="flex items-center gap-3">
                <PriorityDot priority="urgent" size={10} />
                <span className="text-[12px]">urgent</span>
                <PriorityDot priority="high" size={10} />
                <span className="text-[12px]">high</span>
                <PriorityDot priority="medium" size={10} />
                <span className="text-[12px]">medium</span>
                <PriorityDot priority="low" size={10} />
                <span className="text-[12px]">low</span>
                <PriorityDot priority="none" size={10} />
                <span className="text-[12px]">none</span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button variant="primary">primary</Button>
                <Button variant="secondary">secondary</Button>
                <Button variant="accent">accent</Button>
                <Button variant="ghost">ghost</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-10 flex items-center gap-6 text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink-3)] font-sans font-medium">
        <Link href="/404-demo" className="hover:text-[color:var(--color-ink)]">
          &rarr; see 404 page
        </Link>
        <Link href="/login-demo" className="hover:text-[color:var(--color-ink)]">
          &rarr; Sprint 1 login form (preview)
        </Link>
      </div>
    </AppShell>
  );
}