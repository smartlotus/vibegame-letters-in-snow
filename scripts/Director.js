import { Node } from '/engine/Node.js'
import { CHAPTERS, IMPRESSIONS, FINALES, CLOSING } from './StoryData.js'

const SAVE_KEY = 'liunian.snow.save.v1'
const COLLECTION_KEY = 'liunian.snow.collection.v1'
const HISTORY_CAP = 240
const END = Symbol('chapter-end')

/**
 * Director — runs the story.
 *
 * Owns the state machine (chapter / node cursor, the 弦 tension value, the
 * collected 留印, the recall log, the ending) and drives Stage (world) plus
 * VnUi (interface). Node kinds are documented in StoryData.js.
 */
export default class Director extends Node {
  ready() {
    this.stage = this.getNode('../Stage')
    this.ui = this.getNode('../VnUi')
    this.sceneTree.scriptClasses.Director = Director

    this.mode = 'idle'          // idle | story | walk | overlay
    this._walkQueue = []
    this._walkSeq = 0
    this._autoParkedWalk = -1
    this._paused = false
    this._abort = false
    this._labels = new Map()
    this._inputCd = 0

    this._resetState()
    this.ui.on('ui_pause', () => this._openPause())

    // IMPORTANT: the title loop never finishes, so it must NOT be awaited
    // here. `ready()` is awaited by the engine's propagateReady(); awaiting an
    // endless loop would stall boot and the runtime bridge would never
    // register. Fire it off and return immediately.
    this._boot().catch((err) => this._fail(err))
  }

  async _boot() {
    try {
      await this._titleLoop()
    } catch (err) {
      this._fail(err)
    }
  }

  _fail(err) {
    // Surface story-runner faults in the Runtime API console instead of
    // letting them disappear into an unhandled rejection.
    console.error('[Director] ' + (err && err.stack ? err.stack : String(err)))
    this.ui?.toast('故事走岔了 —— 详见控制台', 6000)
  }

  _resetState() {
    this.state = {
      chapter: 0,
      node: 0,
      tension: 0,
      peak: 0,
      lean: 0,
      retreat: 0,
      impressions: [],
      history: [],
      finale: null,
    }
    this._abort = false
  }

  /* ================================================================== *
   *  input
   * ================================================================== */

  update(dt) {
    const input = this.sceneTree.inputMap
    if (!input) return
    this._inputCd = Math.max(0, this._inputCd - dt)

    if (input.isPressed('cancel')) {
      this._openPause()
      return
    }

    if (this.mode === 'walk') {
      const w = this.stage.walker
      const hs = w?.activeHotspot() || null
      this.ui.whisper(hs ? '按 空格 查看' : '')
      if (input.isPressed('confirm') && hs) {
        if (!this._walkQueue.some((q) => q.id === hs.id)) this._walkQueue.push(hs)
      }
      return
    }

    if (this.ui.showingTitle()) {
      if (this._inputCd > 0) return
      if (input.isPressed('move_up')) { this.ui.titleNav(-1); this._inputCd = 0.16 }
      else if (input.isPressed('move_down')) { this.ui.titleNav(1); this._inputCd = 0.16 }
      else if (input.isPressed('confirm')) { this.ui.titleResolve(); this._inputCd = 0.25 }
      return
    }

    if (this._paused) {
      if (this._inputCd > 0) return
      if (input.isPressed('move_up')) { this.ui.nav(-1); this._inputCd = 0.16 }
      else if (input.isPressed('move_down')) { this.ui.nav(1); this._inputCd = 0.16 }
      else if (input.isPressed('confirm')) { this.ui.menuResolve(); this._inputCd = 0.25 }
      return
    }

    if (this.mode !== 'story') return
    if (this._inputCd > 0) return

    const w = this.ui._waiter
    if (w && w.kind === 'choice') {
      if (input.isPressed('move_up')) { this.ui.nav(-1); this._inputCd = 0.16 }
      else if (input.isPressed('move_down')) { this.ui.nav(1); this._inputCd = 0.16 }
      else if (input.isPressed('confirm')) { this.ui.press(); this._inputCd = 0.18 }
      return
    }
    if (input.isPressed('confirm')) { this.ui.press(); this._inputCd = 0.16 }
  }

  /* ================================================================== *
   *  title
   * ================================================================== */

