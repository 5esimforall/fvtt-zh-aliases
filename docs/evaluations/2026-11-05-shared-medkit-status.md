# 共享查询与外部状态提示

日期：2026-11-05。发行版本：GPS 中文适配 0.3.3、MISC 中文适配 0.1.3。

## 问题与来源

用户报告同一双语物品在标题菜单中没有可用提示，打开 Medkit 后却出现 MISC 候选。只读核对本机 CPR 1.5.49 的 source map：菜单 `appendHeaderControl` 和 Tidy `renderTidyItemSheet` 通过公开的 `getPreferredAutomation` 查询；Medkit 的 `readyData` 通过公开的 `getAllAutomations` 查询。原首选函数内部调用闭包引用，绕过此前只包装公开候选函数的适配。

GPS 与 MISC 此前分别维护相同的名称重试与生命周期代码。这次将查询和计划生命周期提取为同一份维护源码，在构建时生成各自可独立安装的副本。两者在同一个 CPR 命名空间中注册提供方解析器，共用一个路由，不再叠加重复包装。实现职责、入口语义及优先级规则归于 [架构说明](../architecture.md#共享查询与外部状态)。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| `npm run build` | 两个插件的共享运行文件同步生成 |
| `CPR_MODULES_DIR="$HOME/Library/Application Support/FoundryVTT/Data/modules" npm test` | 56 项通过，0 失败，0 跳过 |
| `npm run check` | 清单、全部 JavaScript 语法及生成文件一致性检查通过 |
| `npm run package` | 三个独立适配 ZIP 生成，其中 GPS 0.3.3、MISC 0.1.3 使用新路由 |
| `git diff --check` | 通过 |

回归覆盖 GPS、MISC 独立启用及两种联合加载顺序；两个独立客户端夹具；英文、纯中文和双语名的文档身份、来源与 UUID 对照；显示名及标识不变；原生候选、已有别名与其他来源保留；优先级变化、同优先级顺序；已应用来源不被其他来源替换；未知或冲突译名不补候选；缺失入口、只读入口的安装回滚；刷新、停止、权限失效期间不发布旧结果；停止一方后另一方仍有效；最后一方停止后恢复原入口，后装的第三方包装仍保留。

共享路由测试从两个插件的实际生成文件分别导入，断言第二个注册者没有再包装入口，同一英文查找名在一次查询中仅重试一次。构建测试拒绝缺失或过期的生成文件，安装包测试核对 ZIP 内包含全部共享文件且内容与构建一致。

## 本机源码回放与验收边界

新增回放直接执行已安装 CPR 的 `getGPSAutomation`、`getMISCAutomation`、`getAllAutomations`、`getPreferredAutomation`、`getAppliedOrPreferredAutomation`、`itemUtils.getSource`，以及菜单、Tidy 状态函数和 Medkit 的 `readyData`。不运行自动化应用、宏或真实窗口。

回放使用真实汉化标题索引，以 `Deflect Missiles`、`拨挡飞弹`、`拨挡飞弹 Deflect Missiles` 对照。合集、文档、状态返回值与界面元素由内存夹具提供；两个提供方及两种规则代际的目录行均为合成测试数据，不表示真实上游目录都包含这些自动化。注册前双语名在内外查询均未命中，注册后内外取得一致候选，菜单和 Tidy 图标夹具变黄；停止后中文支持撤去而英文查找保留。这个结果属于源码回放，不是实机页面观察。

## 部署与用户验收

按用户要求，提交后仅部署 GPS、MISC 两个适配插件，移除被共享实现替代的旧 `scripts/lookup.mjs`；不更新 CPR、Truesight 或世界数据。部署目标为本机 Foundry 的 `Data/modules/gps-zh-aliases` 和 `Data/modules/misc-zh-aliases`，以提交源码和发行包做文件对照。

实机验收由用户执行。重新载入客户端后，在相同类型与规则代际下对照外部未应用状态提示和 Medkit 候选；用英文候选作为来源及 UUID 对照，再检查其他客户端、重载与单独停用。已应用条目的状态颜色仍由 CPR 原版本判断决定，不要求都显示为黄色。
