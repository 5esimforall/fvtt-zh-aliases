# 真实视觉 · Truesight

Truesight 对 Foundry 条目进行聚类，并利用已确认的成员关系汇集名称证据。当前聚类规则仅覆盖 dnd5e 法术；名称解析仍支持独立条目的法术、职业能力及其他物品名称。插件不修改文档、角色卡或自动化。

## 使用

依赖 Quick Insert 3.7.8 或以上，不依赖 Slow Insert、中文汉化包、CPR 或 GPS。将发行包中的 `truesight` 目录安装到 `Data/modules`，启用后重新载入客户端。

在「配置设置 → 真实视觉 · Truesight → 审核规则分组」打开管理窗口。点击「重新归组…」查看完整索引的候选，再点击「应用归组」。风险后缀归并默认关闭；预览、关闭窗口和普通索引刷新都不会发布成员关系。停用 Slow Insert 后，管理入口及中文适配仍可工作。

审核按**当前世界、当前用户、当前浏览器客户端**保存。它不是 GM 发布的世界级审核，不会同步到其他浏览器。所有消费者在同一客户端使用同一份审核修订。每次写入保留一层撤销；撤销恢复成员关系与身份排除，不改变 Slow Insert 的首选或浏览偏好。

新增条目先独立；已删除或不可访问的成员不返回；身份字段变化的成员失效。仅改显示译名不会单独使普通分组失效。算法沿用 Slow Insert 0.6.7 的判定：同规则代际、有效 identifier、环阶和学派一致形成候选；可选风险规则允许来源印证的完整英文书目后缀。2014 与 2024 分开。算法不读取名称解析结果来证明身份。

## 从旧插件迁移

1. 同时升级 Slow Insert 0.6.8、CPR/GPS 适配 0.3.1，并安装 Truesight 0.1.0。
2. 停用旧 `zh-aliases-core`，启用 Truesight。旧插件已退出依赖关系，不应和新适配混搭。旧安装目录可以留存但不启用。
3. 在原来保存审核的浏览器及世界中打开 Truesight，选择「迁入旧 Slow Insert 快照…」，检查后应用。
4. 只迁入仍有效、仍可访问的旧成员；新增条目不会借迁移入组。旧手动排除按原有的身份排除语义迁入。旧快照不会被删除或自动提升为共享世界数据。
5. Slow Insert 自动读取原首选作为浏览偏好的初值；迁移审核、撤销审核和改变首选彼此独立。

客户端审核不在 Git 内；更新前需要保留客户端存储，或通过浏览器另行备份。代码可通过 Git/发行包回退。本次迁移不写世界数据。

## API v1

运行时入口：

```js
const {apiVersion, catalog, names, sources} = game.modules.get('truesight').api;
if (apiVersion !== 1) throw Error('Unsupported Truesight API');
await catalog.whenReady();
const view = catalog.read();
const member = catalog.getMember('Compendium.package.pack.Item.id');
```

也可从公开的 `modules/truesight/api-v1.mjs` 导入同一 API；该路径须保留 Foundry 的部署前缀。`scripts/` 是内部实现，消费者不应导入。`sources` 提供书目和来源解析；`names` 的纯解析函数与加载契约见工作区架构说明。

### 目录与状态

- `getStatus()`：`apiVersion`、`ruleVersion`、`revision`、`generation`、`scope`、`reviewed`、`canUndo`、`includeRisk`。
- `status` 区分 `not-ready`、`ready`、`unreviewed`、`unavailable`、`failed`。未审核成功返回独立条目；读取失败抛出带 `code`/`source` 的错误，不伪装成空组。
- `whenReady({timeout})`：等 Quick Insert 索引完成，默认 60 秒；超时、被 GM-only 限制、接口不支持或审核损坏均明确拒绝。
- `read(uuids?)`：返回同一审核修订下的 `entries: Map`、`groups: Map`、`changed` 和可见排除数量。成员包含类型、代际、状态、理由与来源证据，不含搜索包装、UI 对象或文档方法。指定 UUID 时，组成员仍是该组当前可访问的全部成员；未索引的查询条目标为 `not-indexed`，不会自行推断其归属。
- `getMember(uuid)`：读取一个成员。成员状态包括 `member`、`independent`、`pending`、`invalidated`、`conflict`、`not-indexed`，细分原因在 `warning`/`reason`。

### 审核与扩展

- `preview({includeRisk})` / `previewMigration()`：生成本客户端预览，返回预览 `id`、差异、成员和独立条目。
- `apply(id)`：确认预览；证据或审核已改变时拒绝应用。
- `undo()`、`exclude(uuid)`、`restoreExcluded()`：操作审核关系与身份排除。个人隐藏和首选应由消费者另存。
- `openReview({migration})`：打开独立管理入口。
- `registerPublications(id, records)` / `unregisterPublications(id)`：共享书目扩展。返回的注销函数只撤去本次注册，不会删除后来的同名替换。
- 声明式书目使用 `flags.truesight.publications`。迁移期仍读取既有 `flags.slow-insert.publications`，同包的新声明优先；这是已发布书目数据的兼容，不要求启用 Slow Insert。所有提供方改用新字段后可移除旧字段支持。
- `sourceEnvironment()`：当前来源解析上下文，供搜索展示等消费者使用。

监听 `Hooks.on('truesightChanged', status => ...)` 重建派生结果。应用、撤销、身份排除、索引和来源更新触发通知。通知只带状态与修订，不广播成员 UUID、名称或来源。每次读取重新按权限检查并验证已应用快照，普通刷新不自动扩大已确认组。

## 名称能力与失败

`names.apiVersion` 为 1。名称层读取可见索引、独立名称证据和 `catalog` 的有效成员关系，按消费者自己的候选目录消歧。没有中文汉化包时不读取其资产，仍可使用索引中的原名和双语名；汉化包已启用但读取失败则报告失败，不发布不完整结果。

CPR/GPS 适配监听目录变更重建计划；重建前先撤下旧派生结果。CPR 只撤回由本适配注册且尚未被其他代码改写的键；GPS 重建期间保留原生查找。基座不依赖或调用提供方的自动化入口。