  async _titleLoop() {
    this.mode = 'idle'
    this.ui.showPauseButton(false)
    this.ui.showString(false)
    this.ui.hideDialog()
    this.ui.clearBusts()
    this.stage.despawnWalker()
    this.stage.setBackground('bg-avenue-night', { immediate: true })
    this.stage.tintTo(0x0a1220, 0.45, 900)
    this.ui.snow('on')
    await this.ui.curtain(false, 900)
    this._save()   // keep a save slot alive once the game has booted

    for (;;) {
      const raw = this._loadRaw()
      const action = await this.ui.title({
        hasSave: !!raw,
        canContinue: !!raw,
        impressions: this._collection().size,
        total: IMPRESSIONS.length,
      })

      if (action === 'impressions') {
        await this.ui.impressions({ list: IMPRESSIONS, owned: this._collection() })
        continue
      }
      if (action === 'about') {
        await this.ui.menu({
          title: '关于这场雪',
          items: [
            { id: 'a1', label: '改编自小说《流年》', sub: '双层叙事 · 全九章', disabled: true },
            { id: 'a2', label: '一根弦，两个人', sub: '伸手与退开都会让弦更紧', disabled: true },
            { id: 'a3', label: '没有正确答案', sub: '所有分支都通向同一个冬天', disabled: true },
            { id: 'back', label: '回去' },
          ],
        })
        continue
      }
      if (action === 'continue') {
        const saved = this._loadRaw()
        if (!saved) continue
        this.state = { ...this.state, ...saved }
        this._abort = false
        this.ui.hideTitle()
        await this.ui.pause(950)
        await this._play(saved.chapter ?? 0, saved.node ?? 0)
        continue
      }
      if (action === 'new') {
        this._resetState()
        this._clearSave()
        this.ui.hideTitle()
        await this.ui.pause(950)
        await this._play(0, 0)
        continue
      }
    }
  }

  /* ================================================================== *
   *  play loop
   * ================================================================== */

  async _play(fromChapter = 0, fromNode = 0) {
    this.mode = 'story'
    this.ui.showPauseButton(true)
    this.ui.showString(false)
    this.ui.snow('on')
    await this.ui.curtain(false, 800)

    for (let c = fromChapter; c < CHAPTERS.length; c++) {
      if (this._abort) return this._toTitle()
      const ch = CHAPTERS[c]
      this.state.chapter = c
      this.state.node = c === fromChapter ? fromNode : 0
      this._labels = this._indexLabels(ch.nodes)

      while (this.state.node < ch.nodes.length) {
        if (this._abort) return this._toTitle()
        const node = ch.nodes[this.state.node]
        const jump = await this._runNode(node)
        this.state.node = (jump != null) ? jump : this.state.node + 1
        this._save()
      }
    }
    if (this._abort) return this._toTitle()
    return this._epilogue()
  }

  _indexLabels(nodes) {
    const m = new Map()
    nodes.forEach((n, i) => { if (n.label) m.set(n.label, i) })
    return m
  }

  async _runSequence(nodes) {
    const labels = this._indexLabels(nodes)
    const savedLabels = this._labels
    const savedNode = this.state.node
    this._labels = labels
    let i = 0
    while (i < nodes.length) {
      if (this._abort) break
      const jump = await this._runNode(nodes[i])
      i = (jump != null) ? jump : i + 1
    }
    this._labels = savedLabels
    this.state.node = savedNode
  }

  /* ================================================================== *
   *  node interpreter
   * ================================================================== */

