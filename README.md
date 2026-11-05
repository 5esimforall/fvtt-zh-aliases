# CPR 中文别名

角色卡可以写「迷踪步」，也可以写「迷踪步 Misty Step」。这个 Foundry VTT 模块把有译名依据的显示名注册到 CPR 的名称表，让 Medkit 按 `Misty Step` 查找自动化。物品名保持原样，是否应用候选仍由使用者决定。

## 安装与使用

目标环境为 Foundry V13、dnd5e 和 CPR；本机核对的 CPR 为 1.5.49，简体中文 Babele 汉化包（`dnd-simplified-chinese-babele-patch`）为 0.5.923。模块使用该汉化包的标题索引，不随发行包复制第三方译表。

1. 解压发行 ZIP，把其中的 `cpr-zh-aliases` 文件夹放入 Foundry 用户数据的 `Data/modules/`。确认 `module.json` 直接位于该文件夹内，重启 Foundry 服务以发现新模块。
2. 在世界中启用 Slow Insert、CPR、简体中文 Babele 汉化包及各自依赖，再启用 **CPR 中文别名**，重新载入客户端。GM 与玩家不必各自运行宏。
3. 打开法术或特性的 CPR Medkit。例如，可用同一角色、同一规则代际的 `Misty Step` 对照「迷踪步」与「迷踪步 Misty Step」的 CPR 候选。若载入期间已经打开 Medkit，待别名注册完成后重新打开。

停用模块并重新载入即可回到原有查找；已经应用到角色卡的自动化不受影响。更换汉化包、权限或 CPR 合集配置后，也请重新载入。

## 名称怎样匹配

以「剑刃防护」为例：不全包写作 `剑刃防护 blade ward`，玩家手册写作 `剑刃防护 Blade Ward`，CPR 的英文查找名是 `Blade Ward`。模块按以下步骤决定哪些显示名可以交给 CPR。

1. **读名称证据。** 每个客户端在 `cprReady` 后读取可见 Item 合集索引、可见世界物品和有观察权限的世界角色物品。汉化包的 `translation/cn/titles.json` 提供 dnd5e、玩家手册、CPR 动作等基础译表，以及当前可见 Item 合集的其他译表。ID 键需从可见索引还原原名。
2. **按审核记录聚类。** Slow Insert 是必需依赖，不限定其模块版本。别名模块直接使用它的合集分组目录，保留 UUID、类型、规则代际、来源、包版本和修改时间等校验。法术还校验环阶和学派。侧栏过滤、首选项不决定 CPR 匹配。目录中未入组或审核失效的条目，以及世界物品，按单条处理。若分组接口不可用，则停止注册，不降级为无聚类模式。
3. **推测英文查找名。** 读取双语显示名中完整的英文一侧，可识别大小写、空格及中英文括号差异，并与可见 CPR 查找名称核对。匹配后注册物品**原样显示名**，不改大小写、不写回物品。不从更长的英文短语里截取已知法术名。纯中文成员可使用译表、Babele 原名或同组已确认的英文名。没有任何英文依据时跳过。
4. **先校验，再注册。** 同组成员的英文、译表、已有关联宏和既有映射必须指向同一查找名。不同组需要写同一个显示名时也必须一致，因为 CPR 只有一张名称表。不一致就报告错误，不为受影响的组写入成员别名；其他组继续。既有映射不覆盖，角色卡和合集不修改。CPR 仍按物品类型和规则代际选具体候选。

索引是客户端载入时的快照。新增或改名后，若显示名此前未注册，可重新载入。这里只处理 CPR 的名称入口，不改变怪物身份、第三方查找或宏执行时的逻辑。

### 查看冲突与未匹配的原因

在浏览器控制台查看本客户端报告：

```js
const report = game.modules.get("cpr-zh-aliases").api.report;
console.log(report.status, report.grouping, report.registered);
report.clusterErrors?.filter(error =>
  error.members.some(member => member.displayName.includes("剑刃防护")));
```

完成检查后，`grouping` 为 `slow-insert`。`ready` 表示注册完成；`cluster-conflict` 表示检查完成但有组被拒绝，控制台同时输出错误。`clusterErrors` 包含组键、成员显示名、UUID、候选查找名及依据。独立译表中的同名歧义或原名缺失记录在 `conflicts`；既有映射和未找到 CPR 查找名分别计入 `existing`、`unsupported`。

`source-error` 表示本次未注册任何别名；若 `source` 为 `slow-insert`，请检查该模块是否启用、分组接口是否可用，否则检查译表与合集索引。`unsupported-cpr` 表示 CPR 入口不兼容；`no-visible-candidates` 表示没有可用候选索引。

## 开发与验证

[设计](DESIGN.md) 描述目标体验和兼容边界；[协作约定](AGENTS.md) 规定开发与验证要求。`module/` 是可安装内容，`tests/` 是离线测试，`tools/` 是发行工具。使用 Node.js 22 或以上版本，无需安装 npm 依赖。

```sh
npm test
npm run check
npm run package
```

可选的本机回放通过环境变量指定可信的 Foundry 模块目录：

```sh
modules="$HOME/Library/Application Support/FoundryVTT/Data/modules"
CPR_MODULES_DIR="$modules" SLOW_INSERT_MODULE_DIR="$modules/slow-insert" npm test
```

两个路径分别启用 CPR 与 Slow Insert 回放：前者用已安装 CPR 的查找函数及实际汉化索引对照中英文候选；后者用已安装 Slow Insert 的分组函数和审核登记验证「剑刃防护」的两代成员。未提供某一路径仅跳过相应回放。两者均使用内存合集夹具，不连接或修改世界。

打包命令使用系统 `zip`，生成 `dist/cpr-zh-aliases-v0.2.0.zip`，不安装、不启用模块。
