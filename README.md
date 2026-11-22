# 中文自动化名称适配

角色卡可以保留「迷踪步」「不屈」，也可以写完整双语名。这个工作区提供三个适配插件，依赖同级 [Truesight 项目](../truesight/README.md) 的共享条目聚类／名称解析基座，让 CPR Medkit 按有证据的英文名查找 CPR、GPS、MISC 自动化；物品显示名保持原样，是否应用候选仍由使用者决定。

## 三个适配插件与共享依赖

| 插件目录 / Foundry ID | 职责 | 必需依赖 |
| --- | --- | --- |
| `../truesight/module` / `truesight` | 聚类条目、解析来源、保存审核关系、整理名称证据与消歧 | Quick Insert |
| `modules/cpr-zh-aliases` / `cpr-zh-aliases` | 注册 CPR 自有自动化的名称映射 | 基座、CPR |
| `modules/gps-zh-aliases` / `gps-zh-aliases` | 补充 CPR Medkit 及外部状态的 GPS 中文名查找 | 基座、CPR、Gambit’s Premades |
| `modules/misc-zh-aliases` / `misc-zh-aliases` | 补充 CPR Medkit 及外部状态的 MISC 中文名查找 | 基座、CPR、Midi Item Showcase Community |

三个适配插件互不依赖。GPS 与 MISC 适配仍依赖 CPR，因为当前接入点是 CPR Medkit；它们不提供脱离 Medkit 的宏执行兼容。基座不依赖 Slow Insert、中文汉化包或自动化提供方，也不单独写入任何提供方的名称表。

目标环境为 Foundry V13、dnd5e。本机源码回放核对的 CPR 为 1.5.49，GPS 为 2.1.44，MISC 为 1.6.14，简体中文 Babele 汉化包（`dnd-simplified-chinese-babele-patch`）为 1.0.202。Slow Insert 0.6.9 与三个适配共同消费 Truesight API v1。插件读取汉化包的标题索引，发行包不复制第三方译表。

## 安装与使用

1. 在本项目运行 `npm run package`，取得三个适配插件 ZIP；在同级 `truesight` 项目运行 `npm run package`，取得基座 ZIP。也可以复制各项目的可安装模块源码目录，并按模块 ID 命名安装目录。
2. 将 `truesight` 和所需适配插件的文件夹放入 Foundry 用户数据的 `Data/modules/`。每个目录中的 `module.json` 必须直接位于该目录内。若只用 GPS 或 MISC 名称支持，无需安装 CPR 中文别名适配插件。
3. 重启 Foundry 服务发现新模块，在世界中启用基座、所需适配插件及表中依赖，重新载入客户端。GM 与玩家不必各自运行宏。
4. 打开物品的 CPR Medkit。CPR 可用 `Misty Step` 对照「迷踪步」及双语名；GPS 可用 `Indomitable` 对照「不屈」及双语名。MISC 可用 `Deflect Missiles` 对照「拨挡飞弹」和「拨挡飞弹 Deflect Missiles」。保持物品类型和规则代际相同，并在 CPR 的自动化来源配置中启用对应来源。

初始化完成后，未应用物品在标题菜单或 Tidy 标题栏中的可用提示与 Medkit 候选使用同一查询；已应用物品仍按 CPR 原状态着色。首选候选遵循 CPR 的来源优先级，已应用来源不会因优先级不同而自动切换。

首次使用、存储范围和完整 API 见 [Truesight 使用说明](../truesight/module/README.md)。打包不会安装或启用插件。

停用某个适配插件并重新载入，即可撤去该来源的新增查找支持；已经应用到角色卡的自动化不受影响。索引和译表按快照读取；Truesight 审核或条目变更会增量触发重建，普通新增、改名或删除条目期间继续保留上一份有效别名直到新计划完成原子切换，无需等待重载；权限变化、更换外部译表或 CPR 合集配置后可显式刷新或重新载入；若载入期间已打开 Medkit，待初始化完成后重新打开。

## 名称怎样匹配

