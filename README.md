# Foundry 中文别名插件

角色卡可以保留「迷踪步」「不屈」，也可以写完整双语名。这个工作区提供一个共享名称基座和两个适配插件，让 CPR Medkit 按有证据的英文名查找 CPR、GPS 自动化；物品显示名保持原样，是否应用候选仍由使用者决定。

## 三个插件

| 插件目录 / Foundry ID | 职责 | 必需依赖 |
| --- | --- | --- |
| `modules/zh-aliases-core` / `zh-aliases-core` | 读取名称证据、消费审核分组、解析名称和诊断冲突 | dnd5e、Slow Insert、简体中文 Babele 汉化包及其自身依赖 |
| `modules/cpr-zh-aliases` / `cpr-zh-aliases` | 注册 CPR 自有自动化的名称映射 | 基座、CPR |
| `modules/gps-zh-aliases` / `gps-zh-aliases` | 补充 CPR Medkit 中的 GPS 中文名查找 | 基座、CPR、Gambit’s Premades |

两个适配插件互不依赖。GPS 适配仍依赖 CPR，因为当前接入点是 CPR Medkit；它不提供脱离 Medkit 的 GPS 宏执行兼容。基座不依赖 CPR 或 GPS，也不单独写入任何提供方的名称表。

目标环境为 Foundry V13、dnd5e。本机源码回放核对的 CPR 为 1.5.49，GPS 为 2.1.44，简体中文 Babele 汉化包（`dnd-simplified-chinese-babele-patch`）为 0.5.923。Slow Insert 不限定模块版本，但必须提供兼容的审核分组接口。插件读取汉化包的标题索引，发行包不复制第三方译表。

## 安装与使用

1. 运行 `npm run package`，取得三个独立 ZIP；也可以直接复制 `modules/` 下需要的插件目录。
2. 将 `zh-aliases-core` 和所需适配插件的文件夹放入 Foundry 用户数据的 `Data/modules/`。每个目录中的 `module.json` 必须直接位于该目录内。若只用 GPS 名称支持，无需安装 CPR 中文别名适配插件。
3. 重启 Foundry 服务发现新模块，在世界中启用基座、所需适配插件及表中依赖，重新载入客户端。GM 与玩家不必各自运行宏。
4. 打开物品的 CPR Medkit。CPR 可用 `Misty Step` 对照「迷踪步」及双语名；GPS 可用 `Indomitable` 对照「不屈」及双语名。保持物品类型和规则代际相同，并在 CPR 的自动化来源配置中启用 GPS。

从旧单插件结构升级时，用新 `cpr-zh-aliases` 目录替换旧运行副本，并新增基座；CPR 适配插件保留原 Foundry ID。工作区原 `module/` 路径已移除，没有旧结构兼容层。打包不会安装或启用插件。

停用某个适配插件并重新载入，即可撤去该来源的新增查找支持；已经应用到角色卡的自动化不受影响。索引和译表是客户端加载时的快照，更换权限、合集内容、译表或 CPR 合集配置后请重新载入；若载入期间已打开 Medkit，待初始化完成后重新打开。物品在本次快照后改名或新增时，也可能需要重新载入。

## 名称怎样匹配

1. **收集证据。** 每个适配插件请求基座读取可见 Item 合集索引、可见世界物品、有观察权限的世界角色物品及汉化标题索引。Babele ID 键通过当前索引还原原名。记录已知类型和规则代际，缺失的上下文保留为未限定证据。
2. **使用审核分组。** 基座直接消费 Slow Insert 的分组目录，不修改分组登记，也不按相似名称创建新组。未入组或审核失效的条目、世界物品按单条处理。接口不可用时停止该次构建，不降级为无审核模式。
3. **对各提供方独立判断。** 双语显示名只提取完整英文一侧，不从长短语截取法术名。未命中的弱推测不参与冲突判断，也不能单独产生别名；完整显示名的译表记录、原名及同组已确认的证据仍保留。只归一匹配时的大小写、空格和括号，不改写显示名。
4. **由适配层接入。** CPR 使用自己的全局名称表，因此同一显示名跨类型、跨规则代际也必须相容，且已有映射不覆盖。GPS 分类型和规则代际解析，先保留原查找；只有原结果没有 GPS 候选时，才以只读英文名视图重试原生查找，并只补回 GPS 来源的结果。重试产生的其他提供方结果不会替换原结果。

GPS 目录按 CPR 的 GPS 集成模式纳入常规、自制或第三方合集，未读取隐藏合集。适配插件不修改 GPS 内部目录；候选 UUID、版本、来源优先级及原生目录是否就绪仍由 CPR 决定。NPC 专属特性的怪物身份匹配不在 GPS 别名支持范围内，NPC 法术仍按普通法术路径处理。

