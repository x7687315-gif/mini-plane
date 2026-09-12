<!--
PR 标题格式：`<type>(backend|frontend): <简述>`，如 feat(backend): issue 批量改标签
契约变更（docs/api/*）必须勾选最后一节；不涉及的删掉该节。
-->

## What（做了什么）

<!-- 一两段说清改动范围；列表点出关键文件/模块 -->

## Why（为什么做）

<!-- 关联的 Sprint / 契约 / Issue；不做的理由（如果有意收窄范围）也写在这里 -->

## How（怎么做的）

<!-- 关键设计决策与取舍；踩过的坑值得写（会进 devlog） -->

## Testing（怎么验证的）

- [ ] 新增/修改的测试用例：
- [ ] `python manage.py test --settings=config.settings.test --noinput` 全绿
- [ ] `ruff check` / `ruff format --check` 零告警
- [ ] `makemigrations --check` 无漂移
- [ ] `spectacular --validate --fail-on-warn` 通过

## Breaking Changes（对前端 / 契约的影响）

<!-- 无就写"无"；有则列出受影响接口与迁移方式 -->

## 契约变更（docs/api/*，没有可删）

- [ ] 已先改契约文档并请前端确认（评论或 approve 视为冻结）
- [ ] `docs/api/openapi.yaml` 已重新生成并与实现一致
