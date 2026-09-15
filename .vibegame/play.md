# Game Guide — 流年 · 雪中信

测试前必读。含键位、系统、测试场景（含 Runtime API 命令）与已知限制。

---

## How to Run

```bash
vibegame run . --headless --port 8780     # agent 验收用
vibegame run .                            # 人看
vibegame play --port 8780 activate
```

---

## Core Gameplay

叙事视觉小说 + 框架层轻探索。读一段故事 → 遇到一个没有正确答案的岔口 → 选择把「弦」拉紧 →
弦到临界时**断裂**或**触底反弹** → 进入下一章，世界更冷一档。全篇 9 章、607 个节点。

**Player Actions:**

- **推进文本**：点击任意位置 / 空格 / 回车。打字机进行中时按一下是「立刻显示全文」，再按才是推进
- **选择**：点击选项行，或用 ↑↓ 移动光标 + 空格确认。选项右下角显示代价提示（`靠近 · 快` / `退 · 见血`）
- **框架层行走**（序章）：方向键 / WASD 四向走动；走近浮动的「留印」图标后按空格触发；走满三个热点自动进入下一段
- **五行信小游戏**（第五章）：点选句子加入信纸，点已选的句子取消；**必须恰好 5 行**「寄出这封信」才可用
- **七日独处**（第七章）：点「第一天…第七天」按钮逐日推进
- **暂停菜单**：ESC → 继续 / 回想（最近 90 条）/ 留印 / 回标题
- **终局**：十字架「还回去」或「留在手里」，之后是统计面板

**Game Over Conditions:**

- **Win**：走完全部 9 章并做出终局选择 → 统计面板 → 回标题
- **Lose**：设计上不存在失败。没有错误结局。

**Controls**（`config/input-map.json`）:

| 动作 | 键 |
|---|---|
| `move_up/down/left/right` | ↑ ↓ ← → / W A S D |
| `confirm` | SPACE / ENTER |
| `cancel` | ESC |

---

## Systems

| 系统 | 落点 | 说明 |
|---|---|---|
| 「弦」张力 | `VnUi.setTension` + `Director._addTension` | 0…1.18 单一数值，UI 只给状态词（松弛/微紧/拉直/绷紧/将断），**不给数字** |
| 临界分流 | `Director._crit` | `crit: true` 按伸手(lean)/退开(retreat)比例分流；`crit: 'cold'/'warm'` 强制 |
| 留印 | `Director._grantImpression` | 26 枚；**跨周目累积**（`localStorage: liunian.snow.collection.v1`），部分只在单条分支上 |
| 存读档 | `Director._save/_loadRaw` | `localStorage: liunian.snow.save.v1`，每个节点自动写 |
| 行走 | `Stage.spawnWalker` + `Walker` | 4 行 × 4 帧精灵表（行序 `down/left/right/up`，见 `assets/char/walk-layout.json`） |
| 剧本解释 | `Director._runNode` | 节点字典见 `scripts/StoryData.js` 顶部注释 |

### 剧本节点字典

`bg` `tint` `snow` `string` `bust` `clearBusts` `letterbox` `curtain` `blackout`
`say`(name/text/style) `narr` `thought` `imp` `tension` `crit` `fx`
`card` `pause` `choice` `question`{options} `label` `goto`
`walk`(hotspots[].then) `letterGame` `sevenDays` `finalChoice` `stats` `end`

> ⚠️ `question` 的提示语是**字符串**，`options` 是它的**同级键**（不是 `question.options`）。
> 这个坑曾经让全部选项分支静默失效，`tools/audit_story.mjs` 现在会守住它。

---

## Test Scenarios

### Scenario 0: 静态审计（秒级，先跑这个）

```bash
node tools/audit_story.mjs
# 预期：IMPRESSIONS reachable: 26 / choices: 7 (19 options) / PROBLEMS: (none)

python tools/verify_assets.py
# 预期：ALL PASS
```

### Scenario 1: 启动 + 标题