  async _runNode(n) {
    if (!n || typeof n !== 'object') return null

    // --- scene / atmosphere ---
    if (n.bg) this.stage.setBackground(n.bg, { fade: n.fade ?? 900, immediate: !!n.immediate })

    if (n.tint != null) this.stage.tintTo(n.tint, n.alpha ?? 0.3, n.duration ?? 900)

    if (n.snow) this.ui.snow(n.snow)

    if (n.string != null) this.ui.showString(n.string)

    if (n.curtain != null) await this.ui.curtain(n.curtain, n.curtainMs ?? 800)

    if (n.blackout != null) await this.ui.curtain(n.blackout, n.blackoutMs ?? 800)

    if (n.letterbox != null) this.stage.letterbox(!!n.letterbox)

    if (n.fx) {
      if (n.fx === 'cold') this.ui.flash('cold')
      if (n.fx === 'warm') this.ui.flash('warm')
      if (n.fx === 'shake') this.stage.shake(360, 0.009)
      if (n.fx === 'punch') this.stage.punch()
    }

    if (n.flashText) await this.ui.flashText(n.flashText, n.kind || 'cold', n.hold || 1500)

    if (n.pause) await this.ui.pause(n.pause)

    if (n.imp) this._grantImpression(n.imp)

    if (n.tension != null) this._addTension(n.tension, n.tensionKind)

    if (n.crit != null) await this._crit(n.crit)

    // --- portraits ---
    if (n.bust) {
      this.ui.setBust(n.bust.id, n.bust.key, n.bust.side || 'center', { dim: n.bust.dim })
      if (n.bust.dim) this.ui.dimBusts(n.bust.id)
    }
    if (n.clearBusts) this.ui.clearBusts()

    // --- card ---
    if (n.card) await this.ui.chapterCard(n.card)

    // --- text ---
    if (n.narr != null) {
      this._log(null, n.narr)
      await this.ui.say({ text: n.narr, style: 'narration' })
      return null
    }
    if (n.thought != null) {
      this._log('路特', n.thought)
      await this.ui.say({ name: '路特', text: n.thought, style: 'small' })
      return null
    }
    if (n.say) {
      const name = n.say.name || null
      this._log(name, n.say.text)
      await this.ui.say({
        name,
        text: n.say.text,
        style: n.say.style || (name ? 'voice' : 'narration'),
        speed: n.say.speed ?? 24,
      })
      return null
    }

    // --- silence beat: the player can press, but nothing answers ---
    if (n.silence) {
      const times = n.silence.clicks || 5
      for (let k = 0; k < times; k++) {
        this.ui.whisper(n.silence.hint || '')
        await this.ui.beat({ showDialog: false })
      }
      this.ui.whisper('')
      return null
    }

    // --- choice ---
    if (n.choice || n.question) {
      // Two authoring shorthands:
      //   { question: '提示语', options: [...] }      // question is the PROMPT STRING,
      //   { choice: { head, options: [...] } }        // options is its SIBLING key
      // They are not interchangeable objects — normalise explicitly.
      const useQuestion = n.question != null && !n.choice
      const head = useQuestion
        ? (typeof n.question === 'string' ? n.question : (n.question.head || ''))
        : (n.choice.head || '')
      const opts = (useQuestion ? n.options : n.choice.options) || []
      if (!opts.length) {
        console.error('[Director] choice node has no options — story would stall', n)
        return null
      }
      const idx = await this.ui.choices(opts, { head })
      const chosen = opts[idx]
      return await this._applyChoice(chosen)
    }

    // --- walk segment ---
    if (n.walk) { await this._runWalk(n.walk); return null }

    // --- mini games ---
    if (n.letterGame) { await this._runLetter(n.letterGame); return null }
    if (n.sevenDays) { await this.ui.sevenDays(n.sevenDays); return null }
    if (n.finalChoice) {
      const id = await this.ui.finalChoice(n.finalChoice)
      this.state.finale = id
      return null
    }

    // --- flow ---
    if (n.label) return null
    if (n.goto) {
      const t = this._labels.get(n.goto)
      return t != null ? t : null
    }
    if (n.end) return 1e9   // stops the chapter loop

    return null
  }

  /* ================================================================== *
   *  choices / tension
   * ================================================================== */

  async _applyChoice(opt) {
    if (!opt) return null
    if (opt.imp) this._grantImpression(opt.imp)
    const kind = opt.costKind === 'lean' ? 'lean' : (opt.costKind === 'pull' ? 'lean' : 'retreat')
    if (kind === 'lean') this.state.lean += 1
    else this.state.retreat += 1
    // the log records the choice itself so 回想 shows what the player did
    this._log(null, `—— ${opt.text}`)
    if (opt.tension) this._addTension(opt.tension, kind)
    if (opt.then) await this._runSequence(opt.then)
    if (opt.goto) {
      const t = this._labels.get(opt.goto)
      return t != null ? t : null
    }
    return null
  }

  _addTension(delta, kind) {
    const v = Math.max(0, Math.min(1.18, this.state.tension + delta / 100))
    this.state.tension = v
    this.state.peak = Math.max(this.state.peak, v)
    this.ui.showString(true)
    this.ui.setTension(Math.min(1, v))
    if (kind === 'lean') this.ui.toast(`弦紧了一点`, 900)
    else if (kind === 'retreat') this.ui.toast(`弦紧了一点`, 900)
  }

