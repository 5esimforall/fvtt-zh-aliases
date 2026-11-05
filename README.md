# CPR 中文别名

角色卡可以写「迷踪步」，也可以写「迷踪步 Misty Step」。这个 Foundry VTT 模块把有译名依据的显示名注册到 CPR 的名称表，让 Medkit 按 `Misty Step` 查找自动化。物品名保持原样，是否应用候选仍由使用者决定。

## 安装与使用

目标环境为 Foundry V13、dnd5e 和 CPR；本机核对的 CPR 为 1.5.49，简体中文 Babele 汉化包（`dnd-simplified-chinese-babele-patch`）为 0.5.923。模块使用该汉化包的标题索引，不随发行包复制第三方译表。

1. 解压发行 ZIP，把其中的 `cpr-zh-aliases` 文件夹放入 Foundry 用户数据的 `Data/modules/`。确认 `module.json` 直接位于该文件夹内，重启 Foundry 服务以发现新模块。
2. 在世界中启用 CPR、简体中文 Babele 汉化包及各自依赖，再启用 **CPR 中文别名**，重新载入客户端。GM 与玩家不必各自运行宏。
3. 打开法术或特性的 CPR Medkit。例如，可用同一角色、同一规则代际的 `Misty Step` 对照「迷踪步」与「迷踪步 Misty Step」的 CPR 候选。若载入期间已经打开 Medkit，待别名注册完成后重新打开。

停用模块并重新载入即可回到原有查找；已经应用到角色卡的自动化不受影响。更换汉化包、权限或 CPR 合集配置后，也请重新载入。

## 匹配范围

- 每个客户端在 `cprReady` 后读一次汉化包的 `translation/cn/titles.json`。取基础译表（dnd5e、玩家手册和 CPR 动作）及标题索引中当前可见的其他 Item 合集，不把 Actor 名称、文件夹和规则正文当作物品译名。
- 英文名与译名的对应来自标题记录。若键为文档 ID，只从可见来源合集的索引取原名；无法确认的记录不能证明纯中文名唯一。双语形式为「译名 + 一个半角空格 + 英文名」，按完整名称匹配，不猜缩写或任意英文片段。
- 先检查译名冲突，再核对英文名是否出现在当前可见的 CPR 查找用合集中（包括索引别名或条目关联的宏名）。同一译名对应多个英文名时，跳过该纯中文名；能唯一确认的完整双语名仍可用。已有的名称映射和能直接查到的名称优先。
- 只补充客户端的 `CONFIG.chrisPremades.renamedItems`。CPR 继续处理物品类型、规则代际、职业和怪物文件夹等条件；注册了别名不等于每种情境都有可用自动化。本模块不补齐怪物身份，不修改第三方自动化来源或宏执行时的名称判断。

### 查看未匹配的原因

在浏览器控制台查看本客户端的注册报告：

```js
const report = game.modules.get("cpr-zh-aliases").api.report;
console.log(report);
report.conflicts?.find(entry => entry.displayName === "迷踪步");
```

`ready` 表示注册完成。冲突项含候选英文名及「合集#译表键」；`unknown-original` 表示至少一项无法确定原名。`existing` 计数表示保留现有查找，`unsupported` 表示未确认可用的 CPR 英文查找名。若为 `source-error`，请检查索引读取错误及汉化包结构；为避免漏判冲突，这次不会注册部分结果。`unsupported-cpr` 表示 CPR 入口不兼容，`no-visible-candidates` 表示当前客户端没有可用的候选索引。

## 开发与验证

[设计](DESIGN.md) 描述目标体验和兼容边界；[协作约定](AGENTS.md) 规定开发与验证要求。`module/` 是可安装内容，`tests/` 是离线测试，`tools/` 是发行工具。使用 Node.js 22 或以上版本，无需安装 npm 依赖。

```sh
npm test
npm run check
npm run package
```

可选的本机回放通过环境变量指定可信的 Foundry 模块目录：

```sh
CPR_MODULES_DIR="$HOME/Library/Application Support/FoundryVTT/Data/modules" npm test
```

该测试从已安装 CPR 的 source map 提取查找函数，读取实际汉化标题索引，在内存合集夹具中比较法术与职业特性的候选。未提供路径时仅跳过这项回放。离线测试不连接 Foundry 世界，不代替实机 Medkit 验证。

打包命令使用系统 `zip`，生成 `dist/cpr-zh-aliases-v0.1.0.zip`，不安装、不启用模块。