```bash
vibegame run . --headless --port 8780 &
sleep 20
vibegame play --port 8780 activate
vibegame play --port 8780 snapshot
```
预期：`frame=0`，`nodes` 含 `Stage:Stage / VnUi:VnUi / Director:Director / Root`；
screen 上是标题「流年 / 雪中信」+ 四个按钮。控制台无 error。

### Scenario 2: 全流程自动通关（约 2.5 分钟）

```bash
vibegame play --port 8780 eval 'document.querySelectorAll("#vn-root .vn-title .menu .vn-btn")[0].dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); return 1;'
vibegame play --port 8780 eval 'const d=sceneTree.findByTag("director")[0]; const o=d.ui.say.bind(d.ui); d.ui.say=(x)=>o(Object.assign({},x,{speed:0})); d.setAuto(true,{pick:2,delay:25}); return 1;'
# 60s 后应到 ch7；120s 后应回到标题
vibegame play --port 8780 eval 'const d=sceneTree.findByTag("director")[0]; return d.runtimeState();'
vibegame play --port 8780 console -l error      # 预期：空
```
预期中途读数：`lean + retreat == 7`（7 个岔口都真的走过分支），`impressions` 20–26。

### Scenario 3: 停在某个选项看画面

```bash
vibegame play --port 8780 eval 'const d=sceneTree.findByTag("director")[0]; d.setAuto(true,{pick:0,delay:30,stopAtChoice:true}); return 1;'
# 45s 后应停在第一章的岔口，waiter=choice
vibegame play --port 8780 screenshot -o logs/shots/choice.png
```

### Scenario 4: 直接开某个小游戏看画面

```bash
vibegame play --port 8780 eval 'const d=sceneTree.findByTag("director")[0]; const m=await import("/scripts/StoryData.js"); d.ui.letterGame(m.CHAPTERS[5].nodes.find(n=>n.letterGame).letterGame); return 1;'
vibegame play --port 8780 eval 'const d=sceneTree.findByTag("director")[0]; const m=await import("/scripts/StoryData.js"); d.ui.sevenDays(m.CHAPTERS[7].nodes.find(n=>n.sevenDays).sevenDays); return 1;'
```

---

## Test Hooks（`Director` 上的测试钩子）

| 方法 | 用途 |
|---|---|
| `setAuto(on, {pick, delay, stopAtChoice})` | 自动推进 + 自动选第 `pick` 个选项；`stopAtChoice` 遇到岔口就停下 |
| `debugGoto(chapterIndex)` | 把章节游标设到某章开头（会与正在跑的循环竞争，只在 idle 时可靠） |
| `runtimeState()` | 快照：mode / chapter / node / tension / lean / retreat / impressions / finale / walker / busts |

⚠️ `ready()` **不能 await 标题循环** —— 标题循环是 `for(;;)` 永不返回，
await 它会让 `propagateReady` 挂住、引擎 boot 卡死、Runtime bridge 永远不注册。
标题循环由 `_boot()` 火后不管地启动。这个坑曾经让页面加载了全部资源却没有 runtime 连接。

---

## Known Issues / Limitations

- **无音频**：v1 全静默（素材里没有音源）。张力临界只有视觉表现。
- **移动端未适配**：1280×720 固定逻辑尺寸，FIT 缩放；触屏没做手势。
- **背景是 JPEG**：为把预加载从 48.9MB 压到 8.2MB，32 张背景从 PNG 转成 q90 渐进 JPEG。
  深色渐变区在高倍放大下能看出轻微色带。
- **架上层（frame 层）只有序章一段**：其余框架层内容以文本旁白呈现。再补行走段需要新的雪地场景图。
- **`assets/manifest-props.json` 的 251 个道具未接入**：已加工入库但游戏没用上（留给未来的室内布景）。
- 归一化：`bust-woman-*` 用的是 `bust-heroine-*` 的图（小说里"妇人"没有独立立绘），
  文案侧用「妇人」区分。

---

## Checkpoints

无 URL 参数式 checkpoint。跳章用 `debugGoto(i)`（见 Test Hooks）。