  /** 临界：断裂 或 触底反弹 */
  async _crit(kind) {
    const lean = kind === true ? (this.state.lean > this.state.retreat ? 'cold' : 'warm') : kind
    this.ui.showString(true)
    this.ui.setTension(1)
    await this.ui.pause(420)
    if (lean === 'cold') {
      this.stage.punch(1.05, 200)
      this.stage.shake(460, 0.013)
      this.ui.flash('cold')
      await this.ui.flashText('断 裂', 'cold', 1500)
      this.ui.setTension(0.30)
    } else {
      this.stage.punch(0.975, 460)
      this.ui.flash('warm')
      await this.ui.flashText('触 底 反 弹', 'warm', 1700)
      this.ui.setTension(0.62)
    }
    await this.ui.pause(260)
  }

  _grantImpression(id) {
    if (!id) return
    const def = IMPRESSIONS.find((x) => x.id === id)
    const known = this.state.impressions.includes(id)
    if (!known) this.state.impressions.push(id)
    // 留印 persist across playthroughs — several only exist on one branch, so
    // the collection is meant to be completed over more than one run.
    const coll = this._collection()
    if (!coll.has(id)) {
      coll.add(id)
      this._saveCollection(coll)
    }
    if (!known) this.ui.toast(`留印 · ${def ? def.title : id}`, 2100)
    this._save()
  }

  _collection() {
    try {
      const raw = localStorage.getItem(COLLECTION_KEY)
      return new Set(raw ? JSON.parse(raw) : [])
    } catch (e) { return new Set() }
  }

  _saveCollection(set) {
    try { localStorage.setItem(COLLECTION_KEY, JSON.stringify([...set])) } catch (e) { /* noop */ }
  }

  /* ================================================================== *
   *  walk segment
   * ================================================================== */

  async _runWalk(cfg) {
    this.ui.hideDialog()
    this.ui.showString(false)
    this.ui.whisper('')
    this._walkQueue = []
    this._walkSeq = (this._walkSeq || 0) + 1
    this.mode = 'walk'
    const w = this.stage.spawnWalker(cfg)
    w.setHotspots(cfg.hotspots || [])

    const exit = cfg.doneWhen !== 'all'

    for (;;) {
      await new Promise((r) => setTimeout(r, 90))
      if (this._abort) break
      if (this._walkQueue.length) {
        const h = this._walkQueue.shift()
        this.mode = 'story'
        this.ui.whisper('')
        await this._runSequence(h.then || [])
        this.stage.walker?.markHotspotDone(h.id)
        this.mode = 'walk'
        continue
      }
      if (!exit && w.allHotspotsDone()) break
      if (exit && cfg.exitAt && w.sprite) {
        const d = Math.hypot(cfg.exitAt.x - w.sprite.x, cfg.exitAt.y - w.sprite.y)
        if (d <= (cfg.exitAt.r || 70)) break
      }
    }

    this.ui.whisper('')
    this.stage.despawnWalker()
    this.mode = 'story'
  }

  /* ================================================================== *
   *  letter mini-game epilogue
   * ================================================================== */

  async _runLetter(spec) {
    const picked = await this.ui.letterGame(spec)
    const canon = picked.filter((id) => {
      const p = spec.pool.find((x) => x.id === id)
      return p && p.canon
    }).length
    this.state.letterCanon = canon
    await this.ui.pause(400)
    if (canon === 5) {
      await this.ui.say({ text: '最后寄出去的那一版，就是这五行。', style: 'narration' })
    } else if (canon >= 3) {
      await this.ui.say({ text: '有几行，她最后还是划掉了，换成了别的。', style: 'narration' })
      await this.ui.say({ text: '划得不够彻底，还是能隐约看出原来的笔画。', style: 'narration' })
    } else {
      await this.ui.say({ text: '寄出去的那一版，和她想写的差得很远。', style: 'narration' })
      await this.ui.say({ text: '她自己也说不清，为什么会改成这样。', style: 'narration' })
    }
  }

  /* ================================================================== *
   *  epilogue + stats
   * ================================================================== */

