/**
 * Anatomy V2 · Phase 5 纯布局性能基线。
 *
 * 只测量 selectAnatomyViewModel / computeAnatomyLayout（确定性、无 DOM），
 * 不代表浏览器绘制/动画帧率；后者必须在真实数据 + 浏览器里另行测量。
 *
 * 用法：node --import ./tests/register-loader.mjs scripts/benchmark-anatomy.mjs
 */

import { performance } from "node:perf_hooks";

import { anatomyFixtures } from "../tests/fixtures/anatomy-fixtures.mts";
import { computeAnatomyLayout, selectAnatomyViewModel } from "@/features/anatomy";

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function bench(fn, iterations = 60) {
  for (let index = 0; index < 8; index += 1) fn();
  const times = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    avg: times.reduce((sum, value) => sum + value, 0) / times.length,
    p95: percentile(times, 95),
    max: times[times.length - 1],
  };
}

const cases = [
  ["F1 1 Stage / 0 Task", anatomyFixtures.oneStage],
  ["F2 3 Stage / 4 Task", anatomyFixtures.small],
  ["F4 8 Stage / 64 Task", anatomyFixtures.dense],
  ["F5 16 Stage / 208 Task", anatomyFixtures.large],
  ["F5+ 16 Stage / 304 Task", anatomyFixtures.stress],
];

console.log("case\tselect avg/p95 (ms)\tlayout avg/p95 (ms)\tlayout max (ms)");
for (const [label, fixture] of cases) {
  const input = {
    identifier: fixture.identifier,
    stages: fixture.stages,
    tasks: fixture.tasks,
    plan: fixture.plan,
    nowTaskId: fixture.nowTaskId,
    projectProgress: fixture.projectProgress,
    progressSource: fixture.progressSource,
  };
  const view = selectAnatomyViewModel(input);
  const selectResult = bench(() => selectAnatomyViewModel(input));
  const layoutResult = bench(() => computeAnatomyLayout(view));
  console.log(
    `${label}\t${selectResult.avg.toFixed(3)} / ${selectResult.p95.toFixed(3)}\t` +
      `${layoutResult.avg.toFixed(3)} / ${layoutResult.p95.toFixed(3)}\t${layoutResult.max.toFixed(3)}`,
  );
}