1. **收集证据。** 每个适配插件请求基座读取可见 Item 合集索引、可见世界物品、有观察权限的世界角色物品及汉化标题索引。Babele ID 键通过当前索引还原原名。记录已知类型和规则代际，缺失的上下文保留为未限定证据。
2. **使用审核分组。** 名称层消费同一基座内聚类层的已审核成员关系，不反向参与聚类，也不按相似名称创建新组。未入组或审核失效的条目、世界物品按单条处理。接口不可用时停止该次构建，不降级为无审核模式。
3. **对各提供方独立判断。** 双语显示名只提取完整英文一侧，不从长短语截取法术名。未命中的弱推测不参与冲突判断，也不能单独产生别名；完整显示名的译表记录、原名及同组已确认的证据仍保留。只归一匹配时的大小写、空格和括号，不改写显示名。
4. **由适配层接入。** CPR 一方面维护跨类型、跨规则代际全局无歧义的显示名表（不覆盖已有外部映射），另一方面也接入共享查询路由，使全局重名但按规则代际、特性类别或条目证据（如 `identifier`、所属组与双语名）可消歧的能力能在 Medkit 与外部状态提示中准确命中。GPS 与 MISC 各自分类型、规则代际和特性类别解析，先保留原查找；只有原结果没有该来源候选时，才以只读英文名视图重试原生查找，并只补回该来源的结果。三者共用查询路由，向外部状态提供同一套候选；合并及同优先级处理规则见 [架构说明](docs/architecture.md#共享查询与外部状态)。

GPS 目录按 CPR 的 GPS 集成模式纳入常规、自制或第三方合集，未读取隐藏合集。适配插件不修改 GPS 内部目录；候选 UUID、版本、来源优先级及原生目录是否就绪仍由 CPR 决定。NPC 专属特性的怪物身份匹配不在 GPS 别名支持范围内，NPC 法术仍按普通法术路径处理。

MISC 目录按 CPR 的 `miscPremades` 模式选择：1 为常规，2 加入自制，3 加入 Unearthed Arcana，4 包含两者。适配排除隐藏合集及标记为 factory 的条目；自制内容限于上游使用的 Items 文件夹，UA 法术限于 Spells 文件夹。候选仍由 CPR 原生查找最终确认，不修改上游目录。CPR 1.5.49 的 UA 职业特性分支将 UUID 写入类型，无法按特性类型命中；适配保持这一原有结果，不修补上游行为。MISC 同样不处理 NPC 专属特性的怪物身份匹配。

### 查看冲突与未匹配的原因

在浏览器控制台读取已启用适配插件的报告：

```js
const cpr = game.modules.get("cpr-zh-aliases")?.api?.report;
const gps = game.modules.get("gps-zh-aliases")?.api?.report;
const misc = game.modules.get("misc-zh-aliases")?.api?.report;
console.log(cpr, gps, misc);

// CPR 使用一个全局计划；GPS 与 MISC 各自按规则代际和查找类型保存计划。
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

CPR 报告的 `registered` 是本次实际新增映射数；共享计划的 `planned` 是可用别名数。GPS 与 MISC 不注册全局映射，`scopes[].planned` 表示对应模式和上下文下的计划覆盖数，不是实际查找命中次数。`existing`、`unsupported` 分别记录已存在的名称和未命中目录的名称。GPS 或 MISC 模式切换后可增加新的作用域报告，各作用域数量可能重复，不能相加当作独立条目数。

`source-error` 表示当前构建失败，`source` 指明译表、索引或 `truesight`。CPR 不写入部分结果；GPS 与 MISC 在构建失败后仅保留原查找。`unsupported-core`、`unsupported-cpr`、`unsupported-gps-entry`、`unsupported-misc-entry` 表示对应接口不可用；`no-visible-candidates` 表示 CPR 没有可见候选来源。GPS 与 MISC 的重试错误单独保存在 `api.lastLookupError`，原查找结果不受影响。

GPS 与 MISC 均提供以下诊断接口（MISC 使用 `misc-zh-aliases`）：

```js
await game.modules.get("gps-zh-aliases").api.refresh(); // 重新读取快照并构建计划
// 如需临时停止当前客户端的 GPS 别名补充：
game.modules.get("gps-zh-aliases").api.stop();
```

`stop()` 只影响当前客户端；重新载入会按模块启用状态再次初始化。通常仍建议通过模块启用状态与重载管理功能。

## 开发与验证

[设计](DESIGN.md) 描述目标体验；[协作约定](AGENTS.md) 规定开发要求；[架构说明](docs/architecture.md) 记录适配插件的接口和生命周期；[评估目录](docs/evaluations/) 保存观察证据。

```text
shared/             # CPR/GPS/MISC 查询与生命周期的唯一维护源码
modules/
  cpr-zh-aliases/    # 可安装的 CPR 适配插件
  gps-zh-aliases/    # 可安装的 GPS 适配插件
  misc-zh-aliases/   # 可安装的 MISC 适配插件
  # 每个目录都有自己的 module.json 和 scripts/
  # 各适配的 scripts/shared/ 由构建生成，勿直接修改
tests/              # 适配、生命周期、打包及可选本机源码回放
tools/             # 检查和独立插件发行工具
docs/              # 架构与评估记录
```

集成测试需要同级 `../truesight/module/` 源码；本项目不打包或复制基座。基座的独立测试、检查与打包在其项目内执行。

使用 Node.js 22 或以上版本，无需安装 npm 依赖；打包及打包测试使用系统 `zip`、`unzip`。

修改 `shared/` 后先运行构建；测试和检查会拒绝过期的生成副本。打包也会自动构建共享代码，三个 ZIP 仍可独立安装。

```sh
npm run build
npm test
npm run check
npm run package
```

可选的本机源码回放：

```sh
modules="$HOME/Library/Application Support/FoundryVTT/Data/modules"
CPR_MODULES_DIR="$modules" npm test
```

`CPR_MODULES_DIR` 启用 CPR 自有查找、Medkit→GPS/MISC、标题菜单、Tidy 状态及已应用／首选查询回放，读取已安装 CPR 的 source map 和汉化标题索引。这些回放均使用内存合集夹具，不连接世界；未提供路径时跳过对应回放。它们不能代替部署后的实机 Medkit 检查。

当前打包输出为：

- `dist/cpr-zh-aliases-v0.3.3.zip`
- `dist/gps-zh-aliases-v0.3.4.zip`
- `dist/misc-zh-aliases-v0.1.4.zip`
