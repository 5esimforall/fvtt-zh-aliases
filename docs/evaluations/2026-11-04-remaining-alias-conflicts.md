# 未解决的中文别名冲突评估记录

## 目的与状态

修复“从双语显示名提取的英文未命中 CPR，仍参与冲突判断”的问题后，需要区分剩余的 CPR 查找名分歧、原名证据分歧和证据缺失。本记录保存本次实机报告中的全部 56 条拒绝记录，供后续逐项核对。

**状态：待核对，暂不调整匹配逻辑。** 本次归档只新增评估文档，不修改代码、映射、角色、合集或已应用的自动化。产品目标与兼容边界见 [DESIGN.md](../../DESIGN.md)，报告字段的使用说明见 [README.md](../../README.md#查看冲突与未匹配的原因)。

## 观察范围与取证

- 观察日期：2026-11-04（America/Detroit）；完整诊断日志时间为 22:26 左右，即 2026-11-05 03:26 UTC。
- 运行环境：本机 Foundry，`arenae` 世界，同一 GM 浏览器客户端；中文别名模块运行副本为 `0.2.1`。模块版本与物品的 2014 / 2024 规则代际分别记录，不混用。
- 数据来源：通过浏览器 MCP 读取本客户端 `cpr-zh-aliases` 的 `api.report.clusterErrors` 所对应的完整 JSON 诊断日志。这是实机观察，不是离线夹具推演。
- 取证方式：经用户授权，临时将每条 `clusterErrors` 序列化输出到控制台，重载 MCP 客户端后读取。读取完成后恢复运行副本的原有日志代码，校验其与开发源码一致，并再次重载客户端。
- 本次未执行自动化应用，也未重新验证其他客户端、停用后的查找或每条记录的 Medkit 候选。这里保存的是冲突报告，不能据此认定候选之间的语义等价或自动化实现相同。

本记录列出每条报告涉及的全部不同成员显示名和全部候选名称，并摘录已核对的关键来源；未附完整原始 JSON，也未逐项展开所有成员 UUID。表中的“报告索引”是本次 `clusterErrors` 数组的零基索引，仅用于对应这次快照，不是稳定的物品标识。

## 计数口径

| 报告分类 | 字段值 | 数量 |
| --- | --- | ---: |
| 多个可见 CPR 查找名 | `multiple-cpr-targets` | 3 |
| 原名或映射证据不一致，且不足两个可见 CPR 目标 | `conflicting-originals` | 51 |
| 原名或映射证据缺失 | `unknown-original` | 2 |
| 合计 | | 56 |

修复前同客户端报告为 192 条，修复后为 56 条，减少 136 条（约 71%）。这只是拒绝记录数量的变化，不代表新增了 136 项自动化或解决了 136 个独立能力。

每条记录对应一个被拒绝的分组或由相同显示名连接的多个分组。同一能力的不同显示名可能分别计数，例如“圣疗”与“圣疗 Lay on Hands”占两条。表中的英文保留报告原样，表示候选名称证据；`↔` 仅分隔相互不一致的候选，不表示它们可以互换。`null` 表示缺少有效候选，不是英文名称。

## 多个可见 CPR 查找名：3 条

| # | 报告索引 | 成员显示名 | 候选查找名 |
| --- | ---: | --- | --- |
| 1 | 0 | 圣疗 Lay on Hands | `Lay on Hands` ↔ `Lay On Hands` |
| 2 | 16 | 圣疗 | `Lay on Hands` ↔ `Lay On Hands` |
| 3 | 55 | 无甲防御 (野蛮人) Unarmored Defense | `Unarmored Defense` ↔ `Unarmored Defense (Barbarian)` |

### 关键来源

“圣疗”的两条记录都包含 `dnd-players-handbook.classes#Lay on Hands`、`dnd5e.classes24#Lay on Hands` 和 `dnd5e.classfeatures#Lay on Hands` 的译表证据。双语显示名还出现在世界角色物品、玩家手册、系统 SRD 和不全包成员中；纯中文显示名出现在 `aaatransfer.classes`、`dnd5e-collection-2024.phb-content` 和 `local-native-classes.pugilist2024` 的成员中。报告为同一批名称证据解析出了两个大小写不同的 CPR 查找名，不能据此推断译表本身写了两个不同原名。

“无甲防御”的成员是 `Compendium.dnd5e_classpack.class-abilityphb.Item.yJmyesVEgGP7ZXr1`。其双语显示名提供 `Unarmored Defense`，译表 `dnd5e.classfeatures#Unarmored Defense (Barbarian)` 提供 `Unarmored Defense (Barbarian)`。两个名称均被当前报告归为可见 CPR 查找名；是否可归一仍待核对具体查找结果。

## 原名或映射证据不一致：51 条

同一行的多个显示名属于同一条报告；英文、纯中文和双语形式均按实机报告保留。

| # | 报告索引 | 成员显示名 | 候选名称 |
| --- | ---: | --- | --- |
| 1 | 1 | Etherealness；以太化；以太化 Etherealness | `Ephemeral` ↔ `Etherealness` |
| 2 | 2 | Floating Disk；谭森浮碟术 Tenser's Floating Disk；谭森浮碟术；谭森浮碟术 Floating Disk | `Floating Disk` ↔ `Tenser's Floating Disk` |
| 3 | 4 | 喙啄；Beak；Beaks | `Beak` ↔ `Beaks` |
| 4 | 5 | 啃咬；Bite；Bites | `Bite` ↔ `Bites` |
| 5 | 6 | 爪击；Claw | `Claw` ↔ `Claws` |
| 6 | 7 | 纠缠绳；Entangling Rope | `Entangling Rope` ↔ `Rope of Entanglement` |
| 7 | 8 | 跳跃；Leap | `Jump` ↔ `Leap` |
| 8 | 9 | 猛砸；Pummel | `Pummel` ↔ `Thrash` |
| 9 | 10 | 机敏；Reactive | `Agile` ↔ `Reactive` |
| 10 | 11 | 投石；Rock | `Boulder` ↔ `Rock` |
| 11 | 12 | 施法；Spellcasting | `Cast a Spell` ↔ `Spellcasting` |
| 12 | 13 | 践踏；Trample | `Stomp` ↔ `Trample` |
| 13 | 14 | 荆棘之鞭 Thorn Lash；Thorn Whip；荆棘之鞭 Thorn Whip；荆棘之鞭 | `Thorn Lash` ↔ `Thorn Whip` |
| 14 | 15 | 暗杀 | `Assasinate` ↔ `Assassinate` |
| 15 | 17 | 魔邓肯忠犬 Mordenkainen's Faithful Hound；魔邓肯忠犬 | `Faithful Hound` ↔ `Mordenkainen's Faithful Hound` |
| 16 | 18 | 坠落 | `Drop` ↔ `Fall` |
| 17 | 19 | 恐惧灵光 | `Fear Aura` ↔ `Horror Nimbus` |
| 18 | 20 | 地狱复苏 | `Hellish Rejuvenation` ↔ `Hellish Restoration` |
| 19 | 21 | 恐惧面容 | `Horrific Visage` ↔ `Horrifying Visage` |
| 20 | 22 | 尖啸 | `Howl` ↔ `Shriek` |
| 21 | 23 | 心灵震爆 | `Mind Blast` ↔ `Mind Burst` |
| 22 | 24 | 粘液之云 | `Mucous Cloud` ↔ `Mucus Cloud` |
| 23 | 25 | 光耀打击 | `Radiant Strike` ↔ `Radiant Strikes` |
| 24 | 26 | 变形 | `Change Shape` ↔ `Shape-Shift` |
| 25 | 27 | 触须 | `Tentacle` ↔ `Tentacles` |
| 26 | 28 | 吸血鬼弱点 | `Vampire Weakness` ↔ `Vampire Weaknesses` |
| 27 | 29 | 白银渡鸦 | `Bronze Griffon` ↔ `Silver Raven` |
| 28 | 30 | 保健护符 | `Periapt of Health` ↔ `Periapt of Wound Closure` |
| 29 | 31 | 高档服装 | `Clothes, Fine` ↔ `Fine Clothes` |
| 30 | 32 | 弩矢匣 | `Case, Crossbow Bolt` ↔ `Crossbow Bolt Case` |
| 31 | 33 | 旅行服装 | `Clothes, Traveler's` ↔ `Traveler's Clothes` |
| 32 | 34 | 玻璃瓶 | `Bottle, Glass` ↔ `Glass Bottle` |
| 33 | 35 | 投石索弹丸 | `Bullets, Sling` ↔ `Sling Bullet` |
| 34 | 36 | 侏儒狡黠 | `Gnome Cunning` ↔ `Gnomish Cunning` |
| 35 | 37 | 吐息武器 | `Breath Weapon` ↔ `Breath Weapons` |
| 36 | 38 | 飞檐走壁 | `Acrobatic Movement` ↔ `Step of the Wind` |
| 37 | 39 | 幸运 | `Luck` ↔ `Lucky` |
| 38 | 40 | 弩矢 | `Bolts` ↔ `Crossbow Bolt` |
| 39 | 41 | 伏击 | `Ambush` ↔ `Ambusher` |
| 40 | 42 | 地图或卷轴匣 | `Case, Map or Scroll` ↔ `Map or Scroll Case` |
| 41 | 43 | 念刃 | `Psychic Blade` ↔ `Psychic Blades` |
| 42 | 44 | 附盖提灯 | `Hooded Lantern` ↔ `Lantern, Hooded` |
| 43 | 45 | 牛眼提灯 | `Bullseye Lantern` ↔ `Lantern, Bullseye` |
| 44 | 46 | 原初学识 | `Primal Knowledge` ↔ `Primal Lore` |
| 45 | 47 | 钢铁意志 | `Iron Mind` ↔ `Steel Will` |
| 46 | 48 | 箭矢 | `Arrow` ↔ `Arrows` |
| 47 | 49 | 铁钉 | `Iron Spike` ↔ `Spikes, Iron` |
| 48 | 50 | 狂暴 | `Berserk` ↔ `Rage` |
| 49 | 51 | 长袍 | `Robe` ↔ `Robes` |
| 50 | 52 | 铁壶 | `Iron Pot` ↔ `Pot, Iron` |
| 51 | 53 | 凶蛮重击 Relentless Rage | `Brutal Critical` ↔ `Relentless Rage` |

## 原名或映射证据缺失：2 条

| # | 报告索引 | 成员显示名 | 候选名称 |
| --- | ---: | --- | --- |
| 1 | 3 | Prestidigitation；魔法伎俩 Prestidigitation；魔法伎俩 | `Prestidigitation` ＋ `null` |
| 2 | 54 | 结社法术 | `Circle Spells` ＋ `null` |

### 关键来源

“魔法伎俩”的 `null` 候选来自以下三条译表证据：

- `dnd-players-handbook.spells#Prestidigitation`
- `dnd5e.spells#Prestidigitation`
- `dnd5e.spells24#Prestidigitation`

有效的 `Prestidigitation` 候选来自 `aaatransfer.classes`、`dnd-players-handbook.spells`、`dnd5e.spells` 和 `dnd5e.spells24` 的合集成员。报告连接了 `spell:2014:prestidigitation` 与 `spell:2024:prestidigitation` 两个组；这是共用名称键的冲突检查，不代表两代法术被判定为同一实现。仅凭 `null` 尚不能确定缺失发生于原名读取还是既有映射解析。

“结社法术”的成员是 `Compendium.dnd5e_classpack.class-abilityphb.Item.jQTXDqRdk7L4u3fy`。有效候选来自 `dnd-tashas-cauldron.tcoe-character-options#tcoewilSpells000` 和 `dnd5e.classfeatures#Circle Spells`；`null` 候选来自 `dnd-tashas-cauldron.tcoe-character-options#tcoestaSpells000`。

## 待核对事项

观察到的差异包含大小写、单复数、词序、拼写及不同英文名称。上述形态只帮助安排核对，不能直接决定合并；例如“白银渡鸦”的候选包含 `Bronze Griffon`，“凶蛮重击 Relentless Rage”的候选包含 `Brutal Critical`，需要回到具体来源确认对应关系。

后续若获准处理，应逐项追溯译表、成员与既有映射，比较同类型、同规则代际下英文对照的 CPR 来源和条目标识，再决定问题属于名称归一、译表对应、分组关系还是缺失证据。本记录暂不指定修复结论，也不新增候选优先级或放行规则。