### 查看冲突与未匹配的原因

在浏览器控制台读取已启用适配插件的报告：

```js
const cpr = game.modules.get("cpr-zh-aliases")?.api?.report;
const gps = game.modules.get("gps-zh-aliases")?.api?.report;
console.log(cpr, gps);

// CPR 使用一个全局计划；GPS 按规则代际和查找类型保存计划。
cpr?.clusterErrors?.filter(error =>
  error.members.some(member => member.displayName.includes("剑刃防护")));
gps?.scopes?.filter(entry => entry.scope.rules === "2024" && entry.scope.type === "feat");
```

`ready` 表示计划构建完成，不表示每个名称都已命中；`cluster-conflict` 表示有组被拒绝，其他无冲突组仍可用。`conflicts` 保存译表名称歧义或原名缺失，`clusterErrors` 保存受影响的组、成员、候选名称及来源。

| 原因字段 | 含义 |
| --- | --- |
| `multiple-lookup-targets` | 当前提供方目录中有多个不同查找名 |
| `conflicting-originals` | 原名或映射不一致，但不足两个当前提供方目标 |
| `unknown-original` | 原名或映射缺失 |
| `ambiguous-name` | 同一显示名有多个候选，记录于 `conflicts` |

共享核心将原 CPR 专用分类 `multiple-cpr-targets` 改为 `multiple-lookup-targets`。历史评估记录保留当时字段和计数；拆分不会自动解决那些条目。

CPR 报告的 `registered` 是本次实际新增映射数；共享计划的 `planned` 是可用别名数。GPS 不注册全局映射，`scopes[].planned` 表示对应模式和上下文下的计划覆盖数，不是实际查找命中次数。`existing`、`unsupported` 分别记录已存在的名称和未命中目录的名称。GPS 模式切换后可增加新的作用域报告，各作用域数量可能重复，不能相加当作独立条目数。

`source-error` 表示当前构建失败，`source` 指明译表、索引或 `slow-insert`。CPR 不写入部分结果；GPS 在构建失败后仅保留原查找。`unsupported-core`、`unsupported-cpr`、`unsupported-gps-entry` 表示对应接口不可用；`no-visible-candidates` 表示 CPR 没有可见候选来源。GPS 的重试错误单独保存在 `api.lastLookupError`，原查找结果不受影响。

GPS 诊断接口还提供：

```js
await game.modules.get("gps-zh-aliases").api.refresh(); // 重新读取快照并构建计划
// 如需临时停止当前客户端的 GPS 别名补充：
game.modules.get("gps-zh-aliases").api.stop();
```

`stop()` 只影响当前客户端；重新载入会按模块启用状态再次初始化。通常仍建议通过模块启用状态与重载管理功能。

## 开发与验证

[设计](DESIGN.md) 描述目标体验；[协作约定](AGENTS.md) 规定开发要求；[架构说明](docs/architecture.md) 记录三个插件的接口和生命周期；[评估目录](docs/evaluations/) 保存观察证据。

```text
modules/
  zh-aliases-core/   # 可安装的共享基座
  cpr-zh-aliases/    # 可安装的 CPR 适配插件
  gps-zh-aliases/    # 可安装的 GPS 适配插件
  # 每个目录都有自己的 module.json 和 scripts/
tests/              # 核心、适配、生命周期、打包及可选本机源码回放
tools/             # 检查和三插件发行工具
docs/              # 架构与评估记录
```

使用 Node.js 22 或以上版本，无需安装 npm 依赖；打包及打包测试使用系统 `zip`、`unzip`。

```sh
npm test
npm run check
npm run package
```

可选的本机源码回放：

```sh
modules="$HOME/Library/Application Support/FoundryVTT/Data/modules"
CPR_MODULES_DIR="$modules" SLOW_INSERT_MODULE_DIR="$modules/slow-insert" npm test
```

`CPR_MODULES_DIR` 启用 CPR 自有查找及 Medkit→GPS 查找回放，读取已安装 CPR 的 source map 和汉化标题索引；`SLOW_INSERT_MODULE_DIR` 启用审核分组回放。三项均使用内存合集夹具，不连接世界；未提供路径时跳过对应回放。它们不能代替部署后的实机 Medkit 检查。

当前打包输出为：

- `dist/zh-aliases-core-v0.3.0.zip`
- `dist/cpr-zh-aliases-v0.3.0.zip`
- `dist/gps-zh-aliases-v0.3.0.zip`
