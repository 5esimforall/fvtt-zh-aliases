# MISC 中文别名适配 0.1.0

日期：2026-11-05。

## 变更与依据

新增独立的 `misc-zh-aliases`，通过 Truesight 名称 API v1 读取名称证据及审核分组，按类型、规则代际和 MISC 集成模式生成计划。只在原生查找缺少 MISC 候选时重试英文名，并只补回 MISC 来源；既有候选、显示名、角色卡、合集及自动化执行路径保持原样。接口与边界见 [架构说明](../architecture.md#misc-适配)，安装及目录范围见 [使用说明](../../README.md)。

本机只读核对 CPR 1.5.49 的 source map、MISC 1.6.14 的模块信息，以及简体中文 Babele 汉化包 1.0.202 的标题索引。译表包含 `Deflect Missiles → 拨挡飞弹`。CPR 的 Medkit 调用公开 `getAllAutomations`，其 MISC 分支调用闭包内的 `getMISCAutomation`；单独替换公开同名函数不足以接入 Medkit。

CPR 1.5.49 的 UA 职业特性分支把 UUID 写入候选类型，因此不能按普通特性类型命中。此适配不修补该上游路径，也不扩展 NPC 怪物身份匹配。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| `CPR_MODULES_DIR="$HOME/Library/Application Support/FoundryVTT/Data/modules" npm test` | 78 项通过，0 失败，0 跳过 |
| `npm run check` | 四个模块清单与全部 JavaScript 语法检查通过 |
| `npm run package` | 生成四个独立 ZIP，其中新增 `misc-zh-aliases-v0.1.0.zip` |
| `git diff --check` | 通过 |
| 部署后逐文件 SHA-256 对照 | 新模块全部 5 个文件与开发副本一致 |

MISC 对照使用 `Deflect Missiles`、`拨挡飞弹`、`拨挡飞弹 Deflect Missiles`。断言来源、文档身份、UUID、版本、优先级一致，以及输入显示名保持不变。测试包含两个独立客户端夹具、非 GM 入口、带路径前缀的 Foundry 路由、未知译名、冲突译名、已有原生别名、缺少 CPR/MISC 入口、隐藏合集、factory 排除、模式与规则代际隔离、加载失败、刷新和停止。

本机源码回放执行已安装 CPR 的 MISC 目录初始化、`getMISCAutomation` 与 `getAllAutomations`，读取真实译表，但合集和文档由内存夹具提供。两种规则代际的 Deflect Missiles 均为合成测试条目；这不表示实际 MISC 两个代际都提供该自动化。GPS 与 MISC 的两种包装顺序、各自停止及重新激活也通过夹具验证，CPR 既有结果保持不变。

## 部署与验收边界

已按用户授权新增运行目录：

```text
/Users/arctic/Library/Application Support/FoundryVTT/Data/modules/misc-zh-aliases
```

部署版本为 0.1.0。核对已安装依赖：Truesight 0.1.3、CPR 1.5.49、MISC 1.6.14；未覆盖这些依赖或 GPS 适配运行副本，也未改动世界数据和模块启用设置。

用户选择自行验收，因此未执行实机交互、服务重启或世界内启用。需重启 Foundry 服务以发现新模块，启用「MISC 中文别名 · Chinese Names for MISC」及其依赖，并重新载入客户端。实机验收应在相同类型和规则代际下对照三种名称的 MISC 来源及 UUID，并确认显示名不变；再检查其他客户端、重载及停用后的查找。只有英文对照本身存在 MISC 候选时，才期待中文对照补回相同候选。

## 0.1.1：修复 Foundry Collection 遍历

用户实机反馈双语名没有候选，随后提供报告：模块已启用，状态为 `source-error`，错误为 `TypeError: can't access property "visible", pack is undefined`。这证明 0.1.0 的初始化在建立名称快照时失败；此前普通 Map 夹具通过不能证明运行环境初始化成功。

只读核对本机 Foundry V13 的 `common/utils/collection.mjs`：Collection 虽继承 Map，默认迭代器却返回 `values()`。共享名称加载器将默认迭代结果解构成 `[id, pack]`，把 Compendium 的内容误当成键值对；MISC 文件夹上下文也有同样错误。

共享加载器改为一次读取 `packs.entries()`，索引与译表来源使用同一条目快照；MISC 文件夹上下文也显式使用 `entries()`。回归测试采用默认迭代值的 Foundry Collection 夹具，并用空的、可迭代 Compendium 精确复现 `pack.visible` 报错。修复前相关测试失败，修复后全部通过；原有隐藏合集排除、索引失败来源及三种名称对照仍成立。

本次完整测试共 83 项通过、0 跳过，检查、打包与差异空白检查均通过。另以本机安装的真实 Foundry Collection 类、已部署的 Truesight/MISC 代码和真实译表执行内存夹具冒烟测试：报告为 `ready`，英文、纯中文、双语名的 UUID 一致，显示名不变。这仍是源码回放，不是运行页面的实机查找结果。

部署仅覆盖运行目录中的 Truesight `scripts/names/corpus.mjs`、MISC `scripts/catalog.mjs` 与 MISC `module.json`，逐文件对照一致。MISC 版本为 0.1.1；基座运行清单与同期界面改动保持原样。部署前原文件备份在本机临时目录 `/tmp/misc-collection-fix.0K1o0J`。无需更改角色卡或世界数据；客户端强制刷新后再打开 Medkit，由用户继续实机验收。

## 用户验收与提交前复核

2026-11-05，用户反馈「刷新后可以找到了」，确认此前双语名称的实机未命中问题已消失。这是用户报告的实机结果；未追加声明其他客户端、全部三种名称或停用场景均已完成实机验收。

提交前共享基座已迁入同级 Truesight 独立仓库。MISC 插件、适配测试与本记录归于中文适配仓库；名称快照修复及其回归测试归于 Truesight 仓库。迁移后重新运行中文适配完整测试（含本机源码回放），41 项全部通过，检查与三个适配 ZIP 打包通过；Truesight 基座 44 项测试与检查全部通过，修复提交为 `497935e`。