  async _epilogue() {
    const fin = FINALES[this.state.finale] || FINALES.keep
    this.mode = 'story'
    await this.ui.curtain(true, 900)
    await this.stage.setBackground(fin.bg, { immediate: true })
    this.ui.clearBusts()
    this.ui.showString(false)
    this.ui.snow(this.state.finale === 'return' ? 'on' : 'heavy')
    await this.ui.curtain(false, 900)
    await this._runSequence(fin.lines.map((l) => ({ narr: l.narr })))

    // both branches land on the same last image: the footprints in the snow
    // and a door that closes behind him.
    await this.ui.curtain(true, 900)
    await this.stage.setBackground(CLOSING.bg, { immediate: true })
    this.ui.snow('on')
    await this.ui.curtain(false, 1100)
    await this._runSequence(CLOSING.lines.map((l) => ({ narr: l.narr })))
    await this.ui.curtain(true, 1400)

    const total = IMPRESSIONS.length
    await this.ui.statsPanel({
      rows: [
        { k: '本周目拾起', v: `${this.state.impressions.length}`, unit: `/ ${total}` },
        { k: '累计收藏', v: `${this._collection().size}`, unit: `/ ${total}` },
        { k: '弦 的 峰 值', v: `${Math.round(this.state.peak * 100)}`, unit: '%' },
        { k: '伸 手', v: `${this.state.lean}`, unit: '次' },
        { k: '退 开', v: `${this.state.retreat}`, unit: '次' },
        { k: '寄 出 的 信', v: this.state.letterCanon === 5 ? '五行' : `${this.state.letterCanon} / 5 行`, unit: '' },
        { k: '十 字 架', v: this.state.finale === 'return' ? '还 回 去 了' : '留 在 手 里', unit: '' },
      ],
      quote: '在阿尔镇上广为流传的爱情故事一共有一百二十七个。<br>其中一百一十个是悲情结尾。<br>而这一次，你是裁判，也是当事人。',
    })
    this._clearSave()
    await this.ui.curtain(true, 1200)
    this._resetState()
    await this._titleLoop()
  }

  async _toTitle() {
    this._abort = false
    this.stage.despawnWalker()
    this.ui.hideDialog()
    this.ui.clearBusts()
    this.ui.showString(false)
    this.ui.showPauseButton(false)
    await this.ui.curtain(true, 700)
    await this._titleLoop()
  }

  /* ================================================================== *
   *  pause
   * ================================================================== */

  async _openPause() {
    if (this._paused || this.mode === 'idle') return
    if (this.ui.showingTitle()) return
    if (this.ui._overlays.length && this.ui._overlays.some((o) => o.classList.contains('vn-overlay'))) {
      // another overlay already owns the screen (menu / mini-game): ignore
      if (!this._menuActive) return
    }
    this._paused = true
    this._menuActive = true
    for (;;) {
      const a = await this.ui.menu({
        title: '雪 还 在 下',
        items: [
          { id: 'resume', label: '继 续' },
          { id: 'history', label: '回 想' },
          {
            id: 'impressions',
            label: '留 印',
            sub: `已拾起 ${this._collection().size} / ${IMPRESSIONS.length}`,
          },
          { id: 'title', label: '回 标 题' },
        ],
      })
      if (a === 'history') { await this.ui.history(this.state.history.slice(-90)); continue }
      if (a === 'impressions') {
        await this.ui.impressions({ list: IMPRESSIONS, owned: this._collection() })
        continue
      }
      if (a === 'title') { this._abort = true; this.ui.press(); break }
      break
    }
    this._menuActive = false
    this._paused = false
  }

  /* ================================================================== *
   *  log / save
   * ================================================================== */

  _log(name, text) {
    this.state.history.push({ name, text })
    if (this.state.history.length > HISTORY_CAP) {
      this.state.history = this.state.history.slice(-HISTORY_CAP)
    }
  }

  _save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        chapter: this.state.chapter,
        node: this.state.node,
        tension: this.state.tension,
        peak: this.state.peak,
        lean: this.state.lean,
        retreat: this.state.retreat,
        impressions: this.state.impressions,
        history: this.state.history.slice(-90),
        finale: this.state.finale,
        letterCanon: this.state.letterCanon,
        at: Date.now(),
      }))
    } catch (e) { /* storage unavailable — game still playable */ }
  }

  _loadRaw() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const v = JSON.parse(raw)
      if (!v || typeof v.chapter !== 'number') return null
      return v
    } catch (e) { return null }
  }

  _clearSave() {
    try { localStorage.removeItem(SAVE_KEY) } catch (e) { /* noop */ }
  }

  /* ================================================================== *
   *  test hook — headless playthrough driver
   * ================================================================== */

  /**
   * Auto-advance dialogue and auto-pick choices. Used by the Runtime API
   * smoke test to walk all nine chapters without a human at the keyboard.
   * @param {boolean} on
   * @param {{pick?: number, delay?: number}} [opts]
   */
  setAuto(on, { pick = 0, delay = 90, stopAtChoice = false, stopAtWalk = false } = {}) {
    this._auto = on ? { pick, delay, stopAtChoice, stopAtWalk } : null
    if (on) this._autoTick()
  }

  _autoTick() {
    if (!this._auto) return
    setTimeout(() => {
      if (!this._auto) return
      if (this._abort || this.mode === 'idle') { this._autoTick(); return }

      // walk segments need legs, not just a confirm press
      if (this.mode === 'walk') {
        const w = this.stage.walker
        if (w) {
          if (this._auto.stopAtWalk && this._autoParkedWalk !== this._walkSeq && !this._walkQueue.length && !w._arrive) {
            this._autoParkedWalk = this._walkSeq
            this._auto = null
            return   // park on the first frame of the walk
          }
          const hs = w.activeHotspot()
          if (hs) {
            if (!this._walkQueue.some((q) => q.id === hs.id)) this._walkQueue.push(hs)
          } else if (!w._arrive) {
            const next = (w.hotspots || []).find((h) => !w._hotspotHit.has(h.id))
            if (next) w.moveTo(next.x, next.y + 26)
          }
        }
        this._autoTick()
        return
      }

      const w = this.ui._waiter
      if (w) {
        if (w.kind === 'choice') {
          if (this._auto.stopAtChoice) { this._auto = null; return }
          const n = Math.min(this._auto.pick, this.ui._choiceNodes.length - 1)
          this.ui._choiceCursor = Math.max(0, n)
          this.ui.press()
        } else if (w.kind === 'days') {
          w.onPress?.()
        } else {
          this.ui.press()
        }
      } else {
        this._autoOverlay()
      }
      this._autoTick()
    }, this._auto.delay)
  }

  _autoOverlay() {
    const ov = this.ui._overlays[this.ui._overlays.length - 1]
    if (!ov) return
    const fire = (el) => el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    // five-line letter: fill to quota, then post
    const send = ov.querySelector('.send')
    if (send) {
      if (send.disabled) {
        const free = [...ov.querySelectorAll('.vn-line:not(.picked)')]
        const need = parseInt(ov.querySelector('.count')?.textContent.match(/\/\s*(\d+)/)?.[1] || '5', 10)
        const taken = ov.querySelectorAll('.vn-line.picked').length
        free.slice(0, Math.max(0, need - taken)).forEach(fire)
      } else {
        fire(ov.querySelector('.send'))
      }
      return
    }
    // seven days / stats / history / impressions / final choice
    fire(ov.querySelector('.foot .vn-lbtn'))
    fire(ov.querySelector('.vn-final .vn-btn'))
    fire(ov.querySelector('.vn-panel .vn-btn'))
    fire(ov.querySelector('.vn-lbtn'))
  }

  /** Jump straight to a chapter start (test hook). */
  debugGoto(chapterIndex) {
    this.state.chapter = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex))
    this.state.node = 0
  }

  /* ================================================================== *
   *  runtime state (Runtime API snapshots)
   * ================================================================== */

  runtimeState() {
    return {
      mode: this.mode,
      paused: this._paused,
      chapter: this.state.chapter,
      chapterId: CHAPTERS[this.state.chapter]?.id ?? null,
      node: this.state.node,
      tension: Number(this.state.tension.toFixed(3)),
      lean: this.state.lean,
      retreat: this.state.retreat,
      impressions: this.state.impressions.length,
      finale: this.state.finale,
      title: this.ui?.showingTitle() ?? false,
      waiter: this.ui?._waiter?.kind ?? null,
      walkSeq: this._walkSeq || 0,
      walker: this.stage?.walker?.runtimeState() ?? null,
      busts: Object.keys(this.ui?.bustNodes || {}),
    }
  }
}
